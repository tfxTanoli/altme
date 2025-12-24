

'use client';

import Link from 'next/link';
import * as React from 'react';
import { PlusCircle, Search, Loader, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RequestCard from '@/components/requests/request-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser, useFirestore, updateDocumentNonBlocking, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc } from 'firebase/firestore';
import type { ProjectRequest, Bid, User as AppUser, ChatRoom } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';


const getNotificationKeyForRequest = (request: ProjectRequest): string => {
    // This creates a key based on the request ID and its current status.
    // When the status changes, the key changes, making the notification appear as "new".
    if (request.status === 'Delivered' && request.clientHasReviewed && !request.photographerHasReviewed) {
        return `review_request_for_${request.id}`;
    }
    if (request.status === 'Delivered' && !request.clientHasReviewed) {
        return `new_delivery_for_${request.id}`;
    }
    return `viewed_request_${request.id}_status_${request.status}`;
};

export default function MyJobsPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    
    const [userData, setUserData] = React.useState<AppUser | null>(null);
    const [myOpenRequests, setMyOpenRequests] = React.useState<ProjectRequest[]>([]);
    const [myInProgressRequests, setMyInProgressRequests] = React.useState<ProjectRequest[]>([]);
    const [myCompletedRequests, setMyCompletedRequests] = React.useState<ProjectRequest[]>([]);
    const [myDirectBookings, setMyDirectBookings] = React.useState<ProjectRequest[]>([]);
    const [myActiveGigs, setMyActiveGigs] = React.useState<ProjectRequest[]>([]);
    const [myCompletedGigs, setMyCompletedGigs] = React.useState<ProjectRequest[]>([]);
    const [bidOnRequests, setBidOnRequests] = React.useState<ProjectRequest[]>([]);
    const [chatRooms, setChatRooms] = React.useState<ChatRoom[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);


    React.useEffect(() => {
        if (!user || !firestore) {
            if(!isUserLoading) setIsLoading(false);
            return;
        }

        const userDocRef = doc(firestore, 'users', user.uid);

        // Listener for user data to get real-time notification counts
        const unsubscribeUser = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
                setUserData(doc.data() as AppUser);
            }
        },
        (error) => {
            console.error("Error fetching user data:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `users/${user.uid}`,
                operation: 'get',
            }));
        });
        
        // Listener for chat rooms
        const chatRoomsQuery = query(collection(firestore, 'chatRooms'), where('participantIds', 'array-contains', user.uid));
        const unsubscribeChatRooms = onSnapshot(chatRoomsQuery, (snapshot) => {
            setChatRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom)));
        });

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch all requests related to the user
                const myRequestsAsClientQuery = query(collection(firestore, 'requests'), where('userId', '==', user.uid));
                const myRequestsAsPhotographerQuery = query(collection(firestore, 'requests'), where('hiredPhotographerId', '==', user.uid));
                
                const [clientRequestsSnap, photographerGigsSnap] = await Promise.all([
                    getDocs(myRequestsAsClientQuery),
                    getDocs(myRequestsAsPhotographerQuery)
                ]);

                const clientRequests = clientRequestsSnap.docs.map(d => ({id: d.id, ...d.data()} as ProjectRequest));
                const photographerGigs = photographerGigsSnap.docs.map(d => ({id: d.id, ...d.data()} as ProjectRequest));

                setMyOpenRequests(clientRequests.filter(r => ['Open', 'Pending'].includes(r.status)));
                setMyInProgressRequests(clientRequests.filter(r => ['In Progress', 'Delivered', 'Disputed'].includes(r.status)));
                setMyCompletedRequests(clientRequests.filter(r => r.status === 'Completed'));
                
                setMyDirectBookings(photographerGigs.filter(r => r.status === 'Pending'));
                setMyActiveGigs(photographerGigs.filter(r => ['In Progress', 'Delivered', 'Disputed'].includes(r.status)));
                setMyCompletedGigs(photographerGigs.filter(r => r.status === 'Completed'));

                // Fetch bids and then the requests for those bids
                const myBidsQuery = query(collection(firestore, 'bids'), where('userId', '==', user.uid));
                const myBidsSnap = await getDocs(myBidsQuery);
                const myBids = myBidsSnap.docs.map(d => d.data() as Bid);
                if(myBids.length > 0) {
                    const openRequestIds = myBids.map(bid => bid.requestId);
                    const requests: ProjectRequest[] = [];
                    const idChunks: string[][] = [];
                    for (let i = 0; i < openRequestIds.length; i += 30) {
                        idChunks.push(openRequestIds.slice(i, i + 30));
                    }
                    for (const chunk of idChunks) {
                        if (chunk.length === 0) continue;
                        const requestsQuery = query(collection(firestore, 'requests'), where('__name__', 'in', chunk), where('status', 'in', ['Open', 'Pending']));
                        const querySnapshot = await getDocs(requestsQuery);
                        querySnapshot.forEach((doc) => requests.push({ id: doc.id, ...doc.data() } as ProjectRequest));
                    }
                    setBidOnRequests(requests);
                } else {
                    setBidOnRequests([]);
                }

            } catch (error) {
                console.error("Error fetching my jobs data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
        return () => {
            unsubscribeUser();
            unsubscribeChatRooms();
        };
    }, [user, firestore, isUserLoading]);
    
    const hasUnreadProjectChat = (request: ProjectRequest): boolean => {
        if (!user) return false;
        const projectChat = chatRooms.find(cr => cr.requestId === request.id);
        return projectChat?.hasUnreadMessages?.[user.uid] ?? false;
    };
    
    // --- Notification Logic ---
    const hasUnreadBids = React.useMemo(() => {
        return myOpenRequests.some(request => (request.unreadBidsCount || 0) > 0);
    }, [myOpenRequests]);

    const hasUnreadInProgress = React.useMemo(() => {
        return myInProgressRequests.some(request => {
            const hasNewMessage = hasUnreadProjectChat(request);
            return hasNewMessage || (request.status === 'Delivered' || request.status === 'Disputed' || (request.status === 'Pending' && !!request.photographerRespondedAt));
        });
    }, [myInProgressRequests, hasUnreadProjectChat]);

    const hasUnreadCompleted = React.useMemo(() => {
        return myCompletedRequests.some(request => !localStorage.getItem(getNotificationKeyForRequest(request)));
    }, [myCompletedRequests]);
    
     const hasUnreadActiveGigs = React.useMemo(() => {
        const isNewGig = (userData?.unreadGigsCount || 0) > 0;
        
        const hasActionableItem = myActiveGigs.some(request => {
             const hasNewMessage = hasUnreadProjectChat(request);
             const needsReview = request.status === 'Delivered' && request.clientHasReviewed && !request.photographerHasReviewed;
             return hasNewMessage || (isNewGig && request.status === 'In Progress') || (request.status !== 'In Progress') || needsReview;
        });

        return isNewGig || hasActionableItem;
    }, [myActiveGigs, userData, hasUnreadProjectChat]);


    const hasUnreadCompletedGigs = React.useMemo(() => {
         return myCompletedGigs.some(request => !localStorage.getItem(getNotificationKeyForRequest(request)));
    }, [myCompletedGigs]);

    const hasUnreadMyRequests = hasUnreadBids || hasUnreadInProgress || hasUnreadCompleted;
    const hasUnreadMyGigs = hasUnreadActiveGigs || hasUnreadCompletedGigs || myDirectBookings.length > 0;


  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-semibold text-lg md:text-2xl">
          My Jobs
        </h1>
        <div className="ml-auto flex items-center gap-2">
            <div className="relative">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input type="search" placeholder="Search jobs..." className="pl-8 sm:w-[300px] md:w-[200px] lg:w-[300px]" />
          </div>
          <Button asChild size="sm" className="h-8 gap-1">
            <Link href="/requests/new">
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                New Request
              </span>
            </Link>
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
            <Loader className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="my-requests">
          <TabsList className="grid w-full grid-cols-2 md:w-fit">
            <TabsTrigger value="my-requests">
                My Requests
            </TabsTrigger>
            <TabsTrigger value="my-gigs">
                My Gigs
            </TabsTrigger>
          </TabsList>
          <TabsContent value="my-requests">
            <Tabs defaultValue="open" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:w-fit">
                  <TabsTrigger value="open">
                    Open
                  </TabsTrigger>
                  <TabsTrigger value="in-progress">
                    In Progress
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Completed
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="open">
                  <Card>
                    <CardHeader>
                        <CardTitle>Open Requests</CardTitle>
                        <CardDescription>Projects you have created and are seeking photographers for.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {myOpenRequests && myOpenRequests.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                                {myOpenRequests.map((request) => (
                                    <RequestCard 
                                        key={request.id} 
                                        request={request}
                                        hasNotification={(request.unreadBidsCount || 0) > 0} 
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                                <p>You haven't posted any requests yet.</p>
                                <Button variant="link" asChild><Link href="/requests/new">Create your first request</Link></Button>
                            </div>
                        )}
                    </CardContent>
                  </Card>
                </TabsContent>
                 <TabsContent value="in-progress">
                   <Card>
                    <CardHeader>
                        <CardTitle>In Progress Requests</CardTitle>
                        <CardDescription>Projects you have created that are currently in progress.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {myInProgressRequests && myInProgressRequests.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                                {myInProgressRequests.map((request) => {
                                    const hasNewStatus = (request.status === 'Delivered' || request.status === 'Disputed' || (request.status === 'Pending' && !!request.photographerRespondedAt));
                                    const hasNewMessage = hasUnreadProjectChat(request);
                                    return <RequestCard key={request.id} request={request} hasNotification={hasNewStatus || hasNewMessage} />
                                })}
                            </div>
                        ) : (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                                <p>You have no projects currently in progress.</p>
                            </div>
                        )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="completed">
                  <Card>
                    <CardHeader>
                        <CardTitle>Completed Requests</CardTitle>
                        <CardDescription>Projects you have created that have been completed.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {myCompletedRequests && myCompletedRequests.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                                {myCompletedRequests.map((request) => {
                                    const hasNotification = !localStorage.getItem(getNotificationKeyForRequest(request));
                                    return <RequestCard key={request.id} request={request} hasNotification={hasNotification} />;
                                })}
                            </div>
                        ) : (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                                <p>You have no completed projects.</p>
                            </div>
                        )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
          </TabsContent>
          <TabsContent value="my-gigs">
              <Tabs defaultValue="direct-bookings" className="w-full">
                <TabsList className="h-auto grid w-full grid-cols-2 md:grid-cols-4 md:w-fit">
                  <TabsTrigger value="direct-bookings">
                    Direct Bookings
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    Active
                  </TabsTrigger>
                  <TabsTrigger value="bids">My Bids</TabsTrigger>
                  <TabsTrigger value="completed">
                    Completed
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="direct-bookings">
                  <Card>
                    <CardHeader>
                      <CardTitle>Direct Booking Requests</CardTitle>
                      <CardDescription>Clients who have requested to book you directly.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {myDirectBookings.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                          {myDirectBookings.map((request) => (
                            <RequestCard key={request.id} request={request} hasNotification={true} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <p>You have no pending direct booking requests.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="active">
                  <Card>
                    <CardHeader>
                      <CardTitle>Active Gigs</CardTitle>
                      <CardDescription>Projects you are currently working on.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {myActiveGigs && myActiveGigs.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                          {myActiveGigs.map((request) => {
                             const isNewGig = (userData?.unreadGigsCount || 0) > 0;
                             const needsReview = request.status === 'Delivered' && request.clientHasReviewed && !request.photographerHasReviewed;
                             const hasNewMessage = hasUnreadProjectChat(request);
                             const hasNotification = hasNewMessage || (isNewGig && request.status === 'In Progress') || (request.status !== 'In Progress') || needsReview;
                            return <RequestCard key={request.id} request={request} hasNotification={hasNotification} />
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <p>You have no active gigs.</p>
                          <Button variant="link" asChild><Link href="/requests/browse">Browse open projects</Link></Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="bids">
                  <Card>
                    <CardHeader>
                      <CardTitle>My Bids</CardTitle>
                      <CardDescription>Projects you have placed a bid on.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {bidOnRequests && bidOnRequests.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                          {bidOnRequests.map((request) => (
                            <RequestCard key={request.id} request={request} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <p>You have not placed any bids on open projects.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="completed">
                  <Card>
                    <CardHeader>
                      <CardTitle>Completed Gigs</CardTitle>
                      <CardDescription>Projects you have successfully completed.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {myCompletedGigs && myCompletedGigs.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
                          {myCompletedGigs.map((request) => {
                             const hasNotification = !localStorage.getItem(getNotificationKeyForRequest(request));
                            return <RequestCard key={request.id} request={request} hasNotification={hasNotification}/>
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <p>You have not completed any gigs yet.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
          </TabsContent>
        </Tabs>
      )}

    </main>
  );
}
