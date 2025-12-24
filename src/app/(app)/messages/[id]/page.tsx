

'use client';

import * as React from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, initializeFirebase } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { getDatabase, ref, get } from 'firebase/database';
import type { ChatRoom, User } from '@/lib/types';
import { Loader, MessageSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChatView } from '@/components/chat/chat-view';
import { ChatList } from '@/components/chat/chat-list';

export default function MessagesPage({ params, searchParams }: { params: { id: string }, searchParams: { partnerId?: string } }) {
    const firestore = useFirestore();
    const { user: currentUser } = useUser();
    const router = useRouter();

    const [chatRooms, setChatRooms] = React.useState<ChatRoom[]>([]);
    const [usersMap, setUsersMap] = React.useState<Map<string, User>>(new Map());
    const [isLoading, setIsLoading] = React.useState(true);
    const [activeChatRoom, setActiveChatRoom] = React.useState<ChatRoom | null>(null);

    // For "new" chats
    const [tempPartner, setTempPartner] = React.useState<User | null>(null);

    const activeChatRoomId = params.id;
    const newPartnerId = searchParams?.partnerId;

    // Fetch all chat rooms and users for the list
    React.useEffect(() => {
        if (!currentUser || !firestore) {
            if (!currentUser) setIsLoading(false);
            return;
        };

        const chatRoomsQuery = query(
            collection(firestore, 'chatRooms'),
            where('participantIds', 'array-contains', currentUser.uid),
            where('isProjectChat', '==', false)
        );

        const unsubscribe = onSnapshot(chatRoomsQuery, async (snapshot) => {
            const allRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom));
            const rooms = allRooms; // Show all, even empty
            rooms.sort((a, b) => (b.lastMessage?.timestamp?.toMillis() || 0) - (a.lastMessage?.timestamp?.toMillis() || 0));
            setChatRooms(rooms);

            if (rooms.length > 0) {
                const partnerIds = new Set(rooms.map(room => room.participantIds.find(id => id !== currentUser.uid)).filter(Boolean) as string[]);

                const newUsersMap = new Map(usersMap);
                const idsToFetch = Array.from(partnerIds).filter(id => !newUsersMap.has(id));

                if (idsToFetch.length > 0) {
                    const { database } = initializeFirebase();
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
    }, [currentUser, firestore]);

    // Handle fetching the specific active chat room and its participants
    React.useEffect(() => {
        if (!currentUser || !firestore) return;

        if (activeChatRoomId === 'new') {
            if (newPartnerId && !tempPartner) {
                const fetchPartner = async () => {
                    const { database } = initializeFirebase();
                    const userRef = ref(database, `users/${newPartnerId}`);
                    try {
                        const snapshot = await get(userRef);
                        if (snapshot.exists()) {
                            const userData = { id: newPartnerId, ...snapshot.val() } as User;
                            setTempPartner(userData);
                            const newMap = new Map(usersMap);
                            newMap.set(newPartnerId, userData);
                            setUsersMap(newMap);
                        }
                    } catch (err) {
                        console.error("Error fetching partner", err);
                    }
                };
                fetchPartner();
            }
            return;
        }

        const roomRef = doc(firestore, 'chatRooms', activeChatRoomId);
        const unsubscribe = onSnapshot(roomRef, async (docSnap) => {
            if (docSnap.exists()) {
                const room = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
                if (room.isProjectChat) {
                    router.push(`/requests/${room.requestId}`);
                    return;
                }

                setActiveChatRoom(room);

                const partnerId = room.participantIds.find(id => id !== currentUser.uid);
                if (partnerId) {
                    if (!usersMap.has(partnerId)) {
                        const { database } = initializeFirebase();
                        const userRef = ref(database, `users/${partnerId}`);
                        try {
                            const snapshot = await get(userRef);
                            if (snapshot.exists()) {
                                const userData = { id: partnerId, ...snapshot.val() } as User;
                                setUsersMap(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(partnerId, userData);
                                    return newMap;
                                });
                            }
                        } catch (err) {
                            console.error("Error fetching partner", err);
                        }
                    }
                }

                // Mark messages as read
                if (room.hasUnreadMessages && room.hasUnreadMessages[currentUser.uid]) {
                    const batch = writeBatch(firestore);
                    batch.update(roomRef, { [`hasUnreadMessages.${currentUser.uid}`]: false });
                    await batch.commit();
                }

            } else {
                router.push('/messages'); // Room doesn't exist or user doesn't have access
            }
        }, (error) => {
            console.error("Error fetching active chat room:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `chatRooms/${activeChatRoomId}`,
                operation: 'get',
            }));
        });

        return () => unsubscribe();
    }, [activeChatRoomId, currentUser, firestore, router, newPartnerId, usersMap]); // dependencies adjusted


    const partner = React.useMemo(() => {
        if (activeChatRoomId === 'new') return tempPartner;
        if (!activeChatRoom || !currentUser) return null;
        const partnerId = activeChatRoom.participantIds.find(id => id !== currentUser.uid);
        return partnerId ? usersMap.get(partnerId) ?? null : null;
    }, [activeChatRoom, currentUser, usersMap, activeChatRoomId, tempPartner]);

    // Construct a temporary chat room object for new chats
    const currentChatRoom = React.useMemo(() => {
        if (activeChatRoomId === 'new' && currentUser && tempPartner) {
            return {
                id: 'new',
                participantIds: [currentUser.uid, tempPartner.id],
                user1Id: currentUser.uid,
                user2Id: tempPartner.id,
                isProjectChat: false,
            } as ChatRoom;
        }
        return activeChatRoom;
    }, [activeChatRoomId, activeChatRoom, currentUser, tempPartner]);


    return (
        <main className="flex flex-1 flex-col p-4 md:p-0">
            <div className="grid h-full flex-1 md:grid-cols-[300px_1fr]">
                <div className="hidden flex-col border-r md:flex">
                    <ChatList
                        chatRooms={chatRooms}
                        usersMap={usersMap}
                        activeChatRoomId={activeChatRoomId}
                        currentUserId={currentUser?.uid}
                    />
                </div>
                <div className="flex flex-col">
                    {partner && currentChatRoom ? (
                        <ChatView partner={partner} chatRoom={currentChatRoom} allUsersMap={usersMap} />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                            {isLoading && activeChatRoomId !== 'new' ? (
                                <>
                                    <Loader className="h-8 w-8 animate-spin" />
                                    <p>Loading conversation...</p>
                                </>
                            ) : activeChatRoomId === 'new' && !partner ? (
                                <>
                                    <Loader className="h-8 w-8 animate-spin" />
                                    <p>Loading recipient...</p>
                                </>
                            ) : (
                                <>
                                    <MessageSquare className="h-16 w-16 text-muted-foreground/50" />
                                    <h2 className="text-2xl font-semibold">Select a conversation</h2>
                                    <p className="text-muted-foreground">Choose one of your existing conversations to get started.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
