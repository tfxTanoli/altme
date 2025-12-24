
'use client';

import * as React from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc, orderBy } from 'firebase/firestore';
import type { User, PhotographerProfile, Review, PortfolioItem } from '@/lib/types';
import { Loader, Search, ListFilter, Star } from 'lucide-react';
import PhotographerCard from '@/components/photographers/photographer-card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { countries } from '@/lib/countries';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';

type EnrichedPhotographer = User & {
    profile: PhotographerProfile;
    portfolioItems: PortfolioItem[];
    averageRating: number;
    reviewCount: number;
};

export default function PhotographersPage() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialCountry = searchParams.get('country') || 'all';

  const [searchQuery, setSearchQuery] = React.useState(initialQuery);
  const [selectedCountry, setSelectedCountry] = React.useState(initialCountry);
  const [selectedRating, setSelectedRating] = React.useState(0);
  const [allPhotographers, setAllPhotographers] = React.useState<EnrichedPhotographer[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchAndEnrichPhotographers = async () => {
        if (!firestore) return;
        setIsLoading(true);

        try {
            // 1. Fetch all required data in parallel
            const profilesQuery = query(collection(firestore, 'photographerProfiles'), where('isAcceptingRequests', '==', true));
            
            const [profilesSnap, usersSnap, reviewsSnap] = await Promise.all([
                getDocs(profilesQuery).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'photographerProfiles', operation: 'list' }));
                    throw err;
                }),
                getDocs(query(collection(firestore, 'users'), where('status', '!=', 'deleted'))).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'users', operation: 'list' }));
                    throw err;
                }),
                getDocs(query(collection(firestore, 'reviews'))).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'reviews', operation: 'list' }));
                    throw err;
                })
            ]);

            const profiles = profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PhotographerProfile));
            const usersMap = new Map(usersSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as User]));
            const reviewsByReviewee = new Map<string, Review[]>();

            reviewsSnap.forEach(doc => {
                const review = doc.data() as Review;
                if (!reviewsByReviewee.has(review.revieweeId)) {
                    reviewsByReviewee.set(review.revieweeId, []);
                }
                reviewsByReviewee.get(review.revieweeId)!.push(review);
            });

            // 2. Fetch portfolio items for all profiles in parallel
            const portfolioPromises = profiles.map(profile => {
                const itemsQuery = query(collection(firestore, 'photographerProfiles', profile.id, 'portfolioItems'), orderBy('createdAt', 'asc'), limit(10));
                return getDocs(itemsQuery).then(snapshot => ({
                    profileId: profile.id,
                    items: snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as PortfolioItem)
                })).catch(err => {
                    // Log error but don't fail the entire page load
                    console.error(`Failed to fetch portfolio for profile ${profile.id}:`, err);
                    return { profileId: profile.id, items: [] };
                });
            });

            const portfolioResults = await Promise.all(portfolioPromises);
            const portfolioMap = new Map(portfolioResults.map(p => [p.profileId, p.items]));

            // 3. Combine the data on the client side
            const enrichedData = profiles.map(profile => {
                const user = usersMap.get(profile.userId);
                if (!user) return null; // Skip if user data is missing or deleted

                const userReviews = reviewsByReviewee.get(profile.userId) || [];
                const averageRating = userReviews.length > 0
                    ? userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length
                    : 0;
                
                const portfolioItems = portfolioMap.get(profile.id) || [];

                return {
                    ...user,
                    profile,
                    portfolioItems,
                    averageRating,
                    reviewCount: userReviews.length,
                };
            }).filter((p): p is EnrichedPhotographer => p !== null);
            
            setAllPhotographers(enrichedData);

        } catch (error) {
            if (!(error instanceof FirestorePermissionError)) {
               console.error("Error fetching photographers:", error);
            }
            setAllPhotographers([]);
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchAndEnrichPhotographers();
  }, [firestore]);


  const filteredPhotographers = React.useMemo(() => {
    return allPhotographers.filter(p => {
        const matchesCountry = selectedCountry === 'all' || p.profile?.serviceCountry === selectedCountry;
        const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRating = selectedRating === 0 || p.averageRating >= selectedRating;
        return matchesCountry && matchesSearch && matchesRating;
    });
  }, [allPhotographers, searchQuery, selectedCountry, selectedRating]);
  
  const handleClearFilters = () => {
    setSelectedCountry('all');
    setSearchQuery('');
    setSelectedRating(0);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <h1 className="font-semibold text-lg md:text-2xl">
          Browse Photographers
        </h1>
        <div className="flex-1 md:ml-auto md:flex-grow-0">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:w-auto">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input 
                type="search" 
                placeholder="Search by name..." 
                className="pl-8 h-9 w-full md:w-[200px] lg:w-[250px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="h-9 w-full md:w-auto gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <SelectValue placeholder="Filter by country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country.value} value={country.value}>
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedRating)} onValueChange={(val) => setSelectedRating(Number(val))}>
              <SelectTrigger className="h-9 w-full md:w-auto gap-1">
                <Star className="h-3.5 w-3.5" />
                <SelectValue placeholder="Filter by rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">All Ratings</SelectItem>
                <SelectItem value="4">4.0+ stars</SelectItem>
                <SelectItem value="3">3.0+ stars</SelectItem>
                <SelectItem value="2">2.0+ stars</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" onClick={handleClearFilters}>Clear</Button>
          </div>
        </div>
      </div>
      
       {isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm" >
            <Loader className="h-8 w-8 animate-spin" />
        </div>
       ) : filteredPhotographers && filteredPhotographers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-8">
            {filteredPhotographers.map((photographer) => (
              <PhotographerCard key={photographer.id} photographer={photographer} />
            ))}
        </div>
        ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm" >
            <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
                No Photographers Found
            </h3>
            <p className="text-sm text-muted-foreground">
                Try adjusting your filters or check back later!
            </p>
            </div>
        </div>
        )}
    </main>
  );
}
