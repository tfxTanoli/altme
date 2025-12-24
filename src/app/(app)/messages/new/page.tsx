
'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, runTransaction, doc } from 'firebase/firestore';
import type { User, ChatRoom } from '@/lib/types';
import { Loader } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function NewMessagePage() {
    const firestore = useFirestore();
    const { user: currentUser } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    const [status, setStatus] = React.useState('Initializing...');
    const hasRun = React.useRef(false); // Ref to prevent double execution in development

    React.useEffect(() => {
        if (!currentUser || !firestore || hasRun.current) {
            return;
        }

        const recipientId = searchParams.get('recipient');

        if (!recipientId) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No recipient specified.',
            });
            router.push('/messages');
            return;
        }
        
        if (recipientId === currentUser.uid) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'You cannot start a conversation with yourself.',
            });
            router.push('/messages');
            return;
        }

        const findOrCreateChat = async () => {
            setStatus('Finding existing conversation...');
            try {
                // Use a transaction to atomically check for and create a chat room
                const chatRoomId = await runTransaction(firestore, async (transaction) => {
                    const participants = [currentUser.uid, recipientId].sort();
                    const chatQuery = query(
                        collection(firestore, 'chatRooms'),
                        where('isProjectChat', '==', false),
                        where('participantIds', '==', participants)
                    );
                    
                    const chatSnap = await getDocs(chatQuery);

                    if (!chatSnap.empty) {
                        // Conversation already exists, return its ID
                        return chatSnap.docs[0].id;
                    } else {
                        // Conversation doesn't exist, create a new one
                        const newRoomRef = doc(collection(firestore, 'chatRooms'));
                        const newRoomData: Omit<ChatRoom, 'id'> = {
                            participantIds: participants,
                            user1Id: participants[0],
                            user2Id: participants[1],
                            isProjectChat: false,
                            lastMessage: null,
                        };
                        
                        // Use the transaction to set the new document
                        transaction.set(newRoomRef, { ...newRoomData, id: newRoomRef.id });

                        return newRoomRef.id;
                    }
                });

                setStatus('Redirecting to conversation...');
                router.push(`/messages/${chatRoomId}`);

            } catch (error) {
                // The error from runTransaction will be caught here
                 if (error instanceof FirestorePermissionError) {
                    errorEmitter.emit('permission-error', error);
                } else {
                    console.error("Error finding or creating chat:", error);
                    toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: 'Could not start a new conversation. Please check permissions.',
                    });
                }
                router.push('/messages');
            }
        };

        hasRun.current = true;
        findOrCreateChat();

    }, [currentUser, firestore, router, searchParams, toast]);

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Loader className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">{status}</p>
        </div>
    );
}
