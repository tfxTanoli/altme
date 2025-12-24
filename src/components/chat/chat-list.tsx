'use client';

import * as React from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { ChatRoom, User } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface ChatListItemProps {
    chatRoom: ChatRoom;
    partner: User;
    isActive: boolean;
}

const ChatListItem = ({ chatRoom, partner, isActive }: ChatListItemProps) => {
    // We need to know if there are unread messages for the current user.
    // However, to keep this component pure, we rely on the parent or the chatRoom object.
    // The chatRoom object has `hasUnreadMessages` keyed by userId.
    // We don't have the current user ID passed directly here easily unless we drill it,
    // but we can assume the parent logic has verified this or we pass currentUserId.
    // Let's stick to the visual indication based on the object, assuming we can check it.

    // Actually, passing hasUnread as a prop is cleaner, but keeping the original structure for now:
    // We will infer unread status in the parent map or pass `currentUserId` to List and then to Item.

    // For now, let's keep it simple. The original referenced `useUser` inside the item. 
    // It's better to pass currentUserId to avoid hooks in list items if possible, but hooks are fine.
    // To match the new reusable design, let's accept `hasUnread` as a prop or `currentUserId`.
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
                            {/* We will rely on the parent to handle unread logic or passed prop, 
                                 but for now let's just show the dot if we can access the data. 
                                 We'll update this component to take `hasUnread` prop for purity.
                             */}
                            <p className="text-xs text-muted-foreground">
                                {chatRoom.lastMessage?.timestamp
                                    ? formatDistanceToNow(chatRoom.lastMessage.timestamp.toDate(), { addSuffix: true })
                                    : ''}
                            </p>
                        </div>
                    </div>
                    <p className={cn(
                        "truncate text-sm text-muted-foreground"
                    )}>
                        {chatRoom.lastMessage?.text || 'No messages yet'}
                    </p>
                </div>
            </div>
        </Link>
    );
};

interface ChatListProps {
    chatRooms: ChatRoom[];
    usersMap: Map<string, User>;
    activeChatRoomId?: string;
    currentUserId?: string;
}

export const ChatList = ({ chatRooms, usersMap, activeChatRoomId, currentUserId }: ChatListProps) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [photographers, setPhotographers] = React.useState<User[]>([]);
    const [showPhotographers, setShowPhotographers] = React.useState(false);
    const firestore = useFirestore();
    const router = useRouter();

    const filteredChatRooms = React.useMemo(() => {
        if (!searchQuery) return chatRooms;

        return chatRooms.filter(room => {
            const partnerId = room.participantIds.find(id => id !== currentUserId);
            const partner = partnerId ? usersMap.get(partnerId) : undefined;
            return partner?.name.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [chatRooms, searchQuery, currentUserId, usersMap]);

    // Fetch photographers when needing to search for new people
    React.useEffect(() => {
        if (!firestore) return;

        const fetchPhotographers = async () => {
            try {
                // Fetch users who are photographers
                // Note: Indexing might be required for complex queries.
                // For now, let's just get some photographers.
                // If the user base is large, this should be paginated or search-optimized (Algolia/Meili).
                const q = query(
                    collection(firestore, 'users'),
                    where('role', '==', 'photographer'),
                    limit(50)
                );

                const snapshot = await getDocs(q);
                const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
                // Filter out current user if they are a photographer
                setPhotographers(users.filter(u => u.id !== currentUserId));
            } catch (error) {
                console.error("Error fetching photographers:", error);
            }
        };

        fetchPhotographers();
    }, [firestore, currentUserId]);

    const filteredPhotographers = React.useMemo(() => {
        if (!searchQuery) return photographers;
        return photographers.filter(user =>
            user.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [photographers, searchQuery]);

    const handlePhotographerClick = (photographerId: string) => {
        // Check if we already have a chat room with this photographer
        const existingRoom = chatRooms.find(room =>
            room.participantIds.includes(photographerId) && !room.isProjectChat
        );

        if (existingRoom) {
            router.push(`/messages/${existingRoom.id}`);
        } else {
            router.push(`/messages/new?partnerId=${photographerId}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="p-4 space-y-4 border-b">
                <div className="flex items-center justify-between">
                    <h1 className="font-semibold text-lg md:text-2xl">Messages</h1>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search conversations or photographers..."
                        className="pl-8 h-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Existing Chats Section */}
                {filteredChatRooms.length > 0 && (
                    <div className="py-2">
                        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Conversations
                        </div>
                        {filteredChatRooms.map(room => {
                            const partnerId = room.participantIds.find(id => id !== currentUserId);
                            const partner = partnerId ? usersMap.get(partnerId) : undefined;

                            if (!partner) return null;

                            const hasUnread = currentUserId && room.hasUnreadMessages && room.hasUnreadMessages[currentUserId];

                            return (
                                <Link key={room.id} href={`/messages/${room.id}`} className="block">
                                    <div className={cn(
                                        "flex items-start gap-4 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
                                        room.id === activeChatRoomId && "bg-muted"
                                    )}>
                                        <Avatar className="h-10 w-10 border">
                                            <AvatarImage src={partner.photoURL} alt={partner.name} />
                                            <AvatarFallback>{partner?.name?.charAt(0) || '?'}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center justify-between">
                                                <p className="truncate font-semibold text-sm">{partner.name}</p>
                                                {hasUnread && (
                                                    <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                                                )}
                                            </div>
                                            <div className="flex justify-between items-center mt-1">
                                                <p className={cn(
                                                    "truncate text-xs",
                                                    hasUnread ? "font-bold text-foreground" : "text-muted-foreground"
                                                )}>
                                                    {room.lastMessage?.text || 'No messages'}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                                    {room.lastMessage?.timestamp
                                                        ? formatDistanceToNow(room.lastMessage.timestamp.toDate(), { addSuffix: false })
                                                        : ''}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}


                {/* Photographers Section */}
                <div className="py-2">
                    <div
                        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => setShowPhotographers(!showPhotographers)}
                    >
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            All Photographers
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            {showPhotographers || searchQuery ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </div>

                    {(showPhotographers || searchQuery) && (
                        <div className="space-y-1 mt-1">
                            {filteredPhotographers.length > 0 ? (
                                filteredPhotographers.map(photographer => (
                                    <div
                                        key={photographer.id}
                                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer"
                                        onClick={() => handlePhotographerClick(photographer.id)}
                                    >
                                        <Avatar className="h-8 w-8 border">
                                            <AvatarImage src={photographer.photoURL} alt={photographer.name} />
                                            <AvatarFallback>{photographer.name?.charAt(0) || '?'}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="truncate text-sm font-medium">{photographer.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">{photographer.bio || 'Photographer'}</p>
                                        </div>
                                        <UserPlus className="h-4 w-4 text-muted-foreground opacity-50" />
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-2 text-sm text-muted-foreground text-center">
                                    No photographers found.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
