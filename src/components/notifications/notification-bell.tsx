

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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useUser, initializeFirebase } from '@/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { markNotificationAsRead, markAllNotificationsAsRead, type Notification } from '@/services/notifications';
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
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// Helper to get icon based on type
const NotificationIcon: React.FC<{ type: Notification['type'] }> = ({ type }) => {
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
  const [allNotifications, setAllNotifications] = React.useState<Notification[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isOpen, setIsOpen] = React.useState(false);
  const router = useRouter();

  // Initialize DB instance
  const { database } = initializeFirebase();

  React.useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const notificationsRef = ref(database, `notifications/${user.uid}`);
    // Query last 50 notifications
    const notificationsQuery = query(notificationsRef, orderByChild('timestamp'), limitToLast(50));

    const unsubscribe = onValue(notificationsQuery, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const notificationList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));

        // Sort by timestamp descending (newest first)
        notificationList.sort((a, b) => b.timestamp - a.timestamp);

        setAllNotifications(notificationList);
      } else {
        setAllNotifications([]);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching notifications:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, database]);

  const unreadCount = React.useMemo(() => {
    return allNotifications.filter(n => !n.isRead).length;
  }, [allNotifications]);

  const handleMarkAsRead = async () => {
    if (!user || allNotifications.length === 0) return;

    // Find unread notifications
    const unreadIds = allNotifications
      .filter(n => !n.isRead)
      .map(n => n.id);

    if (unreadIds.length > 0) {
      await markAllNotificationsAsRead(user.uid, unreadIds);
    }
  };

  const handleItemSelect = async (event: Event, link: string, notifId: string) => {
    event.preventDefault();
    if (!user) return;

    await markNotificationAsRead(user.uid, notifId);
    router.push(link);
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && unreadCount > 0) {
      // Optional: Mark all as read when closing, or keep them unread until clicked?
      // User request: "Notifications should not disappear after being marked as read"
      // Usually "Mark all as read" happens on open or specific action. 
      // Let's NOT mark all as read automatically on close to ensure they see which ones were new,
      // unless explicitly requested. But standard pattern is often to clear badge.
      // For now, let's leave the badge active until they click or we decide to clear it.
      // If we want to clear badge on close:
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
          {hasUnread && (
            <Button variant="ghost" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground" onClick={handleMarkAsRead}>
              Mark all as read
            </Button>
          )}
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
                  "cursor-pointer focus:bg-accent focus:text-accent-foreground relative my-1",
                  !notif.isRead ? "bg-blue-50 dark:bg-blue-950/20 font-medium" : "text-muted-foreground"
                )}
              >
                <div className="flex items-start gap-3 p-2 w-full">
                  <div className="mt-1">
                    <NotificationIcon type={notif.type} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm leading-snug">{notif.message}</p>
                    <p className="text-xs opacity-70">
                      {formatDistanceToNow(notif.timestamp, {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
