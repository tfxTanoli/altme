

'use client';

import * as React from 'react';
import { ListFilter, Loader, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import RequestCard from '@/components/requests/request-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { countries } from '@/lib/countries';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, and, or, getDocs } from 'firebase/firestore';
import type { ProjectRequest } from '@/lib/types';
import { useSearchParams } from 'next/navigation';


export default function BrowseRequestsPage() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialCountry = searchParams.get('country') || 'all';
  
  const [searchQuery, setSearchQuery] = React.useState(initialQuery);
  const [selectedCountry, setSelectedCountry] = React.useState(initialCountry);
  const [allOpenRequests, setAllOpenRequests] = React.useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);


  React.useEffect(() => {
    if (!firestore) return;
    
    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            const filters = [where('status', '==', 'Open')];

            if (selectedCountry && selectedCountry !== 'all') {
                filters.push(where('country', '==', selectedCountry));
            }
            const requestsQuery = query(collection(firestore, 'requests'), ...filters);
            
            // This now includes our improved error handling
            const snapshot = await getDocs(requestsQuery).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'requests',
                    operation: 'list',
                }));
                // It's important to re-throw or handle the error appropriately
                // so subsequent code doesn't run assuming success.
                throw err;
            });

            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRequest));
            setAllOpenRequests(requestsData);

        } catch (error) {
            // FirestorePermissionError is already emitted, so we just need to avoid crashing here
            // if it's not our custom error, we can log it.
            if (!(error instanceof FirestorePermissionError)) {
                console.error("Error fetching requests:", error);
            }
            setAllOpenRequests([]);
        } finally {
            setIsLoading(false);
        }
    }
    fetchRequests();
  }, [firestore, selectedCountry]);

  const filteredRequests = React.useMemo(() => {
    if (!allOpenRequests) return [];
    
    return allOpenRequests.filter(request => {
      return searchQuery 
        ? request.title.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
    });

  }, [allOpenRequests, searchQuery]);
  

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-semibold text-lg md:text-2xl">
          Browse Projects
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="h-9 w-auto gap-1">
                    <ListFilter className="h-3.5 w-3.5" />
                    <SelectValue placeholder="All Countries" />
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
          <div className="relative">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input 
                type="search" 
                placeholder="Search..." 
                className="pl-8 h-9 sm:w-[200px] md:w-[200px] lg:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>
        </div>
      </div>
       {isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm" >
            <Loader className="h-8 w-8 animate-spin" />
        </div>
       ) : filteredRequests && filteredRequests.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-8">
            {filteredRequests.map((request) => (
            <RequestCard key={request.id} request={request} hideStatus={true} />
            ))}
        </div>
        ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm" >
            <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
                No matching projects
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

    