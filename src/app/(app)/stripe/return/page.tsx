
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Loader, AlertCircle } from 'lucide-react';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function StripeReturnPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Please wait while we confirm your account details with Stripe.');

  useEffect(() => {
    const accountId = searchParams.get('account_id');
    const pendingAccountId = sessionStorage.getItem('stripe_account_id_pending');
    
    if (!accountId || accountId !== pendingAccountId) {
      setStatus('error');
      setMessage('Invalid return URL. Please try the setup process again from the Earnings page.');
      sessionStorage.removeItem('stripe_account_id_pending');
      return;
    }
    
    if (!user || !firestore) {
      // This might happen if the page reloads and Firebase auth isn't ready yet.
      // We'll let it retry as the user state updates.
      return;
    }

    const saveStripeId = async () => {
      try {
        const userDocRef = doc(firestore, 'users', user.uid);
        const updateData = { stripeAccountId: accountId };

        // We use updateDoc here and catch the error to provide context
        await updateDoc(userDocRef, updateData)
         .catch(err => {
            // Re-throw with more context for our error listener
            throw new FirestorePermissionError({
                path: `users/${user.uid}`,
                operation: 'update',
                requestResourceData: { stripeAccountId: accountId }
            });
         });

        setStatus('success');
        setMessage('Your payout account has been successfully connected. You can now receive payments.');
        toast({
            title: 'Account Connected!',
            description: 'Your Stripe account is now linked.',
        });

      } catch (error) {
        console.error("Failed to save Stripe Account ID:", error);
        
        // If it's already our special error, just emit it.
        if (error instanceof FirestorePermissionError) {
             errorEmitter.emit('permission-error', error);
        }

        setStatus('error');
        setMessage('There was a problem saving your Stripe account details. Please try again or contact support.');
        
      } finally {
        // Clean up the temporary session storage item
        sessionStorage.removeItem('stripe_account_id_pending');
      }
    };

    saveStripeId();

  }, [searchParams, user, firestore, toast, router]);

  return (
    <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
            {status === 'verifying' && <Loader className="mx-auto h-12 w-12 animate-spin text-muted-foreground" />}
            {status === 'success' && <CheckCircle className="mx-auto h-12 w-12 text-green-500" />}
            {status === 'error' && <AlertCircle className="mx-auto h-12 w-12 text-destructive" />}
            
            <CardTitle className="text-2xl mt-4">
                {status === 'verifying' && 'Verifying Account...'}
                {status === 'success' && 'Setup Complete!'}
                {status === 'error' && 'An Error Occurred'}
            </CardTitle>
            <CardDescription>
               {message}
            </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/earnings">Return to Earnings</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
