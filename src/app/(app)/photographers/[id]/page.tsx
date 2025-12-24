

'use client';

import { notFound, useRouter } from 'next/navigation';
import * as React from 'react';
import { useFirestore, useMemoFirebase, useUser, addDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, where, limit, getDocs, serverTimestamp, writeBatch, getDoc, arrayUnion, arrayRemove, onSnapshot, updateDoc, setDoc, increment, orderBy } from 'firebase/firestore';
import type { PhotographerProfile, User, Review, ProjectRequest, PortfolioItem, Timestamp, ReferenceMedia, ChatRoom } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader, Mail, MapPin, Star, Flag, Heart, MessageSquare, Copyright, Upload, Video, X, CalendarIcon, Check, Edit } from 'lucide-react';
import Link from 'next/link';
import { cn, captureVideoFrame } from '@/lib/utils';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ReportDialog } from '@/components/report-dialog';
import { PortfolioGallery } from '@/components/photographers/portfolio-gallery';
import { countries } from '@/lib/countries';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRequestMediaUpload } from '@/hooks/use-request-media-upload';
import Image from 'next/image';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import CheckoutForm from '@/components/stripe/checkout-form';
import { ChatView } from '@/components/chat/chat-view';

const MAX_REFERENCE_MEDIA = 10;

type Preview = {
    url: string;
    type: 'image' | 'video';
    name: string;
};


const DisplayReviewCard = ({ review, reviewer }: { review: Review, reviewer?: User | null }) => {
    if (!reviewer) {
        return <div className="p-4"><Loader className="h-4 w-4 animate-spin" /></div>;
    }
    return (
        <div className="flex items-start gap-4">
            <Avatar>
                <AvatarImage src={reviewer.photoURL} alt={reviewer.name} data-ai-hint="person avatar" />
                <AvatarFallback>{reviewer.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <div>
                    <p className="font-semibold">{reviewer.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                                key={i}
                                className={cn(
                                    "h-4 w-4",
                                    i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"
                                )}
                            />
                        ))}
                    </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
            </div>
        </div>
    );
};


const bookingFormSchema = z.object({
  budget: z.coerce.number().min(5, { message: "Budget must be at least $5." }).max(10000, { message: "Budget cannot exceed $10,000." }),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }),
  copyrightOption: z.enum(['license', 'transfer']).default('license'),
  datePreference: z.enum(['flexible', 'set-dates']).default('flexible'),
  dateType: z.enum(['specific-date', 'delivery-deadline']).optional(),
  dates: z.array(z.date()).optional(),
});

