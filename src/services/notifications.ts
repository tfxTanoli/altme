import { getDatabase, ref, push, onValue, set, update, query, orderByChild, limitToLast, get, serverTimestamp } from 'firebase/database';
import { initializeFirebase } from '@/firebase';

// Initialize firebase to ensure we have the app instance
const { database } = initializeFirebase();

export interface Notification {
    id: string;
    type: 'new_bid' | 'gig_hired' | 'project_chat' | 'direct_message' | 'delivery_approved' | 'project_disputed' | 'new_report' | 'new_contact_submission' | 'review_request' | 'new_delivery' | 'project_completed' | 'direct_booking_request' | 'direct_booking_approved' | 'direct_booking_declined' | 'dispute_resolved' | 'bid_received' | 'hired' | 'delivery_submitted' | 'review_received' | 'message_received';
    title: string;
    message: string;
    link: string;
    relatedId?: string;
    timestamp: number;
    isRead: boolean;
    recipientEmail?: string; // For email fallback if needed
    recipientName?: string;
}

export const sendNotification = async (userId: string, notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => {
    if (!userId) return;

    try {
        const notificationsRef = ref(database, `notifications/${userId}`);
        const newNotificationRef = push(notificationsRef);

        await set(newNotificationRef, {
            ...notification,
            timestamp: serverTimestamp(),
            isRead: false,
        });
    } catch (error) {
        console.error("Error sending notification:", error);
    }
};

export const markNotificationAsRead = async (userId: string, notificationId: string) => {
    if (!userId || !notificationId) return;

    try {
        const notificationRef = ref(database, `notifications/${userId}/${notificationId}`);
        await update(notificationRef, {
            isRead: true
        });
    } catch (error) {
        console.error("Error marking notification as read:", error);
    }
};

export const markAllNotificationsAsRead = async (userId: string, notificationIds: string[]) => {
    if (!userId || notificationIds.length === 0) return;

    try {
        const updates: Record<string, boolean> = {};
        notificationIds.forEach(id => {
            updates[`notifications/${userId}/${id}/isRead`] = true;
        });
        await update(ref(database), updates);
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
    }
}
