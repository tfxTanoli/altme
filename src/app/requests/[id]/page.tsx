'use client';

import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import * as React from 'react';
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    useFirestore,
    useUser,
    useFirebase,
    errorEmitter,
    FirestorePermissionError,
    updateDocumentNonBlocking,
    addDocumentNonBlocking,
} from '@/firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    writeBatch,
    increment,
    deleteDoc,
    orderBy,
    updateDoc,
} from 'firebase/firestore';
import { ref, get, child } from 'firebase/database';
import type {
    Bid,
    User,
    ProjectRequest,
    Review,
    ContentDelivery,
    ChatRoom,
    ReferenceMedia,
} from '@/lib/types';
import {
    Loader,
    MessageSquare,
    Award,
    MoreVertical,
    Check,
    ClipboardCheck,
    Gavel,
    ShieldAlert,
    Calendar,
    MapPin,
    DollarSign,
    Copyright,
    FileText,
    Star,
    Download,
    ThumbsUp,
    X,
    Plus,
    Video,
} from 'lucide-react';
import BidderCard from '@/components/requests/bidder-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from '@/components/stripe/checkout-form';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { useContentDeliveryUpload } from '@/hooks/use-content-delivery-upload';
import { ReportDialog } from '@/components/report-dialog';
import { RequestForm } from '@/components/requests/request-form';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { countries } from '@/lib/countries';
import { ChatView } from '@/components/chat/chat-view';
import { sendNotification } from '@/services/notifications';

type EnrichedBid = Bid & {
    bidderUser?: User;
};

const PLATFORM_FEE_PERCENTAGE = 0.15;

const ReviewCard = ({ review, reviewer }: { review: Review, reviewer?: User }) => {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start gap-4">
                    <Avatar>
                        <AvatarImage src={reviewer?.photoURL} alt={reviewer?.name} />
                        <AvatarFallback>{reviewer?.name.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle className="text-lg">{reviewer?.name || 'Loading...'}</CardTitle>
                        <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                            ))}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{review.comment}</p>
            </CardContent>
        </Card>
    );
};