const BookNowDialog = ({ photographer, open, onOpenChange }: { photographer: User, open: boolean, onOpenChange: (open: boolean) => void }) => {
  const { user: currentUser } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<Preview[]>([]);
  const { uploadFiles, isUploading } = useRequestMediaUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof bookingFormSchema>>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      budget: '' as any,
      description: "",
      copyrightOption: 'license',
      datePreference: 'flexible',
      dates: [],
    },
  });
  
  const datePreference = form.watch('datePreference');
  const totalIsLoading = isUploading || form.formState.isSubmitting;
  const canUploadMore = previews.length < MAX_REFERENCE_MEDIA;

  React.useEffect(() => {
    if(!open) {
        form.reset();
        setSelectedFiles([]);
        setPreviews([]);
    }
  }, [open, form]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        let files = Array.from(event.target.files);
        
        const currentCount = previews.length;
        const remainingSlots = MAX_REFERENCE_MEDIA - currentCount;

        if (remainingSlots <= 0) {
            toast({
                variant: 'destructive',
                title: 'Upload Limit Reached',
                description: `You can only upload a maximum of ${MAX_REFERENCE_MEDIA} files.`,
            });
            return;
        }

        if (files.length > remainingSlots) {
             toast({
                title: 'Upload Limit Exceeded',
                description: `You can only add ${remainingSlots} more file(s). The first ${remainingSlots} will be uploaded.`,
            });
            files = files.slice(0, remainingSlots);
        }

        setSelectedFiles(prev => [...prev, ...files]);

        const newPreviews = await Promise.all(files.map(async (file) => {
            const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
            let previewUrl = URL.createObjectURL(file);

            if (mediaType === 'video') {
                try {
                    const thumbBlob = await captureVideoFrame(file, 'request');
                    previewUrl = URL.createObjectURL(thumbBlob);
                } catch (error) {
                    console.error("Could not generate video thumbnail.", error);
                }
            }

            return {
                url: previewUrl,
                type: mediaType,
                name: file.name
            };
        }));

        setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    const newPreviews = [...previews];
    const removedPreview = newPreviews.splice(index, 1)[0];
    if (removedPreview.url.startsWith('blob:')) {
      URL.revokeObjectURL(removedPreview.url);
    }
    setPreviews(newPreviews);
    
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);

    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }


  const onSubmit = async (values: z.infer<typeof bookingFormSchema>) => {
    if (!currentUser || !firestore) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to book a photographer.",
      });
      return;
    }
    
    const title = `Direct Booking with ${photographer.name}`;

    try {
      const referenceMediaUrls = await uploadFiles(selectedFiles);
      
      const newRequestRef = doc(collection(firestore, "requests"));
      const newRequestData: Partial<ProjectRequest> = {
        id: newRequestRef.id,
        title,
        description: values.description,
        budget: values.budget,
        userId: currentUser.uid,
        postedBy: currentUser.displayName || currentUser.email,
        hiredPhotographerId: photographer.id,
        participantIds: [currentUser.uid, photographer.id].sort(),
        copyrightOption: values.copyrightOption,
        status: "Pending" as const,
        createdAt: serverTimestamp() as Timestamp,
        datePreference: values.datePreference,
        dateType: values.dateType || null,
        dates: values.dates ? values.dates.map(date => format(date, 'PPP')) : [],
        referenceMedia: referenceMediaUrls,
        location: '',
      };
      await setDoc(newRequestRef, newRequestData);

      toast({
        title: "Booking Request Sent!",
        description: `Your request has been sent to ${photographer.name}.`,
      });
      onOpenChange(false);
      router.push(`/requests/${newRequestRef.id}`);

    } catch (error) {
      console.error("Error creating direct booking:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not send your booking request.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                    <DialogTitle>Book {photographer.name}</DialogTitle>
                    <DialogDescription>
                        Send a direct booking request. They will confirm their availability.
                    </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <FormField
                            control={form.control}
                            name="budget"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Budget ($)</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Describe your project, desired date, location, etc."
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="datePreference"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>Date Preference</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={field.onChange}
                                        value={field.value}
                                        className="flex space-x-4"
                                        >
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl>
                                            <RadioGroupItem value="flexible" />
                                            </FormControl>
                                            <FormLabel className="font-normal">Flexible / No deadline</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl>
                                            <RadioGroupItem value="set-dates" />
                                            </FormControl>
                                            <FormLabel className="font-normal">Set Dates</FormLabel>
                                        </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            
                            {datePreference === 'set-dates' && (
                                <div className="pl-2 space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="dateType"
                                        render={({ field }) => (
                                            <FormItem className="space-y-3">
                                            <FormLabel>Date Type</FormLabel>
                                            <FormControl>
                                                <RadioGroup
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                                className="flex space-x-4"
                                                >
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                    <RadioGroupItem value="specific-date" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">Specific Date</FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                    <RadioGroupItem value="delivery-deadline" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">Delivery Deadline</FormLabel>
                                                </FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="dates"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                    variant={'outline'}
                                                    className={cn(
                                                        'pl-3 text-left font-normal',
                                                        !field.value?.length && 'text-muted-foreground'
                                                    )}
                                                    >
                                                    {field.value && field.value.length > 0 ? (
                                                        field.value.length > 1 ? `${field.value.length} dates selected` : format(field.value[0], 'PPP')
                                                    ) : (
                                                        <span>Pick a date</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="multiple"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) =>
                                                    date < new Date() || date < new Date('1900-01-01')
                                                    }
                                                    initialFocus
                                                />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                </div>
                            )}
                        </div>
                        
                         <div>
                            <FormLabel>Reference Media (optional)</FormLabel>
                            <FormDescription className="pb-2">
                                Add some images or videos to give photographers a better idea of what you're looking for. ({previews.length}/{MAX_REFERENCE_MEDIA})
                            </FormDescription>
                            <Input 
                                id="file-upload"
                                type="file" 
                                className="hidden" 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                multiple
                                accept="image/*,video/*"
                                disabled={totalIsLoading || !canUploadMore}
                            />
                            {previews.length > 0 && (
                                <div className="grid grid-cols-3 gap-4 mt-2 md:grid-cols-5">
                                    {previews.map((preview, index) => (
                                        <div key={index} className="relative group aspect-square">
                                            <Image
                                                src={preview.url}
                                                alt={preview.name}
                                                fill
                                                className="object-cover rounded-md"
                                            />
                                            {preview.type === 'video' && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                    <Video className="h-8 w-8 text-white" />
                                                </div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="icon"
                                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => removeFile(index)}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {canUploadMore && (
                                        <div 
                                            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-4 text-center hover:border-primary/50 transition-colors"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Upload className="h-8 w-8 text-muted-foreground" />
                                            <p className="mt-2 text-sm text-muted-foreground">Add More</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {previews.length === 0 && canUploadMore && (
                                <div 
                                    className="mt-2 flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-12 text-center"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload className="h-8 w-8 text-muted-foreground" />
                                    <p className="mt-2 text-sm text-muted-foreground">Click to upload media</p>
                                </div>
                            )}
                        </div>

                         <FormField
                            control={form.control}
                            name="copyrightOption"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Copyright & Usage Rights</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex flex-col space-y-2"
                                    >
                                    <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                        <RadioGroupItem value="license" />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Grant of License
                                        </FormLabel>
                                        <FormDescription>
                                            The photographer retains copyright, but you get a license to use the content.
                                        </FormDescription>
                                        </div>
                                    </FormItem>
                                    <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                        <RadioGroupItem value="transfer" />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Transfer of Copyright
                                        </FormLabel>
                                        <FormDescription>
                                            You acquire full ownership and copyright of the content. This is typically more expensive.
                                        </FormDescription>
                                        </div>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                    </div>
                    <DialogFooter className="sm:justify-end">
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">Cancel</Button>
                        </DialogClose>
                        <Button type="submit" disabled={totalIsLoading}>
                            {totalIsLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                            Send Request
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    </Dialog>
  );
};


export default function PhotographerDetailPage({ params }: { params: { id: string } }) {
  const id = params.id; // This is the userId from the URL
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  
  const [userData, setUserData] = React.useState<User | null>(null);
  const [photographerProfile, setPhotographerProfile] = React.useState<PhotographerProfile | null>(null);
  const [portfolioItems, setPortfolioItems] = React.useState<PortfolioItem[]>([]);
  const [allReviews, setAllReviews] = React.useState<Review[] | null>(null);
  const [reviewers, setReviewers] = React.useState<Record<string, User>>({});
  const [myOpenRequests, setMyOpenRequests] = React.useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isBookNowOpen, setIsBookNowOpen] = React.useState(false);
  const [isStartingChat, setIsStartingChat] = React.useState(false);
  const [currentUserData, setCurrentUserData] = React.useState<User | null>(null);
  const [bidToAccept, setBidToAccept] = React.useState<any | null>(null);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);


  React.useEffect(() => {
    if (!firestore) return;

    if (currentUser) {
      const unsub = onSnapshot(doc(firestore, 'users', currentUser.uid), (doc) => {
        setCurrentUserData({ id: doc.id, ...doc.data() } as User);
      }, (error) => {
          console.error(`Error listening to current user data:`, error);
      });
      return () => unsub();
    }
  }, [firestore, currentUser]);

  React.useEffect(() => {
    if (!firestore || !id) return;

    let unsubPortfolio: (() => void) | undefined;

    const fetchData = async () => {
        setIsLoading(true);

        try {
            const userRef = doc(firestore, 'users', id);
            const profileQuery = query(collection(firestore, 'photographerProfiles'), where('userId', '==', id), limit(1));
            const reviewsQuery = query(collection(firestore, 'reviews'), where('revieweeId', '==', id));
            
            const [userSnap, profileSnap, reviewsSnap] = await Promise.all([
                getDoc(userRef),
                getDocs(profileQuery),
                getDocs(reviewsQuery)
            ]);
            
            if(!userSnap.exists()) {
                setIsLoading(false);
                return;
            }
            const fetchedUserData = { id: userSnap.id, ...userSnap.data() } as User;
            setUserData(fetchedUserData);

            const fetchedProfile = profileSnap.docs.length > 0 ? { id: profileSnap.docs[0].id, ...profileSnap.docs[0].data() } as PhotographerProfile : null;
            setPhotographerProfile(fetchedProfile);

            if (fetchedProfile) {
                const portfolioQuery = query(collection(firestore, 'photographerProfiles', fetchedProfile.id, 'portfolioItems'), orderBy('createdAt', 'asc'));
                unsubPortfolio = onSnapshot(portfolioQuery, (snapshot) => {
                    setPortfolioItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as PortfolioItem));
                });
            }
            
            const fetchedReviews = reviewsSnap.docs.map(d => ({id: d.id, ...d.data()}) as Review);
            setAllReviews(fetchedReviews);
            
            if (fetchedReviews.length > 0) {
                const reviewerIds = [...new Set(fetchedReviews.map(r => r.reviewerId))];
                if(reviewerIds.length > 0) {
                    const userChunks: string[][] = [];
                    for (let i = 0; i < reviewerIds.length; i += 30) {
                        userChunks.push(reviewerIds.slice(i, i + 30));
                    }
                    const newReviewers: Record<string, User> = {};
                    for (const chunk of userChunks) {
                        const usersQuery = query(collection(firestore, 'users'), where('__name__', 'in', chunk));
                        const usersSnapshot = await getDocs(usersQuery);
                        usersSnapshot.forEach(doc => {
                            newReviewers[doc.id] = { id: doc.id, ...doc.data() } as User;
                        });
                    }
                    setReviewers(newReviewers);
                }
            }
            
            if (currentUser) {
                const myRequestsQuery = query(collection(firestore, 'requests'), where('userId', '==', currentUser.uid), where('status', '==', 'Open'));
                const myRequestsSnap = await getDocs(myRequestsQuery);
                setMyOpenRequests(myRequestsSnap.docs.map(d => ({id: d.id, ...d.data()} as ProjectRequest)));
            }

        } catch (error) {
            console.error("Error fetching photographer data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    fetchData();
    return () => unsubPortfolio && unsubPortfolio();
    
  }, [firestore, id, currentUser]);
  
  const handleMessageUser = async () => {
    if (!currentUser || !userData || !firestore) return;
    setIsStartingChat(true);
    router.push(`/messages/new?recipient=${userData.id}`);
  };

  const isFavorited = React.useMemo(() => {
    return currentUserData?.favoritePhotographerIds?.includes(id) || false;
  }, [currentUserData, id]);

  const toggleFavorite = async () => {
    if (!currentUser || !firestore) return;
    const userRef = doc(firestore, 'users', currentUser.uid);
    try {
      if (isFavorited) {
        await updateDoc(userRef, { favoritePhotographerIds: arrayRemove(id) });
      } else {
        await updateDoc(userRef, { favoritePhotographerIds: arrayUnion(id) });
      }
    } catch (error) {
      console.error("Error updating favorites", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not update your favorites. Please try again.",
      });
    }
  };


  const handlePaymentSuccess = async (bid: any) => {
    if (!firestore || !userData || !currentUser) return;
  
    const batch = writeBatch(firestore);
  
    // Create Project Chat Room
    const chatRoomRef = doc(collection(firestore, 'chatRooms'));
    const chatRoomData: ChatRoom = {
        id: chatRoomRef.id,
        participantIds: [currentUser.uid, photographerProfile!.userId].sort(),
        user1Id: currentUser.uid,
        user2Id: photographerProfile!.userId,
        isProjectChat: true,
        lastMessage: null,
    };
    batch.set(chatRoomRef, chatRoomData);
  
    const requestDocRef = doc(firestore, 'requests', bid.requestId); // Assuming bid has requestId
    const requestUpdateData = {
        status: 'In Progress' as const,
        hiredPhotographerId: bid.userId,
        participantIds: [currentUser.uid, bid.userId],
        acceptedBidAmount: bid.amount,
        projectChatRoomId: chatRoomRef.id, 
    };
    batch.update(requestDocRef, requestUpdateData);
    
    const photographerUserRef = doc(firestore, 'users', bid.userId);
    batch.update(photographerUserRef, { unreadGigsCount: increment(1) });
    
    await batch.commit();

    setIsPaymentDialogOpen(false);
    setBidToAccept(null);
    toast({ title: 'Bid Accepted!', description: `You have hired ${bid.bidderUser.name}.`});
  };

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  if (!userData) {
    notFound();
  }

  const isOwnProfile = currentUser?.uid === userData.id;

  const averageRating = allReviews && allReviews.length > 0 
    ? (allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length).toFixed(1) 
    : 0;
    
  const country = countries.find(c => c.value === photographerProfile?.serviceCountry);
  const locationParts = [];
  if (photographerProfile?.areas?.length) {
      locationParts.push(photographerProfile.areas.join(', '));
  }
  if (country) {
      locationParts.push(country.label);
  }
  const locationDisplay = locationParts.join(', ');

  const serviceFee = (bidToAccept?.amount || 0) * 0.10;
  const totalPayment = (bidToAccept?.amount || 0) + serviceFee;

  return (
    <>
    {clientSecret && bidToAccept && isPaymentDialogOpen && (
           <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
              <DialogContent>
                  <DialogHeader>
                      <DialogTitle>Complete Payment</DialogTitle>
                      <DialogDescription>
                          You are hiring <span className="font-bold">{bidToAccept.bidderUser?.name}</span>. Please confirm the payment details below.
                      </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="p-4 rounded-lg bg-muted/50 text-sm">
                        <div className="flex justify-between">
                          <span>Photographer's Bid</span>
                          <span>${(bidToAccept.amount).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Service Fee (10%)</span>
                          <span>${serviceFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t">
                          <span>Total</span>
                          <span>${totalPayment.toFixed(2)}</span>
                        </div>
                    </div>
                    <Elements stripe={loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)} options={{ clientSecret, locale: 'en' }}>
                        <CheckoutForm onSuccessfulPayment={() => handlePaymentSuccess(bidToAccept)} />
                    </Elements>
                  </div>
              </DialogContent>
          </Dialog>
      )}

    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6">
        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                  <div className="relative">
                    <Avatar className="h-24 w-24 border">
                      {userData.photoURL && <AvatarImage src={userData.photoURL} alt={userData.name} data-ai-hint="person portrait" />}
                      <AvatarFallback>{userData.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                     {userData.showActivityStatus && (
                        <div className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-background bg-green-500" title="Online" />
                     )}
                  </div>
                  <div className="grid gap-1 flex-1 min-w-0">
                    <h1 className="text-2xl font-bold break-all">{userData.name}</h1>
                    {locationDisplay && (
                      <div className="flex items-center justify-center gap-2 text-muted-foreground md:justify-start">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <div className="break-all">{locationDisplay}</div>
                      </div>
                    )}
                  </div>
                   <div className="flex w-full flex-col items-stretch gap-2 md:ml-auto md:w-auto md:items-end flex-shrink-0">
                    {!isOwnProfile && currentUser && (
                      <>
                        <div className="flex w-full flex-col gap-2 md:flex-row">
                          <Button variant="outline" onClick={handleMessageUser} disabled={isStartingChat} className="w-full">
                            {isStartingChat ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                            Message
                          </Button>
                          <Button onClick={() => setIsBookNowOpen(true)} className="w-full">Book Now</Button>
                        </div>
                        <div className="flex w-full items-center justify-center gap-2 md:justify-end">
                            <Button variant="outline" size="icon" onClick={toggleFavorite}>
                                <Heart className={cn("h-5 w-5", isFavorited && "fill-destructive text-destructive")} />
                            </Button>
                            <ReportDialog reportedUserId={userData.id} context={{ type: 'user', id: userData.id }} />
                        </div>
                      </>
                    )}
                    <BookNowDialog photographer={userData} open={isBookNowOpen} onOpenChange={setIsBookNowOpen} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {userData.bio && (
              <Card>
                <CardHeader>
                  <CardTitle>About {userData.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-foreground/80 break-all">{userData.bio}</p>
                </CardContent>
              </Card>
            )}

            <Card>
                 <CardHeader>
                    <CardTitle>Portfolio</CardTitle>
                </CardHeader>
                 <CardContent>
                    <PortfolioGallery
                        items={portfolioItems}
                        setItems={setPortfolioItems}
                        profileId={photographerProfile?.id || ''}
                        isOwnProfile={isOwnProfile}
                        onUploadClick={() => router.push('/profile')}
                        isLoading={isLoading}
                    />
                </CardContent>
            </Card>

          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Reviews</CardTitle>
                    </div>
                    {allReviews && allReviews.length > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-bold">{averageRating}</span>
                            </div>
                            <span className="text-muted-foreground">({allReviews.length} reviews)</span>
                        </div>
                    )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-6">
                 {allReviews && allReviews.length > 0 ? (
                    allReviews.map(review => (
                        <DisplayReviewCard key={review.id} review={review} reviewer={reviewers[review.reviewerId]} />
                    ))
                 ) : (
                    <p className="text-sm text-muted-foreground">No reviews yet.</p>
                 )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
