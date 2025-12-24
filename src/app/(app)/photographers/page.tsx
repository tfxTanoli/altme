
'use client';

import * as React from 'react';
import { useFirestore, useFirebase } from '@/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc, orderBy } from 'firebase/firestore';
import { ref, query as rtdbQuery, orderByChild, equalTo, get } from 'firebase/database';
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
  const { database } = useFirebase();
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
      if (!database || !firestore) return;
      setIsLoading(true);

      try {
        // 1. Fetch data from RTDB (Profiles & Users) and Firestore (Reviews) in parallel
        const profilesRef = rtdbQuery(ref(database, 'photographerProfiles'), orderByChild('isAcceptingRequests'), equalTo(true));
        const usersRef = ref(database, 'users');
        const reviewsQuery = query(collection(firestore, 'reviews')); // Reviews are still in Firestore

        const [profilesSnap, usersSnap, reviewsSnap] = await Promise.all([
          get(profilesRef),
          get(usersRef),
          getDocs(reviewsQuery)
        ]);

        // Process RTDB Profiles
        const profiles: PhotographerProfile[] = [];
        if (profilesSnap.exists()) {
          profilesSnap.forEach(childSnap => {
            profiles.push({ id: childSnap.key, ...childSnap.val() } as PhotographerProfile);
          });
        }

        // Process RTDB Users
        const usersMap = new Map<string, User>();
        if (usersSnap.exists()) {
          usersSnap.forEach(childSnap => {
            const userData = childSnap.val();
            if (userData.status !== 'deleted') {
              usersMap.set(childSnap.key as string, { id: childSnap.key, ...userData } as User);
            }
          });
        }

        // Process Firestore Reviews
        const reviewsByReviewee = new Map<string, Review[]>();
        reviewsSnap.forEach(doc => {
          const review = doc.data() as Review;
          if (!reviewsByReviewee.has(review.revieweeId)) {
            reviewsByReviewee.set(review.revieweeId, []);
          }
          reviewsByReviewee.get(review.revieweeId)!.push(review);
        });

        // 2. Fetch portfolio items for all profiles (from RTDB now)
        // Note: Since we have the profile object from RTDB, portfolioItems might already be nested if fetched in one go,
        // but usually valid RTDB structure keeps them separate or nested. 
        // Based on previous code: `photographerProfiles/profileId/portfolioItems`
        // Let's check if they came with the profile fetch. In RTDB they often do if we fetch the parent node.

        // Re-map profiles to check for nested portfolioItems or fetch them if needed.
        // If the `photographerProfiles` structure has `portfolioItems` as a child node, `profilesSnap` already includes them!
        // Let's assume they are present in the profile object if nested.
        // However, we need to map them to an array.

        const enrichedData = profiles.map(profile => {
          const user = usersMap.get(profile.userId);
          if (!user) return null;

          const userReviews = reviewsByReviewee.get(profile.userId) || [];
          const averageRating = userReviews.length > 0
            ? userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length
            : 0;

          // Extract portfolio items from the profile object (if nested in RTDB)
          let portfolioItems: PortfolioItem[] = [];
          // @ts-ignore: Accessing potential child node
          if (profile.portfolioItems) {
            // @ts-ignore
            portfolioItems = Object.entries(profile.portfolioItems).map(([key, value]: [string, any]) => ({
              id: key,
              ...value
            }));
          }

          // Sort portfolio items (newest first or by createdAt if available)
          portfolioItems.sort((a, b) => {
            // @ts-ignore
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (Number(a.createdAt) || 0);
            // @ts-ignore
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (Number(b.createdAt) || 0);
            return (timeB as number) - (timeA as number);
          });

          // Limit to 10 items for the card
          portfolioItems = portfolioItems.slice(0, 10);

          return {
            ...user,
            profile,
            portfolioItems,
            averageRating,
            reviewCount: userReviews.length,
          };
        }).filter((p): p is EnrichedPhotographer => p !== null);

        setAllPhotographers(enrichedData);
        console.log("Fetched Profiles:", profiles.length);
        console.log("Fetched Users:", usersMap.size);
        console.log("Enriched Photographers:", enrichedData.length);

      } catch (error) {
        console.error("Error fetching photographers:", error);
        setAllPhotographers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndEnrichPhotographers();
  }, [database, firestore]);


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
