

'use client';

import * as React from 'react';
import {
  Bell,
  Gavel,
  MessageSquare,
  Briefcase,
  Loader,
  CircleDollarSign,
  Package,
  Flag,
  Inbox,
  Star,
  CheckCircle,
  XCircle,
  ThumbsUp,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, updateDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  arrayUnion,
} from 'firebase/firestore';
import type { ProjectRequest, ChatRoom, Bid, User } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type NotificationType =
  | 'new_bid'
  | 'gig_hired'
  | 'project_chat'
  | 'direct_message'
  | 'delivery_approved'
  | 'project_disputed'
  | 'new_report'
  | 'new_contact_submission'
  | 'review_request'
  | 'new_delivery'
  | 'project_completed'
  | 'direct_booking_request'
  | 'direct_booking_approved'
  | 'direct_booking_declined'
  | 'dispute_resolved';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  link: string;
  timestamp: Timestamp;
  isRead: boolean;
  recipientEmail?: string;
  recipientName?: string;
}

const NotificationIcon: React.FC<{ type: NotificationType }> = ({ type }) => {
  switch (type) {
    case 'new_bid':
      return <CircleDollarSign className="h-4 w-4 text-green-500" />;
    case 'gig_hired':
    case 'direct_booking_request':
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    case 'direct_booking_approved':
        return <ThumbsUp className="h-4 w-4 text-blue-500" />;
    case 'direct_booking_declined':
        return <XCircle className="h-4 w-4 text-destructive" />;
    case 'project_chat':
      return <MessageSquare className="h-4 w-4 text-purple-500" />;
    case 'direct_message':
      return <MessageSquare className="h-4 w-4 text-cyan-500" />;
    case 'new_delivery':
        return <Package className="h-4 w-4 text-yellow-500" />;
    case 'project_completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'project_disputed':
        return <Gavel className="h-4 w-4 text-red-500" />;
    case 'dispute_resolved':
        return <Gavel className="h-4 w-4 text-green-600" />;
    case 'new_report':
        return <Flag className="h-4 w-4 text-orange-500" />;
    case 'new_contact_submission':
        return <Inbox className="h-4 w-4 text-indigo-500" />;
    case 'review_request':
        return <Star className="h-4 w-4 text-yellow-500" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

export const NotificationBell = () => {
  const { user } = useUser();
  const firestore = useFirestore();
  const [userData, setUserData] = React.useState<User | null>(null);
  const [allNotifications, setAllNotifications] = React.useState<Notification[]>([]);
  
  const [isLoading, setIsLoading] = React.useState(true);
  const [isOpen, setIsOpen] = React.useState(false);
  const [usersMap, setUsersMap] = React.useState<Map<string, User>>(new Map());
  const router = useRouter();
  const sentEmailsRef = React.useRef(new Set<string>());

  const sendEmailNotification = React.useCallback(async (notification: Notification) => {
    if (!firestore || !notification.recipientEmail || sentEmailsRef.current.has(notification.id)) {
        return;
    }

    const mailData = {
        to: [notification.recipientEmail],
        message: {
            subject: `New Notification: ${notification.message.substring(0, 50)}...`,
            html: `
                <p>Hello ${notification.recipientName || 'there'},</p>
                <p>You have a new notification on AltMe:</p>
                <p><strong>${notification.message}</strong></p>
                <p><a href="https://altme.fyi${notification.link}">Click here to view it</a></p>
                <p>Thank you,</p>
                <p>The AltMe Team</p>
            `,
        },
    };

    try {
        await addDocumentNonBlocking(collection(firestore, 'mail'), mailData);
        sentEmailsRef.current.add(notification.id);
    } catch (error) {
        console.error("Failed to trigger email notification:", error);
    }
  }, [firestore]);

  const mergeNotifications = React.useCallback((newNotifs: Omit<Notification, 'isRead'>[], readIds: Set<string>): void => {
    setAllNotifications(prevNotifs => {
        const notifsMap = new Map<string, Omit<Notification, 'isRead'>>();
        
        prevNotifs.forEach(n => notifsMap.set(n.id, n));
        newNotifs.forEach(newNotif => {
            const isNew = !notifsMap.has(newNotif.id);
            notifsMap.set(newNotif.id, newNotif);
            if (isNew && !readIds.has(newNotif.id)) {
                sendEmailNotification({ ...newNotif, isRead: false });
            }
        });

        return Array.from(notifsMap.values())
            .map(n => ({ ...n, isRead: readIds.has(n.id) }))
            .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
    });
  }, [sendEmailNotification]);
  
  React.useEffect(() => {
    if (!user || !firestore) {
      setIsLoading(false);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const handleSnapshotError = (error: Error, queryName: string, queryPath: string) => {
        console.error(`Error in ${queryName} snapshot listener:`, error);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: queryPath,
            operation: 'list',
        }));
    };

    const userDocRef = doc(firestore, 'users', user.uid);
    const unsubUserData = onSnapshot(userDocRef, async (doc) => {
        if (doc.exists()) {
            const fetchedUserData = doc.data() as User;
            setUserData(fetchedUserData);
            const readIds = new Set(fetchedUserData.readNotificationIds || []);
            const newNotifications: Omit<Notification, 'isRead'>[] = [];
            
            if (fetchedUserData.role === 'admin') {
                const adminEmail = 'ayn.eee.11@gmail.com';
                if (fetchedUserData.openReportsCount && fetchedUserData.openReportsCount > 0) {
                    newNotifications.push({ id: `reports-${user.uid}`, type: 'new_report' as const, message: `There are ${fetchedUserData.openReportsCount} open user reports to review.`, link: '/admin/reports', timestamp: Timestamp.now(), recipientEmail: adminEmail, recipientName: fetchedUserData.name });
                }
                if (fetchedUserData.unreadContactSubmissionsCount && fetchedUserData.unreadContactSubmissionsCount > 0) {
                     newNotifications.push({ id: `contact-${user.uid}`, type: 'new_contact_submission' as const, message: `You have ${fetchedUserData.unreadContactSubmissionsCount} new contact submission(s).`, link: '/admin/inbox', timestamp: Timestamp.now(), recipientEmail: adminEmail, recipientName: fetchedUserData.name });
                }
                if (fetchedUserData.disputedProjectsCount && fetchedUserData.disputedProjectsCount > 0) {
                    newNotifications.push({ id: `disputes-${user.uid}`, type: 'project_disputed' as const, message: `There are ${fetchedUserData.disputedProjectsCount} disputed projects requiring review.`, link: '/admin/projects', timestamp: Timestamp.now(), recipientEmail: adminEmail, recipientName: fetchedUserData.name });
                }
            } else {
                const unreadGigsCount = fetchedUserData.unreadGigsCount || 0;
                if (unreadGigsCount > 0) {
                    if (unreadGigsCount === 1) {
                        const newGigQuery = query(
                            collection(firestore, 'requests'),
                            where('hiredPhotographerId', '==', user.uid),
                            where('status', '==', 'In Progress'),
                            orderBy('createdAt', 'desc'),
                            limit(1)
                        );
                        try {
                            const gigSnap = await getDocs(newGigQuery);
                            if (!gigSnap.empty) {
                                const gig = gigSnap.docs[0].data() as ProjectRequest;
                                newNotifications.push({ id: `gig-${gig.id}`, type: 'gig_hired' as const, message: `You've been hired for "${gig.title}"!`, link: `/requests/${gig.id}`, timestamp: Timestamp.now(), recipientEmail: fetchedUserData.email, recipientName: fetchedUserData.name });
                            } else {
                                newNotifications.push({ id: `gigs-${user.uid}`, type: 'gig_hired' as const, message: `You have 1 new gig!`, link: '/requests', timestamp: Timestamp.now(), recipientEmail: fetchedUserData.email, recipientName: fetchedUserData.name });
                            }
                        } catch (e) {
                             newNotifications.push({ id: `gigs-${user.uid}`, type: 'gig_hired' as const, message: `You have 1 new gig!`, link: '/requests', timestamp: Timestamp.now(), recipientEmail: fetchedUserData.email, recipientName: fetchedUserData.name });
                        }
                    } else {
                        newNotifications.push({ id: `gigs-${user.uid}`, type: 'gig_hired' as const, message: `You have ${unreadGigsCount} new gigs!`, link: '/requests', timestamp: Timestamp.now(), recipientEmail: fetchedUserData.email, recipientName: fetchedUserData.name });
                    }
                }
                if (fetchedUserData.pendingReviewCount && fetchedUserData.pendingReviewCount > 0) {
                     newNotifications.push({ id: `review-multi-${user.uid}`, type: 'review_request' as const, message: `You have ${fetchedUserData.pendingReviewCount} project(s) to review.`, link: '/requests', timestamp: Timestamp.now(), recipientEmail: fetchedUserData.email, recipientName: fetchedUserData.name });
                }
            }
            
             mergeNotifications(newNotifications, readIds);
        }
    }, (error) => handleSnapshotError(error, "user data", `users/${user.uid}`));
    unsubscribes.push(unsubUserData);


    const userRole = user.isAnonymous ? 'guest' : 'user'; 
    if(userRole === 'user') {
        
        const myInvolvedProjectsQuery = query(
            collection(firestore, 'requests'), 
            where('participantIds', 'array-contains', user.uid)
        );

        const myOwnedProjectsQuery = query(
            collection(firestore, 'requests'),
            where('userId', '==', user.uid)
        );
        
        const processProjectSnapshot = (snapshot: any, readIds: Set<string>) => {
            const newNotifications: Omit<Notification, 'isRead'>[] = [];
            
            snapshot.docs.forEach((doc:any) => {
                const request = { id: doc.id, ...doc.data() } as ProjectRequest;

                if (request.userId === user.uid) {
                    if (request.unreadBidsCount && request.unreadBidsCount > 0) {
                         newNotifications.push({ id: `bid-${request.id}`, type: 'new_bid' as const, message: `${request.unreadBidsCount} new bid(s) on "${request.title}"`, link: `/requests/${request.id}`, timestamp: Timestamp.now(), recipientEmail: userData?.email, recipientName: userData?.name });
                    }
                    if (request.status === 'Delivered' && !request.clientHasReviewed) {
                        newNotifications.push({ id: `delivery-${request.id}`, type: 'new_delivery' as const, message: `Files have been delivered for "${request.title}"`, link: `/requests/${request.id}`, timestamp: Timestamp.now(), recipientEmail: userData?.email, recipientName: userData?.name });
                    }
                    if (request.photographerRespondedAt) {
                         if (request.status === 'Pending') {
                            newNotifications.push({ id: `booking-approved-${request.id}`, type: 'direct_booking_approved' as const, message: `Your booking request for "${request.title}" was approved! Please complete the payment.`, link: `/requests/${request.id}`, timestamp: request.photographerRespondedAt, recipientEmail: userData?.email, recipientName: userData?.name });
                        } else if (request.status === 'Disabled') {
                            newNotifications.push({ id: `booking-declined-${request.id}`, type: 'direct_booking_declined' as const, message: `Your booking request for "${request.title}" was declined.`, link: `/requests`, timestamp: request.photographerRespondedAt, recipientEmail: userData?.email, recipientName: userData?.name });
                        }
                    }
                }

                if (request.hiredPhotographerId === user.uid) {
                     if (request.status === 'Pending' && !request.photographerRespondedAt) {
                        newNotifications.push({ id: `booking-${request.id}`, type: 'direct_booking_request' as const, message: `New direct booking request for "${request.title}"`, link: `/requests/${request.id}`, timestamp: request.createdAt, recipientEmail: userData?.email, recipientName: userData?.name });
                    }
                    if (request.status === 'Delivered' && request.clientHasReviewed && !request.photographerHasReviewed) {
                        newNotifications.push({ id: `review-${request.id}`, type: 'review_request' as const, message: `The client has left a review for "${request.title}". Please leave your review to complete the project.`, link: `/requests/${request.id}`, timestamp: Timestamp.now(), recipientEmail: userData?.email, recipientName: userData?.name });
                    }
                }

                 if (request.status === 'Completed' && !(request.clientHasReviewed && request.photographerHasReviewed)) {
                     newNotifications.push({ id: `completed-${request.id}`, type: 'project_completed' as const, message: `Project "${request.title}" is complete!`, link: `/requests/${request.id}`, timestamp: Timestamp.now(), recipientEmail: userData?.email, recipientName: userData?.name });
                }
                if (request.disputeResolvedAt) {
                    let message = `Dispute for "${request.title}" has been resolved.`;
                    if (request.disputeResolution === 'refunded') {
                        message = `Dispute for "${request.title}": The client has been refunded.`;
                    } else if (request.disputeResolution === 'paid') {
                         message = `Dispute for "${request.title}": The photographer has been paid.`;
                    }
                    newNotifications.push({
                        id: `dispute-res-${request.id}`,
                        type: 'dispute_resolved' as const,
                        message,
                        link: `/requests/${request.id}`,
                        timestamp: request.disputeResolvedAt,
                        recipientEmail: userData?.email, recipientName: userData?.name
                    });
                }
            });
            mergeNotifications(newNotifications, readIds);
        }

        const unsubInvolvedProjects = onSnapshot(myInvolvedProjectsQuery, (snapshot) => {
            const readIds = new Set(userData?.readNotificationIds || []);
            processProjectSnapshot(snapshot, readIds);
        }, (error) => handleSnapshotError(error, "my involved projects", "requests"));

        const unsubOwnedProjects = onSnapshot(myOwnedProjectsQuery, (snapshot) => {
            const readIds = new Set(userData?.readNotificationIds || []);
            processProjectSnapshot(snapshot, readIds);
        }, (error) => handleSnapshotError(error, "my owned projects", "requests"));

        unsubscribes.push(unsubInvolvedProjects, unsubOwnedProjects);

        const chatRoomsQuery = query(
          collection(firestore, 'chatRooms'),
          where('participantIds', 'array-contains', user.uid)
        );
        const unsubChatRooms = onSnapshot(chatRoomsQuery, async (snapshot) => {
            const readIds = new Set(userData?.readNotificationIds || []);
            const chatNotifications: Omit<Notification, 'isRead'>[] = [];
            const userIdsToFetch = new Set<string>();
            const rooms = snapshot.docs.map(doc => doc.data() as ChatRoom);
        
            // First, gather all sender IDs that need to be fetched
            for (const room of rooms) {
                if (room.lastMessage && room.hasUnreadMessages && room.hasUnreadMessages[user.uid] && room.lastMessage.senderId !== user.uid) {
                    const senderId = room.lastMessage.senderId;
                    if (!usersMap.has(senderId)) {
                        userIdsToFetch.add(senderId);
                    }
                }
            }
        
            // If there are new user IDs, fetch them and update the map
            if (userIdsToFetch.size > 0) {
                const usersQuery = query(collection(firestore, 'users'), where('__name__', 'in', Array.from(userIdsToFetch)));
                try {
                    const usersSnap = await getDocs(usersQuery);
                    const newUsers = new Map(usersMap);
                    usersSnap.forEach(userDoc => {
                        newUsers.set(userDoc.id, userDoc.data() as User);
                    });
                    setUsersMap(newUsers); // Update state to trigger re-render
                } catch(e) { console.error("Error fetching users for notifications:", e); }
            }
        
            // Now, generate notifications using the potentially updated usersMap
            for (const room of rooms) {
                if (room.lastMessage && room.hasUnreadMessages && room.hasUnreadMessages[user.uid] && room.lastMessage.senderId !== user.uid) {
                    const sender = usersMap.get(room.lastMessage.senderId) || (await getDoc(doc(firestore, 'users', room.lastMessage.senderId))).data();
                    const senderName = sender?.name || 'Someone';

                    let messageText = `New message from ${senderName}.`;
                    if (room.isProjectChat) {
                        messageText = `New message from ${senderName} in your project chat.`;
                    }
                    
                    chatNotifications.push({
                        id: `msg-${room.id}`,
                        type: room.isProjectChat ? 'project_chat' : 'direct_message',
                        message: messageText,
                        link: room.isProjectChat ? `/requests/${room.requestId}` : `/messages/${room.id}`,
                        timestamp: room.lastMessage.timestamp,
                        recipientEmail: userData?.email, recipientName: userData?.name
                    });
                }
            }
            mergeNotifications(chatNotifications, readIds);
        
        }, (error) => handleSnapshotError(error, "chat rooms", "chatRooms"));
        unsubscribes.push(unsubChatRooms);
    }

    setIsLoading(false);
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [user, firestore, userData?.readNotificationIds, mergeNotifications, usersMap]);
  
  const unreadCount = React.useMemo(() => {
    return allNotifications.filter(n => !n.isRead).length;
  }, [allNotifications]);

  const handleMarkAsRead = () => {
      if (!user || !firestore || allNotifications.length === 0) return;
      const unreadIds = allNotifications.filter(n => !n.isRead).map(n => n.id);
      if (unreadIds.length === 0) return;

      const userDocRef = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(userDocRef, {
          readNotificationIds: arrayUnion(...unreadIds)
      });
  };
  
  const handleItemSelect = (event: Event, link: string, notifId: string) => {
    event.preventDefault();
    if (!user || !firestore) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userDocRef, {
        readNotificationIds: arrayUnion(notifId)
    });
    router.push(link);
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && unreadCount > 0) {
      handleMarkAsRead();
    }
  }

  const hasUnread = unreadCount > 0;

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 justify-center rounded-full p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        <div className="flex items-center justify-between p-2">
            <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
        </div>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
        ) : allNotifications.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            You have no notifications.
          </p>
        ) : (
          <ScrollArea className="h-96">
            {allNotifications.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                onSelect={(e) => handleItemSelect(e, notif.link, notif.id)}
                 className={cn(
                    "cursor-pointer focus:bg-accent focus:text-accent-foreground relative data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                    !notif.isRead && "bg-blue-500/10"
                )}
              >
                 <div className="flex items-start gap-3 p-2 w-full">
                    <div className="mt-1">
                        <NotificationIcon type={notif.type} />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm leading-snug">{notif.message}</p>
                        <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(notif.timestamp.toDate(), {
                            addSuffix: true,
                            })}
                        </p>
                    </div>
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
