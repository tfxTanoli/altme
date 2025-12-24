
'use client';

import * as React from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, orderBy, getDocs, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { PayoutRequest, User } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

type EnrichedPayoutRequest = PayoutRequest & {
    user?: User;
};

export default function PayoutsPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [requests, setRequests] = React.useState<EnrichedPayoutRequest[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isUpdating, setIsUpdating] = React.useState<string | null>(null);

    const fetchPayouts = React.useCallback(async () => {
        if (!firestore) return;
        setIsLoading(true);
        try {
            const requestsQuery = query(
                collection(firestore, 'payoutRequests'),
                where('status', '==', 'pending'),
                orderBy('requestedAt', 'asc')
            );
            const snapshot = await getDocs(requestsQuery).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'payoutRequests', operation: 'list' }));
                throw err;
            });

            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayoutRequest));

            if (requestsData.length > 0) {
                const userIds = [...new Set(requestsData.map(r => r.userId))];
                const usersMap = new Map<string, User>();
                
                const userIdChunks: string[][] = [];
                for (let i = 0; i < userIds.length; i += 30) {
                    userIdChunks.push(userIds.slice(i, i + 30));
                }
                
                await Promise.all(userIdChunks.map(async chunk => {
                    if (chunk.length === 0) return; // Add this check
                    const usersQuery = query(collection(firestore, 'users'), where('__name__', 'in', chunk));
                    const usersSnapshot = await getDocs(usersQuery);
                    usersSnapshot.forEach(doc => usersMap.set(doc.id, { id: doc.id, ...doc.data() } as User));
                }));


                const enriched = requestsData.map(r => ({
                    ...r,
                    user: usersMap.get(r.userId),
                }));
                setRequests(enriched);
            } else {
                setRequests([]);
            }
        } catch (error) {
            console.error("Error fetching payout requests:", error);
            setRequests([]);
        } finally {
            setIsLoading(false);
        }
    }, [firestore]);

    React.useEffect(() => {
        fetchPayouts();
    }, [fetchPayouts]);
    
    const handleMarkAsPaid = async (request: EnrichedPayoutRequest) => {
        if (!firestore || !request.user) return;

        // Check for Stripe Account ID
        if (!request.user.stripeAccountId) {
            toast({
                variant: 'destructive',
                title: 'Missing Stripe Account',
                description: `${request.user.name} has not connected their Stripe account. Payout cannot be processed automatically.`,
            });
            return;
        }

        setIsUpdating(request.id);
        
        try {
            // Call the Stripe transfer API
            const response = await fetch('/api/stripe/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: request.amount,
                    destination: request.user.stripeAccountId,
                }),
            });

            if (!response.ok) {
                const { error } = await response.json();
                throw new Error(error || 'Stripe transfer failed.');
            }

            const { transfer } = await response.json();
            
            // If transfer is successful, update the payout request status in Firestore
            const requestRef = doc(firestore, 'payoutRequests', request.id);
            const updateData = {
                status: 'completed' as const,
                completedAt: serverTimestamp()
            };

            await updateDoc(requestRef, updateData);
            
            // Optimistically update the UI
            setRequests(prev => prev.filter(r => r.id !== request.id));
            
            toast({
                title: "Payout Processed",
                description: `Successfully sent $${request.amount.toFixed(2)} to ${request.user.name}.`,
            });

        } catch (error: any) {
            console.error('Payout processing failed:', error);
            toast({
                variant: 'destructive',
                title: 'Payout Failed',
                description: error.message || 'Could not process the payout. Please check the logs.',
            });
        } finally {
             setIsUpdating(null);
        }
    };

    return (
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className="flex items-center">
                <h1 className="font-semibold text-lg md:text-2xl">Payout Requests</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pending Payouts</CardTitle>
                    <CardDescription>
                        Review and process pending payout requests from photographers.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader className="h-8 w-8 animate-spin" />
                        </div>
                    ) : requests.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Date Requested</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar>
                                                    <AvatarImage src={request.user?.photoURL} alt={request.user?.name} />
                                                    <AvatarFallback>{request.user?.name.charAt(0) || 'U'}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium">{request.user?.name}</div>
                                                    <div className="text-sm text-muted-foreground">{request.user?.email}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {format(request.requestedAt.toDate(), 'PPP')}
                                        </TableCell>
                                        <TableCell>${request.amount.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                size="sm" 
                                                onClick={() => handleMarkAsPaid(request)}
                                                disabled={isUpdating === request.id}
                                            >
                                                {isUpdating === request.id ? (
                                                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="mr-2 h-4 w-4" />
                                                )}
                                                Process Payout
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>There are no pending payout requests.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}
