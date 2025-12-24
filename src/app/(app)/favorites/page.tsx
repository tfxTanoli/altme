
'use client';

import * as React from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot, doc, limit, orderBy } from 'firebase/firestore';
import type { User, PhotographerProfile, Review, PortfolioItem, ProjectRequest } from '@/lib/types';
import { Loader, Heart } from 'lucide-react';
import PhotographerCard from '@/components/photographers/photographer-card';
import RequestCard from '@/components/requests/request-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type EnrichedPhotographer = User & {
    profile: PhotographerProfile;
    portfolioItems?: PortfolioItem[];
    averageRating: number;
    reviewCount: number;
};

function splitIntoChunks<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}


export default function FavoritesPage() {
    const firestore = useFirestore();
    const { user: currentUser, isUserLoading } = useUser();
    
    const [favoritedPhotographers, setFavoritedPhotographers] = React.useState<EnrichedPhotographer[]>([]);
    const [favoritedRequests, setFavoritedRequests] = React.useState<ProjectRequest[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchFavorites = React.useCallback(async (photographerIds: string[], requestIds: string[]) => {
        if (!firestore) return;
        setIsLoading(true);
        
        try {
            // Fetch photographers
            if (photographerIds.length > 0) {
                const idChunks = splitIntoChunks(photographerIds, 30);
                const photographerPromises = idChunks.map(async (chunk) => {
                     const profileQuery = query(collection(firestore, 'photographerProfiles'), where('userId', 'in', chunk));
                     const userQuery = query(collection(firestore, 'users'), where('__name__', 'in', chunk));
                     const reviewsQuery = query(collection(firestore, 'reviews'), where('revieweeId', 'in', chunk));

                    const [profileSnap, userSnap, reviewsSnap] = await Promise.all([
                        getDocs(profileQuery),
                        getDocs(userQuery),
                        getDocs(reviewsQuery)
                    ]);
                    
                    const usersMap = new Map(userSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as User]));
                    const profilesMap = new Map(profileSnap.docs.map(d => {
                        const p = d.data() as PhotographerProfile;
                        return [p.userId, { id: d.id, ...p }];
                    }));
                    const reviewsMap = new Map<string, Review[]>();
                    reviewsSnap.forEach(d => {
                        const review = d.data() as Review;
                        if(!reviewsMap.has(review.revieweeId)) reviewsMap.set(review.revieweeId, []);
                        reviewsMap.get(review.revieweeId)!.push(review);
                    });

                    const portfolioPromises = profileSnap.docs.map(profileDoc => {
                        const itemsQuery = query(collection(firestore, 'photographerProfiles', profileDoc.id, 'portfolioItems'), orderBy('createdAt', 'desc'), limit(10));
                        return getDocs(itemsQuery).then(snapshot => ({
                            profileId: profileDoc.id,
                            items: snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as PortfolioItem)
                        }));
                    });

                    const portfolioResults = await Promise.all(portfolioPromises);
                    const portfolioMap = new Map(portfolioResults.map(p => [p.profileId, p.items]));

                    const enriched: EnrichedPhotographer[] = [];
                    for (const userId of chunk) {
                        const user = usersMap.get(userId);
                        const profile = profilesMap.get(userId);
                        if (user && profile) {
                            const userReviews = reviewsMap.get(userId) || [];
                            const averageRating = userReviews.length > 0 ? userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length : 0;
                            
                            const portfolioItems = portfolioMap.get(profile.id) || [];

                            enriched.push({
                                ...user,
                                profile,
                                portfolioItems,
                                averageRating,
                                reviewCount: userReviews.length,
                            });
                        }
                    }
                    return enriched;
                });
                 const results = (await Promise.all(photographerPromises)).flat();
                 setFavoritedPhotographers(results);
            } else {
                setFavoritedPhotographers([]);
            }

            // Fetch requests
            if (requestIds.length > 0) {
                 const requests: ProjectRequest[] = [];
                 const idChunks = splitIntoChunks(requestIds, 30);
                 for (const chunk of idChunks) {
                    if (chunk.length === 0) continue;
                    const requestsQuery = query(collection(firestore, 'requests'), where('__name__', 'in', chunk));
                    const snapshot = await getDocs(requestsQuery);
                    snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() } as ProjectRequest));
                 }
                setFavoritedRequests(requests);
            } else {
                setFavoritedRequests([]);
            }
        } catch (error) {
            console.error("Error fetching favorites:", error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'users/photographerProfiles/reviews/requests',
                operation: 'list'
            }));
        } finally {
            setIsLoading(false);
        }
    }, [firestore]);
    
    React.useEffect(() => {
        if (isUserLoading || !firestore) {
            return;
        }
        if (!currentUser) {
            setIsLoading(false);
            setFavoritedPhotographers([]);
            setFavoritedRequests([]);
            return;
        }

        const userDocRef = doc(firestore, 'users', currentUser.uid);
        const unsubscribe = onSnapshot(userDocRef, (userDoc) => {
            if (userDoc.exists()) {
                const userData = userDoc.data() as User;
                const photographerIds = userData.favoritePhotographerIds || [];
                const requestIds = userData.favoriteRequestIds || [];
                fetchFavorites(photographerIds, requestIds);
            } else {
                setIsLoading(false);
                setFavoritedPhotographers([]);
                setFavoritedRequests([]);
            }
        },
        (error) => {
            console.error('Error listening to user favorites:', error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `users/${currentUser.uid}`,
                operation: 'get',
            }));
            setIsLoading(false);
        });
        
        return () => unsubscribe();
    }, [currentUser, firestore, isUserLoading, fetchFavorites]);

    const renderEmptyState = (title: string, description: string) => (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-64">
            <div className="flex flex-col items-center gap-2 text-center">
                <Heart className="h-12 w-12 text-muted-foreground" />
                <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
        </div>
    );

    return (
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className="flex items-center">
                <h1 className="font-semibold text-lg md:text-2xl">My Favorites</h1>
            </div>

            {isLoading ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <Tabs defaultValue="photographers">
                    <TabsList>
                        <TabsTrigger value="photographers">Photographers ({favoritedPhotographers.length})</TabsTrigger>
                        <TabsTrigger value="projects">Projects ({favoritedRequests.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="photographers">
                        <Card>
                            <CardHeader>
                                <CardTitle>Favorite Photographers</CardTitle>
                                <CardDescription>Your saved list of talented photographers.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {favoritedPhotographers.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-8">
                                        {favoritedPhotographers.map((photographer) => (
                                            <PhotographerCard key={photographer.id} photographer={photographer} />
                                        ))}
                                    </div>
                                ) : (
                                    renderEmptyState("No Favorite Photographers", "Browse photographers and click the heart to save them.")
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="projects">
                        <Card>
                             <CardHeader>
                                <CardTitle>Favorite Projects</CardTitle>
                                <CardDescription>Your saved list of interesting project requests.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {favoritedRequests.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-8">
                                        {favoritedRequests.map((request) => (
                                            <RequestCard key={request.id} request={request} />
                                        ))}
                                    </div>
                                ) : (
                                     renderEmptyState("No Favorite Projects", "Browse projects and click the heart to save them.")
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            )}
        </main>
    );
}
