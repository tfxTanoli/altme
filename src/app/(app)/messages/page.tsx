

'use client';

import * as React from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, initializeFirebase } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { getDatabase, ref, get } from 'firebase/database';
import type { ChatRoom, User } from '@/lib/types';
import { Loader, MessageSquare } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { ChatView } from '@/components/chat/chat-view';
import { ChatList } from '@/components/chat/chat-list';

export default function MessagesPage({ params }: { params: { id?: string } }) {
    const firestore = useFirestore();
    const { user: currentUser } = useUser();
    const [chatRooms, setChatRooms] = React.useState<ChatRoom[]>([]);
    const [usersMap, setUsersMap] = React.useState<Map<string, User>>(new Map());
    const [isLoading, setIsLoading] = React.useState(true);

    const pathname = usePathname();
    const activeChatRoomId = pathname.split('/')[2];

    const activeChatRoom = React.useMemo(() => {
        return chatRooms.find(r => r.id === activeChatRoomId) || null;
    }, [chatRooms, activeChatRoomId]);

    React.useEffect(() => {
        if (!currentUser || !firestore) {
            setIsLoading(false);
            return;
        };

        const chatRoomsQuery = query(
            collection(firestore, 'chatRooms'),
            where('participantIds', 'array-contains', currentUser.uid),
            where('isProjectChat', '==', false)
        );

        const unsubscribe = onSnapshot(chatRoomsQuery, async (snapshot) => {
            const allRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom));
            // Show all rooms, even empty ones (important for new chats)
            const rooms = allRooms;
            rooms.sort((a, b) => (b.lastMessage?.timestamp?.toMillis() || 0) - (a.lastMessage?.timestamp?.toMillis() || 0));
            setChatRooms(rooms);

            if (rooms.length > 0) {
                const partnerIds = new Set(rooms.map(room => room.participantIds.find(id => id !== currentUser.uid)).filter(Boolean) as string[]);

                const newUsersMap = new Map(usersMap);
                const idsToFetch = Array.from(partnerIds).filter(id => !newUsersMap.has(id));

                if (idsToFetch.length > 0) {
                    const { database } = initializeFirebase();
                    // Fetch users from RTDB instead of Firestore
                    await Promise.all(idsToFetch.map(async (uid) => {
                        const userRef = ref(database, `users/${uid}`);
                        try {
                            const snapshot = await get(userRef);
                            if (snapshot.exists()) {
                                newUsersMap.set(uid, { id: uid, ...snapshot.val() } as User);
                            } else {
                                console.warn(`User ${uid} not found in RTDB`);
                            }
                        } catch (err) {
                            console.error(`Failed to fetch user ${uid} from RTDB`, err);
                        }
                    }));
                    setUsersMap(newUsersMap);
                }
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error listening to chat rooms:", error);
            if (!error.message.includes('requires an index')) {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'chatRooms',
                    operation: 'list',
                }));
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, firestore]); // Removed usersMap from dependency to avoid infinite loop if logic was flawed, though safe here.

    const activePartner = React.useMemo(() => {
        if (!activeChatRoom || !currentUser) return null;
        const partnerId = activeChatRoom.participantIds.find(id => id !== currentUser.uid);
        return partnerId ? usersMap.get(partnerId) ?? null : null;
    }, [activeChatRoom, currentUser, usersMap]);


    if (isLoading) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <Loader className="h-8 w-8 animate-spin" />
            </main>
        );
    }

    return (
        <main className="flex flex-1 flex-col p-4 md:p-0">
            {/* Mobile View: Show only the list */}
            <div className="md:hidden h-full">
                <ChatList
                    chatRooms={chatRooms}
                    usersMap={usersMap}
                    activeChatRoomId={activeChatRoomId}
                    currentUserId={currentUser?.uid}
                />
            </div>

            {/* Desktop View: Grid layout */}
            <div className="hidden h-full flex-1 md:grid md:grid-cols-[300px_1fr]">
                <div className="flex-col border-r flex">
                    <ChatList
                        chatRooms={chatRooms}
                        usersMap={usersMap}
                        activeChatRoomId={activeChatRoomId}
                        currentUserId={currentUser?.uid}
                    />
                </div>
                <div className="flex flex-col">
                    <div className="flex h-full flex-col">
                        {activePartner && activeChatRoom ? (
                            <ChatView partner={activePartner} chatRoom={activeChatRoom} allUsersMap={usersMap} />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                                <MessageSquare className="h-16 w-16 text-muted-foreground/50" />
                                <h2 className="text-2xl font-semibold">Select a conversation</h2>
                                <p className="text-muted-foreground">Choose one of your existing conversations to get started.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
