
'use client';

import * as React from 'react';
import {
  useFirestore,
  useUser,
  addDocumentNonBlocking,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocs,
  getDoc,
  doc
} from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader,
  DollarSign,
  Wallet,
  TrendingUp,
  CheckCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { EscrowPayment, User, PayoutRequest } from '@/lib/types';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';

const PLATFORM_FEE_PERCENTAGE = 0.15; // 15% Platform Fee for client

export default function EarningsPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  const [userData, setUserData] = React.useState<User | null>(null);
  const [isRequestingPayout, setIsRequestingPayout] = React.useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = React.useState(false);

  const [payments, setPayments] = React.useState<EscrowPayment[]>([]);
  const [payoutRequests, setPayoutRequests] = React.useState<PayoutRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);


  React.useEffect(() => {
    if (!firestore || !user) {
        if(!user && !isUserLoading) setIsLoading(false);
        return;
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const userDocRef = doc(firestore, 'users', user.uid);
            const paymentsToUserQuery = query(
                collection(firestore, 'escrowPayments'),
                where('payeeId', '==', user.uid)
            );
            const payoutRequestsQuery = query(
                collection(firestore, 'payoutRequests'),
                where('userId', '==', user.uid)
            );

            const [userDocSnap, paymentsSnapshot, payoutSnapshot] = await Promise.all([
                getDoc(userDocRef),
                getDocs(paymentsToUserQuery).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'escrowPayments', operation: 'list'}));
                    throw err;
                }),
                getDocs(payoutRequestsQuery).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'payoutRequests', operation: 'list'}));
                    throw err;
                })
            ]);

            if (userDocSnap.exists()) {
                setUserData(userDocSnap.data() as User);
            }

            const paymentsData = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EscrowPayment));
            setPayments(paymentsData);
    
            const payoutData = payoutSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayoutRequest));
            payoutData.sort((a, b) => (b.requestedAt?.seconds ?? 0) - (a.requestedAt?.seconds ?? 0));
            setPayoutRequests(payoutData);

        } catch (error) {
            if (!(error instanceof FirestorePermissionError)) {
                console.error("Error fetching earnings data:", error);
            }
            setPayments([]);
            setPayoutRequests([]);
        } finally {
            setIsLoading(false);
        }
    }
    
    fetchData();

  }, [firestore, user, isUserLoading]);


  // --- Calculations ---
  const currentBalance = userData?.balance || 0;
  const lifetimeEarnings = payments
    .filter(p => p.status === 'released')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalWithdrawn = payoutRequests
    .filter(pr => pr.status === 'completed')
    .reduce((sum, pr) => sum + pr.amount, 0);

  const hasPendingPayoutRequest = payoutRequests?.some(pr => pr.status === 'pending');
  const isStripeConnected = !!userData?.stripeAccountId;

  const formatDateFromTimestamp = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
        return format(timestamp.toDate(), 'PPP');
    }
    if (typeof timestamp.seconds === 'number') {
        return format(new Date(timestamp.seconds * 1000), 'PPP');
    }
    return 'Invalid Date';
  }

  // --- Handlers ---
   const handleStripeConnect = async () => {
    if (!user) return;
    setIsConnectingStripe(true);
    try {
      const response = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, email: user.email }),
      });
      if (!response.ok) {
        throw new Error('Failed to create Stripe connect link.');
      }
      const { url, accountId } = await response.json();
      
      // Store the temporary account ID to verify on return
      sessionStorage.setItem('stripe_account_id_pending', accountId);

      // Redirect user to Stripe onboarding using window.location
      window.location.href = url;
    } catch (error: any) {
      console.error('Stripe Connect error:', error);
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: 'Could not connect to Stripe. Please try again.',
      });
      setIsConnectingStripe(false);
    }
  };


  const handleRequestPayout = async () => {
    if (!firestore || !user || currentBalance <= 0) return;

    setIsRequestingPayout(true);
    const payoutData = {
        userId: user.uid,
        amount: currentBalance,
        status: 'pending' as const,
        requestedAt: serverTimestamp(),
    };

    try {
        const newDocRef = await addDocumentNonBlocking(collection(firestore, 'payoutRequests'), payoutData);
        if (newDocRef) {
            const optimisticNewRequest = {
                id: newDocRef.id,
                userId: user.uid,
                amount: currentBalance,
                status: 'pending' as const,
                requestedAt: new Date(), 
            }
            setPayoutRequests(prev => [optimisticNewRequest as any, ...prev]);

            toast({
                title: 'Payout Requested',
                description: `Your request for $${currentBalance.toFixed(2)} has been submitted for processing.`,
            });
        }
    } catch(e) {
        console.error("Error requesting payout:", e);
        toast({
            variant: "destructive",
            title: "Error",
            description: "An unexpected error occurred while requesting the payout."
        });
    } finally {
        setIsRequestingPayout(false);
    }
  };

  const getStatusBadge = (status: EscrowPayment['status']) => {
    switch (status) {
      case 'released':
        return <Badge variant="default" className="bg-green-600">Released to you</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending release</Badge>;
      case 'refunded':
        return <Badge variant="destructive">Refunded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
   const getPayoutStatusBadge = (status: PayoutRequest['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3"/>Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3"/>Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading || isUserLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-lg md:text-2xl">My Earnings</h1>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={currentBalance <= 0 || hasPendingPayoutRequest || isRequestingPayout || !isStripeConnected}>
                 {isRequestingPayout && <Loader className="mr-2 h-4 w-4 animate-spin"/>}
                Request Payout
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request Payout of ${currentBalance.toFixed(2)}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will submit a request to the platform admin to process your payout. 
                Payments are handled via Stripe and will be transferred to your connected account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRequestPayout}>Confirm Request</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

       {!isStripeConnected && (
         <Card>
            <CardHeader>
                <CardTitle>Set Up Payout Account</CardTitle>
                <CardDescription>
                    To receive earnings, you need to connect a Stripe account. This is a secure one-time setup process.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleStripeConnect} disabled={isConnectingStripe}>
                    {isConnectingStripe ? (
                        <>
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                        </>
                    ) : (
                         <>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Set Up Payout Account with Stripe
                        </>
                    )}
                </Button>
            </CardContent>
         </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader className="h-6 w-6 animate-spin" /> : (
              <>
                <div className="text-2xl font-bold">${currentBalance.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Your current withdrawable balance.</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lifetime Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {isLoading ? <Loader className="h-6 w-6 animate-spin" /> : (
              <>
                <div className="text-2xl font-bold">${lifetimeEarnings.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Total funds released to you.</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Withdrawn</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {isLoading ? <Loader className="h-6 w-6 animate-spin" /> : (
              <>
                <div className="text-2xl font-bold">${totalWithdrawn.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Total amount paid out to you.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
         <Card>
            <CardHeader>
            <CardTitle>Earnings History</CardTitle>
            <CardDescription>A log of all payments from completed projects.</CardDescription>
            </CardHeader>
            <CardContent>
            {isLoading ? (
                <div className="flex justify-center items-center h-40"><Loader className="h-8 w-8 animate-spin" /></div>
            ) : payments && payments.length > 0 ? (
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {payments.map((p) => (
                    <TableRow key={p.id}>
                        <TableCell>{formatDateFromTimestamp(p.paymentDate)}</TableCell>
                        <TableCell>${p.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{getStatusBadge(p.status as EscrowPayment['status'])}</TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            ) : (
                <div className="text-center py-12 text-muted-foreground"><p>You haven't received any payments yet.</p></div>
            )}
            </CardContent>
        </Card>

         <Card>
            <CardHeader>
            <CardTitle>Payout History</CardTitle>
            <CardDescription>A log of all your payout requests.</CardDescription>
            </CardHeader>
            <CardContent>
            {isLoading ? (
                <div className="flex justify-center items-center h-40"><Loader className="h-8 w-8 animate-spin" /></div>
            ) : payoutRequests && payoutRequests.length > 0 ? (
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Date Requested</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {payoutRequests.map((pr) => (
                    <TableRow key={pr.id}>
                        <TableCell>{formatDateFromTimestamp(pr.requestedAt)}</TableCell>
                        <TableCell>${pr.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{getPayoutStatusBadge(pr.status as PayoutRequest['status'])}</TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            ) : (
                <div className="text-center py-12 text-muted-foreground"><p>You haven't requested any payouts yet.</p></div>
            )}
            </CardContent>
        </Card>
      </div>

    </main>
  );
}
