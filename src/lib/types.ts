

import { Timestamp } from "firebase/firestore";

export type User = {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'admin';
    status: 'active' | 'deleted';
    photoURL?: string;
    bio?: string;
    balance: number;
    joinDate?: Timestamp;
    showActivityStatus?: boolean;
    unreadGigsCount?: number;
    pendingReviewCount?: number;
    favoritePhotographerIds?: string[];
    favoriteRequestIds?: string[];
    stripeAccountId?: string;
    activeDisputesCount?: number;
    openReportsCount?: number;
    disputedProjectsCount?: number;
    unreadContactSubmissionsCount?: number;
    readNotificationIds?: string[];
}

export type PhotographerProfile = {
    id: string;
    userId: string;
    bio?: string;
    serviceCountry?: string;
    areas?: string[];
    isAcceptingRequests?: boolean;
    portfolioItemIds?: string[];
};

export type PortfolioItem = {
    id: string;
    photographerProfileId: string;
    userId: string; // Denormalized for security rules
    mediaUrl: string;
    thumbnailUrl?: string;
    mediaType: 'image' | 'video';
    description?: string;
    createdAt: Timestamp;
};

export type ReferenceMedia = {
    url: string;
    thumbnailUrl?: string | null;
    type: 'image' | 'video';
    name: string;
};

export type ProjectRequest = {
    id: string;
    title: string;
    description: string;
    mediaTypes?: ('image' | 'video')[];
    videoDuration?: string;
    location?: string;
    country?: string;
    datePreference?: 'flexible' | 'set-dates';
    dateType?: 'specific-date' | 'delivery-deadline';
    dates?: string[]; // Storing dates as an array of strings
    budget: number;
    acceptedBidAmount?: number;
    userId: string;
    postedBy?: string;
    copyrightOption?: 'license' | 'transfer';
    status: 'Open' | 'In Progress' | 'Delivered' | 'Completed' | 'Pending' | 'Disabled' | 'Disputed';
    hiredPhotographerId?: string;
    participantIds?: string[];
    createdAt: Timestamp;
    referenceMedia?: ReferenceMedia[];
    unreadBidsCount?: number;
    projectChatRoomId?: string;
    clientHasReviewed?: boolean;
    photographerHasReviewed?: boolean;
    disputeResolution?: 'refunded' | 'paid';
    disputeResolvedAt?: Timestamp;
    photographerRespondedAt?: Timestamp;
};

export type Bid = {
    id: string;
    photographerProfileId?: string;
    userId: string;
    requestId: string;
    requestOwnerId: string; // Denormalized for security rules
    amount: number;
    notes?: string;
    createdAt: any;
    status: 'active' | 'cancelled';
}

export type Review = {
    id: string;
    requestId: string;
    reviewerId: string; // The user ID of the person leaving the review
    revieweeId: string; // The user ID of the person being reviewed
    rating: number; // 1-5
    comment: string;
    createdAt: Timestamp;
}

export type Report = {
    id: string;
    reporterId: string;
    reportedUserId: string;
    reason: string;
    details?: string;
    context: {
        type: 'user' | 'request';
        id: string;
    };
    mediaAttachments?: ReferenceMedia[];
    status: 'open' | 'resolved';
    createdAt: Timestamp;
};

export type PayoutRequest = {
    id: string;
    userId: string;
    amount: number;
    status: 'pending' | 'completed';
    requestedAt: Timestamp;
    completedAt?: Timestamp;
};

export type ContentDelivery = {
    id: string;
    requestId: string;
    files: ReferenceMedia[];
    deliveryDate: Timestamp;
    isApproved: boolean;
};

export type EscrowPayment = {
    id: string;
    requestId: string;
    payerId: string;
    payeeId: string;
    amount: number;
    status: 'pending' | 'released' | 'refunded';
    paymentDate: Timestamp;
    releaseDate?: Timestamp;
    paymentIntentId?: string;
    refundId?: string;
};

export type ChatRoom = {
    id: string;
    participantIds: string[];
    user1Id: string;
    user2Id: string;
    requestId?: string;
    isProjectChat: boolean;
    lastMessage?: {
        text: string;
        timestamp: Timestamp;
        senderId: string;
    } | null;
    // e.g. { userId1: true, userId2: false }
    hasUnreadMessages?: Record<string, boolean>;

    // Properties for unified chat view in admin
    isUnified?: boolean;
    sourceRoomIds?: string[];
};

export type ChatMessage = {
    id: string;
    chatRoomId: string;
    senderId: string;
    message?: string;
    imageUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    mediaType?: 'image' | 'video';
    mediaName?: string;
    timestamp: Timestamp;
};