export default function RequestDetailPage({ params }: { params: { id: string } }) {
    const { id } = params;
    const { user: currentUser } = useUser();
    const firestore = useFirestore();
    const { database } = useFirebase();
    const router = useRouter();
    const { toast } = useToast();

    // State Management
    const [request, setRequest] = React.useState<ProjectRequest | null>(null);
    const [requestOwner, setRequestOwner] = React.useState<User | null>(null);
    const [bids, setBids] = React.useState<EnrichedBid[]>([]);
    const [deliveries, setDeliveries] = React.useState<ContentDelivery[]>([]);
    const [reviews, setReviews] = React.useState<Review[]>([]);
    const [reviewers, setReviewers] = React.useState<Record<string, User>>({});
    const [chatRoom, setChatRoom] = React.useState<ChatRoom | null>(null);

    const [isLoading, setIsLoading] = React.useState(true);
    const [bidAmount, setBidAmount] = React.useState('');
    const [bidNotes, setBidNotes] = React.useState('');
    const [isSubmittingBid, setIsSubmittingBid] = React.useState(false);
    const [isCancellingBid, setIsCancellingBid] = React.useState<string | null>(null);
    const [isApprovingDelivery, setIsApprovingDelivery] = React.useState(false);
    const [isCompletingReview, setIsCompletingReview] = React.useState(false);

    const [bidToAccept, setBidToAccept] = React.useState<EnrichedBid | null>(null);
    const [clientSecret, setClientSecret] = React.useState<string | null>(null);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);
    const [isEditRequestOpen, setIsEditRequestOpen] = React.useState(false);

    const { isUploading, fileInputRef, handleFileChange, triggerFileInput } = useContentDeliveryUpload(request, deliveries, setDeliveries);

    // Derived State
    const isOwner = currentUser?.uid === request?.userId;
    const isHiredPhotographer = currentUser?.uid === request?.hiredPhotographerId;
    const userHasBid = React.useMemo(() => bids.some(bid => bid.userId === currentUser?.uid && bid.status === 'active'), [bids, currentUser]);
    const myBid = React.useMemo(() => bids.find(bid => bid.userId === currentUser?.uid && bid.status === 'active'), [bids, currentUser]);
    const canBid = !isOwner && !userHasBid && request?.status === 'Open';

    // Client & photographer reviews
    const clientReview = React.useMemo(() => reviews.find(r => r.reviewerId === request?.userId), [reviews, request]);
    const photographerReview = React.useMemo(() => reviews.find(r => r.reviewerId === request?.hiredPhotographerId), [reviews, request]);

    // Hooks
    React.useEffect(() => {
        if (!id || !firestore) return;

        const requestDocRef = doc(firestore, 'requests', id);

        const unsubRequest = onSnapshot(requestDocRef, async (docSnap) => {
            if (!docSnap.exists()) {
                setRequest(null);
                setIsLoading(false);
                return;
            }

            const requestData = { id: docSnap.id, ...docSnap.data() } as ProjectRequest;
            setRequest(requestData);

            // Updated: Fetch owner from RTDB
            if (database) {
                try {
                    const ownerSnapshot = await get(ref(database, `users/${requestData.userId}`));
                    if (ownerSnapshot.exists()) {
                        setRequestOwner({ id: ownerSnapshot.key, ...ownerSnapshot.val() } as User);
                    }
                } catch (err) {
                    console.error("Error fetching request owner from RTDB:", err);
                }
            }

            const deliveriesSnap = await getDocs(collection(requestDocRef, 'contentDeliveries'));
            setDeliveries(deliveriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ContentDelivery)));

            const reviewsQuery = query(collection(firestore, 'reviews'), where('requestId', '==', id));
            const reviewsSnap = await getDocs(reviewsQuery);
            const fetchedReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
            setReviews(fetchedReviews);

            // Updated: Fetch reviewers from RTDB
            if (fetchedReviews.length > 0 && database) {
                const reviewerIds = [...new Set(fetchedReviews.map(r => r.reviewerId))];
                const reviewersMap = new Map<string, User>();

                await Promise.all(reviewerIds.map(async (uid) => {
                    try {
                        const snapshot = await get(ref(database, `users/${uid}`));
                        if (snapshot.exists()) {
                            reviewersMap.set(uid, { id: snapshot.key, ...snapshot.val() } as User);
                        }
                    } catch (e) {
                        console.error(`Error fetching reviewer ${uid}:`, e);
                    }
                }));
                setReviewers(Object.fromEntries(reviewersMap));
            }

            if (requestData.projectChatRoomId) {
                const chatRoomDoc = await getDoc(doc(firestore, 'chatRooms', requestData.projectChatRoomId));
                if (chatRoomDoc.exists()) {
                    setChatRoom({ id: chatRoomDoc.id, ...chatRoomDoc.data() } as ChatRoom);
                }
            }

            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching request details:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `requests/${id}`, operation: 'get' }));
            setIsLoading(false);
        });

        const bidsQuery = query(collection(firestore, 'bids'), where('requestId', '==', id));
        const unsubBids = onSnapshot(bidsQuery, async (bidsSnapshot) => {
            const fetchedBids = bidsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bid));
            if (fetchedBids.length > 0) {
                // Updated: Fetch bidders from RTDB (Hybrid Model)
                const bidderIds = [...new Set(fetchedBids.map(b => b.userId))];
                const usersMap = new Map<string, User>();

                if (database) {
                    await Promise.all(bidderIds.map(async (uid) => {
                        try {
                            const snapshot = await get(ref(database, `users/${uid}`));
                            if (snapshot.exists()) {
                                usersMap.set(uid, { id: snapshot.key, ...snapshot.val() } as User);
                            }
                        } catch (e) {
                            console.error(`Error fetching bidder ${uid}:`, e);
                        }
                    }));
                }
                const enrichedBids = fetchedBids.map(b => ({ ...b, bidderUser: usersMap.get(b.userId) }));
                setBids(enrichedBids);
            } else {
                setBids([]);
            }
        }, (error) => {
            console.error("Error fetching bids:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load bids. Please refresh.' });
        });

        return () => {
            unsubRequest();
            unsubBids();
        };
    }, [id, firestore]);

    const handleSubmitBid = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !firestore || !request) return;
        setIsSubmittingBid(true);

        try {
            const batch = writeBatch(firestore);
            const bidRef = doc(collection(firestore, 'bids'));
            const bidData = {
                id: bidRef.id,
                userId: currentUser.uid,
                requestId: request.id,
                requestOwnerId: request.userId,
                amount: parseFloat(bidAmount),
                notes: bidNotes,
                createdAt: serverTimestamp(),
                status: 'active' as const,
            };
            batch.set(bidRef, bidData);

            const requestRef = doc(firestore, 'requests', request.id);
            batch.update(requestRef, { unreadBidsCount: increment(1) });

            await batch.commit();

            await sendNotification(request.userId, {
                title: 'New Bid Received',
                message: `You have received a new bid of $${bidAmount} for "${request.title}".`,
                type: 'bid_received',
                link: `/requests/${request.id}`,
                relatedId: request.id
            });

            setBidAmount('');
            setBidNotes('');
            toast({ title: 'Bid Submitted!', description: 'Your bid has been placed.' });
        } catch (error) {
            console.error('Error submitting bid:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not submit your bid.' });
        } finally {
            setIsSubmittingBid(false);
        }
    };

    const handleCancelBid = async (bid: Bid) => {
        if (!currentUser || !firestore) return;
        setIsCancellingBid(bid.id);
        try {
            const bidRef = doc(firestore, 'bids', bid.id);
            await updateDoc(bidRef, { status: 'cancelled' });
            toast({ title: 'Bid Cancelled', description: 'Your bid has been withdrawn.' });
        } catch (error) {
            console.error("Error cancelling bid:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to cancel your bid.' });
        } finally {
            setIsCancellingBid(null);
        }
    };

    const handleAcceptBid = async (bid: EnrichedBid) => {
        if (!currentUser || !firestore || !request) return;

        setBidToAccept(bid);

        // 1. Create Payment Intent on the backend
        try {
            const serviceFee = bid.amount * PLATFORM_FEE_PERCENTAGE;
            const totalAmount = bid.amount + serviceFee;

            const response = await fetch('/api/stripe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: totalAmount }),
            });

            if (!response.ok) {
                const { error } = await response.json();
                throw new Error(error || 'Failed to create payment intent.');
            }
            const { clientSecret } = await response.json();
            setClientSecret(clientSecret);
            setIsPaymentDialogOpen(true);

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Payment Error', description: error.message });
            setBidToAccept(null);
        }
    };

    const handlePaymentSuccess = async () => {
        if (!firestore || !request || !bidToAccept || !currentUser) return;

        const photographer = bidToAccept.bidderUser;
        if (!photographer) return;

        try {
            const batch = writeBatch(firestore);

            const chatRoomRef = doc(collection(firestore, 'chatRooms'));
            const chatRoomData: ChatRoom = {
                id: chatRoomRef.id,
                participantIds: [currentUser.uid, photographer.id].sort(),
                user1Id: currentUser.uid,
                user2Id: photographer.id,
                requestId: request.id,
                isProjectChat: true,
                lastMessage: null,
            };
            batch.set(chatRoomRef, chatRoomData);

            const requestDocRef = doc(firestore, 'requests', request.id);
            const requestUpdateData = {
                status: 'In Progress' as const,
                hiredPhotographerId: photographer.id,
                participantIds: [currentUser.uid, photographer.id].sort(),
                acceptedBidAmount: bidToAccept.amount,
                projectChatRoomId: chatRoomRef.id,
                unreadBidsCount: 0,
            };
            batch.update(requestDocRef, requestUpdateData);

            const photographerUserRef = doc(firestore, 'users', photographer.id);
            batch.update(photographerUserRef, { unreadGigsCount: increment(1) });

            await batch.commit();

            await sendNotification(photographer.id, {
                title: 'You have been hired!',
                message: `Your bid for "${request.title}" has been accepted.`,
                type: 'hired',
                link: `/requests/${request.id}`,
                relatedId: request.id
            });

            setIsPaymentDialogOpen(false);
            setBidToAccept(null);
            toast({ title: 'Bid Accepted!', description: `You have hired ${photographer.name}.` });
        } catch (error) {
            console.error("Error finalizing bid acceptance:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to finalize hiring process.' });
        }
    };

    const handleApproveDelivery = async () => {
        if (!firestore || !request || !isOwner) return;
        setIsApprovingDelivery(true);

        const photographerId = request.hiredPhotographerId;
        const paymentAmount = request.acceptedBidAmount;

        if (!photographerId || typeof paymentAmount === 'undefined') {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing required project data to approve.' });
            setIsApprovingDelivery(false);
            return;
        }

        try {
            const batch = writeBatch(firestore);
            const requestRef = doc(firestore, 'requests', request.id);
            const photographerRef = doc(firestore, 'users', photographerId);

            batch.update(requestRef, {
                status: 'Completed',
                clientHasReviewed: false,
                photographerHasReviewed: false,
            });

            // Release payment to photographer's balance
            batch.update(photographerRef, {
                balance: increment(paymentAmount),
                pendingReviewCount: increment(1)
            });

            await batch.commit();

            await sendNotification(photographerId, {
                title: 'Delivery Approved',
                message: `Your work for "${request.title}" has been approved and payment released.`,
                type: 'delivery_approved',
                link: `/requests/${request.id}`,
                relatedId: request.id
            });

            toast({ title: 'Delivery Approved!', description: 'Payment has been released to the photographer.' });

        } catch (error) {
            console.error("Error approving delivery:", error);
            toast({ variant: 'destructive', title: 'Approval Failed', description: 'Could not approve the delivery.' });
        } finally {
            setIsApprovingDelivery(false);
        }
    };

    const handleCompleteReview = async (rating: number, comment: string) => {
        if (!firestore || !request || !currentUser) return;

        const isClient = currentUser.uid === request.userId;
        const isPhotographer = currentUser.uid === request.hiredPhotographerId;

        if (!isClient && !isPhotographer) return;

        setIsCompletingReview(true);

        try {
            const batch = writeBatch(firestore);
            const reviewRef = doc(collection(firestore, 'reviews'));

            const reviewData: Review = {
                id: reviewRef.id,
                requestId: request.id,
                reviewerId: currentUser.uid,
                revieweeId: isClient ? request.hiredPhotographerId! : request.userId,
                rating,
                comment,
                createdAt: serverTimestamp() as any,
            };
            batch.set(reviewRef, reviewData);

            const requestRef = doc(firestore, 'requests', request.id);
            const reviewUpdateField = isClient ? { clientHasReviewed: true } : { photographerHasReviewed: true };
            batch.update(requestRef, reviewUpdateField);

            // Decrement pending review count for the reviewer
            const reviewerRef = doc(firestore, 'users', currentUser.uid);
            batch.update(reviewerRef, { pendingReviewCount: increment(-1) });

            await batch.commit();

            const revieweeId = isClient ? request.hiredPhotographerId! : request.userId;
            await sendNotification(revieweeId, {
                title: 'New Review',
                message: `You have received a new review for "${request.title}".`,
                type: 'review_received',
                link: `/requests/${request.id}`,
                relatedId: request.id
            });

            toast({ title: 'Review Submitted!', description: 'Thank you for your feedback.' });

        } catch (error) {
            console.error("Error submitting review:", error);
            toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not submit your review.' });
        } finally {
            setIsCompletingReview(false);
        }
    };

    if (isLoading) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <Loader className="h-8 w-8 animate-spin" />
            </main>
        );
    }

    if (!request) {
        notFound();
    }

    const serviceFee = (bidToAccept?.amount || 0) * PLATFORM_FEE_PERCENTAGE;
    const totalPayment = (bidToAccept?.amount || 0) + serviceFee;
    const country = countries.find(c => c.value === request.country);
    const locationDisplay = country ? `${request.location}, ${country.label}` : request.location;


    return (
        <>
            {bidToAccept && clientSecret && (
                <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Complete Hiring</DialogTitle>
                            <DialogDescription>
                                You are about to hire <strong>{bidToAccept.bidderUser?.name}</strong> for <strong>${bidToAccept.amount}</strong>. A {PLATFORM_FEE_PERCENTAGE * 100}% service fee will be added.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            <div className="p-4 rounded-lg bg-muted/50 text-sm">
                                <div className="flex justify-between">
                                    <span>Photographer's Bid</span>
                                    <span>${bidToAccept.amount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Service Fee ({PLATFORM_FEE_PERCENTAGE * 100}%)</span>
                                    <span>${serviceFee.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t">
                                    <span>Total Due Today</span>
                                    <span>${totalPayment.toFixed(2)}</span>
                                </div>
                            </div>
                            <Elements stripe={loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)} options={{ clientSecret }}>
                                <CheckoutForm onSuccessfulPayment={handlePaymentSuccess} />
                            </Elements>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            <main className="flex-1 bg-muted/40 py-8 px-4 md:px-6">
                <div className="mx-auto grid max-w-6xl items-start gap-6 md:grid-cols-[1fr_350px]">
                    <div className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-2xl">{request.title}</CardTitle>
                                        <CardDescription>
                                            Posted by{' '}
                                            <Link href={`/photographers/${request.userId}`} className="hover:underline text-foreground font-medium">
                                                {requestOwner?.name || <Skeleton className="h-4 w-24 inline-block" />}
                                            </Link>
                                        </CardDescription>
                                    </div>
                                    {isOwner && request.status === 'Open' && (
                                        <Dialog open={isEditRequestOpen} onOpenChange={setIsEditRequestOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm">Edit Request</Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-3xl">
                                                <DialogHeader>
                                                    <DialogTitle>Edit Request</DialogTitle>
                                                    <DialogDescription>
                                                        Update the details of your project request below.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="py-4">
                                                    <RequestForm request={request} onSuccess={() => setIsEditRequestOpen(false)} />
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                    <div className="flex items-start gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div>
                                            <p className="font-medium">Date</p>
                                            <p className="text-muted-foreground">{request.dates && request.dates.length > 0 ? request.dates.join(', ') : 'Flexible'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div>
                                            <p className="font-medium">Location</p>
                                            <p className="text-muted-foreground">{locationDisplay || 'Not specified'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div>
                                            <p className="font-medium">Budget</p>
                                            <p className="text-muted-foreground">${request.budget.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Copyright className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div>
                                            <p className="font-medium">Copyright</p>
                                            <p className="text-muted-foreground capitalize">{request.copyrightOption}</p>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-semibold mb-2">Description</h3>
                                    <p className="text-muted-foreground whitespace-pre-wrap">{request.description}</p>
                                </div>
                                {request.referenceMedia && request.referenceMedia.length > 0 && (
                                    <div>
                                        <h3 className="font-semibold mb-2">Reference Media</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                            {request.referenceMedia.map((media, index) => (
                                                <a key={index} href={media.url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square">
                                                    <Image
                                                        src={media.thumbnailUrl || media.url}
                                                        alt={media.name}
                                                        fill
                                                        sizes="(max-width: 768px) 50vw, 33vw"
                                                        className="rounded-lg border object-cover transition-opacity group-hover:opacity-75"
                                                    />
                                                    {media.type === 'video' && (
                                                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                                                            <Video className="h-8 w-8 text-white" />
                                                        </div>
                                                    )}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Chat Section */}
                        {chatRoom && (isOwner || isHiredPhotographer) && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Project Chat</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[600px]">
                                    <ChatView
                                        partner={isOwner ? (bids.find(b => b.userId === request.hiredPhotographerId)?.bidderUser) : (requestOwner || undefined)}
                                        chatRoom={chatRoom}
                                        allUsersMap={new Map([...bids.map(b => [b.userId, b.bidderUser] as [string, User]), requestOwner ? [requestOwner.id, requestOwner] : []].filter((entry): entry is [string, User] => !!entry[1]))}
                                    />
                                </CardContent>
                            </Card>
                        )}

                        {/* Content Delivery Section */}
                        {(request.status === 'In Progress' || request.status === 'Delivered') && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Content Delivery</CardTitle>
                                    <CardDescription>
                                        {isHiredPhotographer
                                            ? "Upload the final images and/or videos for the client here."
                                            : "The photographer will deliver the final content here."}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {isHiredPhotographer && (
                                        <div className="mb-6 flex justify-center">
                                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/*,video/*" />
                                            <Button onClick={triggerFileInput} disabled={isUploading}>
                                                {isUploading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                                Upload & Deliver
                                            </Button>
                                        </div>
                                    )}

                                    {deliveries.length > 0 ? (
                                        <div className="space-y-4">
                                            {deliveries.map((delivery) => (
                                                <div key={delivery.id} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                    {delivery.files.map((file, index) => (
                                                        <a key={index} href={file.url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square">
                                                            <Image
                                                                src={file.thumbnailUrl || file.url}
                                                                alt={file.name}
                                                                fill
                                                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                                                                className="rounded-lg border object-cover transition-opacity group-hover:opacity-75"
                                                            />
                                                            {file.type === 'video' && (
                                                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                                                                    <Video className="h-8 w-8 text-white" />
                                                                </div>
                                                            )}
                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate rounded-b-lg">
                                                                {file.name}
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center text-muted-foreground py-8">
                                            <p>No files have been delivered yet.</p>
                                        </div>
                                    )}
                                </CardContent>
                                {request.status === 'Delivered' && isOwner && (
                                    <CardFooter className="justify-end gap-2">
                                        <ReportDialog
                                            reportedUserId={request.hiredPhotographerId!}
                                            context={{ type: 'request', id: request.id }}
                                            isDispute={true}
                                        />
                                        <Button onClick={handleApproveDelivery} disabled={isApprovingDelivery}>
                                            {isApprovingDelivery ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />}
                                            Approve & Release Payment
                                        </Button>
                                    </CardFooter>
                                )}
                            </Card>
                        )}

                        {/* Review Section */}
                        {request.status === 'Completed' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Project Reviews</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {clientReview && photographerReview ? (
                                        <>
                                            <ReviewCard review={clientReview} reviewer={requestOwner || undefined} />
                                            <ReviewCard review={photographerReview} reviewer={bids.find(b => b.userId === request.hiredPhotographerId)?.bidderUser} />
                                        </>
                                    ) : (
                                        <p className="text-muted-foreground">Reviews are pending.</p>
                                    )}
                                    {/* Form for Client to review Photographer */}
                                    {isOwner && !clientReview && (
                                        <ReviewForm onSubmit={handleCompleteReview} isLoading={isCompletingReview} />
                                    )}
                                    {/* Form for Photographer to review Client */}
                                    {isHiredPhotographer && !photographerReview && (
                                        <ReviewForm onSubmit={handleCompleteReview} isLoading={isCompletingReview} />
                                    )}
                                </CardContent>
                            </Card>
                        )}

                    </div>

                    <div className="grid gap-6">
                        {isHiredPhotographer && request.status !== 'Open' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Your Role</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                                        <Award className="h-8 w-8 text-blue-500" />
                                        <div>
                                            <p className="font-semibold text-blue-800 dark:text-blue-300">You are the hired photographer.</p>
                                            <p className="text-sm text-blue-600 dark:text-blue-400">Deliver your best work!</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {myBid && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Your Bid</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <BidderCard bid={myBid} request={request} onAcceptBid={() => { }} onCancelBid={handleCancelBid} />
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>Bids ({bids.filter(b => b.status === 'active').length})</CardTitle>
                                <CardDescription>
                                    {isOwner ? "Review bids from interested photographers." : "Photographers who have bid on this project."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {bids.filter(b => b.status === 'active' && b.userId !== currentUser?.uid).length > 0 ? (
                                    bids.filter(bid => bid.status === 'active' && bid.userId !== currentUser?.uid).map((bid) => (
                                        <BidderCard key={bid.id} bid={bid} request={request} onAcceptBid={handleAcceptBid} onCancelBid={handleCancelBid} />
                                    ))
                                ) : (
                                    <div className="text-center text-sm text-muted-foreground py-4">No active bids yet.</div>
                                )}
                            </CardContent>
                        </Card>

                        {canBid && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Place Your Bid</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleSubmitBid} className="space-y-4">
                                        <div>
                                            <Label htmlFor="bid-amount">Bid Amount ($)</Label>
                                            <Input
                                                id="bid-amount"
                                                type="number"
                                                value={bidAmount}
                                                onChange={(e) => setBidAmount(e.target.value)}
                                                placeholder="Enter your bid"
                                                required
                                                min="1"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="bid-notes">Notes (optional)</Label>
                                            <Textarea
                                                id="bid-notes"
                                                value={bidNotes}
                                                onChange={(e) => setBidNotes(e.target.value)}
                                                placeholder="Add a personal note, your availability, etc."
                                            />
                                        </div>
                                        <Button type="submit" className="w-full" disabled={isSubmittingBid}>
                                            {isSubmittingBid && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                                            Submit Bid
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        )}

                        {!isOwner && request.status === 'Open' && (
                            <ReportDialog
                                reportedUserId={request.userId}
                                context={{ type: 'request', id: request.id }}
                            />
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}


// A sub-component for the review form
function ReviewForm({ onSubmit, isLoading }: { onSubmit: (rating: number, comment: string) => void, isLoading: boolean }) {
    const [rating, setRating] = React.useState(0);
    const [comment, setComment] = React.useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (rating > 0) {
            onSubmit(rating, comment);
        }
    };
    return (
        <form onSubmit={handleSubmit} className="p-4 border rounded-lg mt-4 space-y-4">
            <h4 className="font-medium">Leave a Review</h4>
            <div>
                <Label>Rating</Label>
                <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" onClick={() => setRating(star)}>
                            <Star className={`h-6 w-6 cursor-pointer ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <Label htmlFor="review-comment">Comment</Label>
                <Textarea
                    id="review-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share your experience..."
                    required
                />
            </div>
            <Button type="submit" disabled={isLoading || rating === 0}>
                {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                Submit Review
            </Button>
        </form>
    );
}
