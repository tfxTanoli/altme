
'use client';

import * as React from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, where, writeBatch, doc, getDoc } from 'firebase/firestore';
import type { ChatRoom, User } from '@/lib/types';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader, MessageSquare, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatView } from '@/components/chat/chat-view';
import { Input } from '@/components/ui/input';

const ChatListItem = React.memo(({ chatRoom, partners, isActive }: { chatRoom: ChatRoom; partners: User[], isActive: boolean }) => {
    
    const partnerNames = partners.map(p => p.name).join(', ');

    // For unified chats, the ID is the participant pair key
    const chatIdentifier = chatRoom.id;

    return (
        <Link href={`/admin/chats?chatId=${chatIdentifier}`} className="block" scroll={false}>
            <div className={cn(
                "flex items-start gap-4 rounded-lg p-3 transition-colors",
                 isActive ? "bg-muted" : "hover:bg-muted/50"
            )}>
                <div className="flex -space-x-4 rtl:space-x-reverse">
                    {partners.slice(0, 2).map(p => (
                         <Avatar key={p.id} className="h-10 w-10 border-2 border-background">
                            <AvatarImage src={p.photoURL} alt={p.name} />
                            <AvatarFallback>{p.name?.charAt(0) || '?'}</AvatarFallback>
                        </Avatar>
                    ))}
                    {partners.length > 2 && (
                         <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground">
                            +{partners.length - 2}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                        <p className="truncate font-semibold">{partnerNames}</p>
                        <p className="text-xs text-muted-foreground">
                            {chatRoom.lastMessage?.timestamp
                                ? formatDistanceToNow(chatRoom.lastMessage.timestamp.toDate(), { addSuffix: true })
                                : ''}
                        </p>
                    </div>
                     <p className="truncate text-sm text-muted-foreground">
                        {chatRoom.lastMessage?.text || 'No messages yet'}
                    </p>
                </div>
            </div>
        </Link>
    );
});
ChatListItem.displayName = 'ChatListItem';


export default function AdminChatsPage() {
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeChatId = searchParams.get('chatId');

    const [unifiedChatRooms, setUnifiedChatRooms] = React.useState<ChatRoom[]>([]);
    const [usersMap, setUsersMap] = React.useState<Map<string, User>>(new Map());
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');

    // Fetch all chat rooms and unify them
    React.useEffect(() => {
        if (!firestore) return;

        const chatRoomsQuery = query(collection(firestore, 'chatRooms'), orderBy('lastMessage.timestamp', 'desc'));

        const unsubscribe = onSnapshot(chatRoomsQuery, async (snapshot) => {
            setIsLoading(true);
            const allRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom));
            
            // 1. Fetch all users first
            const allParticipantIds = allRooms.flatMap(room => room.participantIds);
            const uniqueParticipantIds = [...new Set(allParticipantIds)];
            
            const newUsersMap = new Map<string, User>();
            if (uniqueParticipantIds.length > 0) {
                const userChunks: string[][] = [];
                for (let i = 0; i < uniqueParticipantIds.length; i += 30) {
                    userChunks.push(uniqueParticipantIds.slice(i, i + 30));
                }

                await Promise.all(userChunks.map(async chunk => {
                    if (chunk.length === 0) return;
                    try {
                        const usersQuery = query(collection(firestore, 'users'), where('__name__', 'in', chunk));
                        const usersSnapshot = await getDocs(usersQuery);
                        usersSnapshot.forEach(doc => {
                            newUsersMap.set(doc.id, { id: doc.id, ...doc.data() } as User);
                        });
                    } catch(e) {
                        console.error("Error fetching users chunk", e);
                    }
                }));
                setUsersMap(newUsersMap);
            }

            // 2. Process rooms after users are fetched
            const roomsWithMessages = allRooms.filter(room => !!room.lastMessage);
            const groupedRooms = new Map<string, ChatRoom[]>();

            for (const room of roomsWithMessages) {
                const pairKey = room.participantIds.sort().join('-');
                if (!groupedRooms.has(pairKey)) {
                    groupedRooms.set(pairKey, []);
                }
                groupedRooms.get(pairKey)!.push(room);
            }
            
            const unifiedRooms: ChatRoom[] = [];
            for (const [pairKey, roomsInGroup] of groupedRooms.entries()) {
                const latestRoom = roomsInGroup.reduce((latest, current) => {
                    if (!latest.lastMessage?.timestamp || (current.lastMessage?.timestamp && current.lastMessage.timestamp > latest.lastMessage.timestamp)) {
                        return current;
                    }
                    return latest;
                }, roomsInGroup[0]);

                unifiedRooms.push({
                    id: pairKey, 
                    participantIds: latestRoom.participantIds,
                    user1Id: latestRoom.user1Id,
                    user2Id: latestRoom.user2Id,
                    lastMessage: latestRoom.lastMessage,
                    isProjectChat: false, 
                    isUnified: true,
                    sourceRoomIds: roomsInGroup.map(r => r.id),
                });
            }

            unifiedRooms.sort((a, b) => (b.lastMessage?.timestamp?.toMillis() || 0) - (a.lastMessage?.timestamp?.toMillis() || 0));
            setUnifiedChatRooms(unifiedRooms);
            setIsLoading(false);
            
        }, (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'chatRooms', operation: 'list'}));
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firestore]);


    const filteredChatRooms = React.useMemo(() => {
        if (!searchQuery) return unifiedChatRooms;
        
        return unifiedChatRooms.filter(room => {
            const partnerNames = room.participantIds
                .map(id => usersMap.get(id)?.name || '')
                .join(' ');
            return partnerNames.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [unifiedChatRooms, searchQuery, usersMap]);


    const activeChatRoom = React.useMemo(() => {
        if (activeChatId) {
            return unifiedChatRooms.find(room => room.id === activeChatId) || null;
        }
        return null;
    }, [activeChatId, unifiedChatRooms]);

    const activeChatPartners = React.useMemo(() => {
        if (!activeChatRoom) return [];
        return activeChatRoom.participantIds
            .map(id => usersMap.get(id))
            .filter((user): user is User => !!user);
    }, [activeChatRoom, usersMap]);


    return (
        <main className="flex flex-1 flex-col p-4 md:p-0">
            <div className="grid h-full flex-1 md:grid-cols-[400px_1fr]">
                <div className="hidden flex-col border-r md:flex">
                     <div className="p-4 space-y-4">
                        <h1 className="font-semibold text-lg md:text-2xl">All Chats</h1>
                         <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                type="search" 
                                placeholder="Search by name..." 
                                className="pl-8 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                     {isLoading ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader className="h-6 w-6 animate-spin" />
                        </div>
                    ) : filteredChatRooms.length > 0 ? (
                        <div className="flex-1 overflow-y-auto">
                            {filteredChatRooms.map(room => {
                                const partners = room.participantIds
                                    .map(id => usersMap.get(id))
                                    .filter((u): u is User => !!u);
                                
                                return (
                                    <ChatListItem 
                                        key={room.id} 
                                        chatRoom={room} 
                                        partners={partners} 
                                        isActive={room.id === activeChatId}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex-1 p-4 text-center text-sm text-muted-foreground">
                            {searchQuery ? `No results for "${searchQuery}"` : 'No conversations have been started yet.'}
                        </div>
                    )}
                </div>
                 <div className="flex flex-col">
                    {activeChatRoom && activeChatPartners.length > 0 ? (
                        <ChatView 
                            partners={activeChatPartners} 
                            chatRoom={activeChatRoom}
                            allUsersMap={usersMap}
                        />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                             {isLoading ? (
                                <>
                                 <Loader className="h-8 w-8 animate-spin" />
                                 <p>Loading conversations...</p>
                                </>
                            ) : (
                                <>
                                 <MessageSquare className="h-16 w-16 text-muted-foreground/50" />
                                 <h2 className="text-2xl font-semibold">Select a conversation</h2>
                                 <p className="text-muted-foreground">Choose a conversation from the list to view the messages.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
