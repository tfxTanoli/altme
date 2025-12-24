

'use client';

import * as React from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import type { ChatRoom, User } from '@/lib/types';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader, MessageSquare, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter, usePathname } from 'next/navigation';
import { ChatView } from '@/components/chat/chat-view';
import { Input } from '@/components/ui/input';

const ChatListItem = ({ chatRoom, partner, isActive }: { chatRoom: ChatRoom; partner: User, isActive: boolean }) => {
    const { user } = useUser();
    const hasUnread = user && chatRoom.hasUnreadMessages && chatRoom.hasUnreadMessages[user.uid];

    return (
        <Link href={`/messages/${chatRoom.id}`} className="block">
            <div className={cn(
                "flex items-start gap-4 rounded-lg p-3 transition-colors",
                 isActive ? "bg-muted" : "hover:bg-muted/50"
            )}>
                <Avatar className="h-10 w-10 border">
                    <AvatarImage src={partner.photoURL} alt={partner.name} />
                    <AvatarFallback>{partner?.name?.charAt(0) || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                        <p className="truncate font-semibold">{partner.name}</p>
                        <div className="flex items-center gap-2">
                             {hasUnread && (
                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                            )}
                            <p className="text-xs text-muted-foreground">
                                {chatRoom.lastMessage?.timestamp
                                    ? formatDistanceToNow(chatRoom.lastMessage.timestamp.toDate(), { addSuffix: true })
                                    : ''}
                            </p>
                        </div>
                    </div>
                     <p className={cn(
                        "truncate text-sm",
                        hasUnread ? "font-bold text-foreground" : "text-muted-foreground"
                    )}>
                        {chatRoom.lastMessage?.text || 'No messages yet'}
                    </p>
                </div>
            </div>
        </Link>
    );
};

const ChatList = ({ chatRooms, usersMap, activeChatRoomId, currentUser }: { chatRooms: ChatRoom[], usersMap: Map<string, User>, activeChatRoomId?: string, currentUser?: User | null }) => {
    const [searchQuery, setSearchQuery] = React.useState('');

    const filteredChatRooms = React.useMemo(() => {
        if (!searchQuery) return chatRooms;
        
        return chatRooms.filter(room => {
            const partnerId = room.participantIds.find(id => id !== currentUser?.uid);
            const partner = partnerId ? usersMap.get(partnerId) : undefined;
            return partner?.name.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [chatRooms, searchQuery, currentUser, usersMap]);


    return (
        <div className="flex flex-col">
             <div className="p-4 space-y-4">
                <h1 className="font-semibold text-lg md:text-2xl">Messages</h1>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        type="search" 
                        placeholder="Search conversations..." 
                        className="pl-8 h-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
            {filteredChatRooms.length > 0 ? (
                <div className="flex-1 overflow-y-auto">
                    {filteredChatRooms.map(room => {
                        const partnerId = room.participantIds.find(id => id !== currentUser?.uid);
                        const partner = partnerId ? usersMap.get(partnerId) : undefined;
                        if (!partner) return null;
                        return <ChatListItem key={room.id} chatRoom={room} partner={partner} isActive={room.id === activeChatRoomId}/>
                    })}
                </div>
            ) : (
                <div className="flex-1 p-4 text-center text-sm text-muted-foreground">
                    {searchQuery ? `No results for "${searchQuery}"` : 'No conversations yet.'}
                </div>
            )}
        </div>
    );
};

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
            const rooms = allRooms.filter(room => room.lastMessage);
            rooms.sort((a, b) => (b.lastMessage?.timestamp?.toMillis() || 0) - (a.lastMessage?.timestamp?.toMillis() || 0));
            setChatRooms(rooms);

            if (rooms.length > 0) {
                const partnerIds = new Set(rooms.map(room => room.participantIds.find(id => id !== currentUser.uid)).filter(Boolean) as string[]);
                
                const newUsersMap = new Map(usersMap);
                const idsToFetch = Array.from(partnerIds).filter(id => !newUsersMap.has(id));

                if (idsToFetch.length > 0) {
                     const usersQuery = query(collection(firestore, 'users'), where('__name__', 'in', idsToFetch));
                     const usersSnapshot = await getDocs(usersQuery);
                     usersSnapshot.forEach(doc => {
                         newUsersMap.set(doc.id, { id: doc.id, ...doc.data() } as User);
                     });
                     setUsersMap(newUsersMap);
                }
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error listening to chat rooms:", error);
            if(!error.message.includes('requires an index')) {
                 errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'chatRooms',
                    operation: 'list',
                }));
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, firestore, usersMap]);
    
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
            <div className="md:hidden">
                 <ChatList 
                    chatRooms={chatRooms}
                    usersMap={usersMap}
                    activeChatRoomId={activeChatRoomId}
                    currentUser={currentUser}
                />
            </div>
            
            {/* Desktop View: Grid layout */}
            <div className="hidden h-full flex-1 md:grid md:grid-cols-[300px_1fr]">
                <div className="flex-col border-r flex">
                    <ChatList 
                        chatRooms={chatRooms}
                        usersMap={usersMap}
                        activeChatRoomId={activeChatRoomId}
                        currentUser={currentUser}
                    />
                </div>
                 <div className="flex flex-col">
                   <div className="flex h-full flex-col">
                        {activePartner && activeChatRoom ? (
                            <ChatView partner={activePartner} chatRoom={activeChatRoom} allUsersMap={usersMap}/>
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
