'use client';
import React, { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Loader } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CheckoutFormProps {
  onSuccessfulPayment: () => void;
}

export default function CheckoutForm({ onSuccessfulPayment }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      setIsLoading(false);
      return;
    }

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required', // Stay on page to handle success/failure
    });

    if (error) {
      // This point will only be reached if there is an immediate error when
      // confirming the payment. Otherwise, your customer will be redirected to
      // your `return_url`. For some payment methods like iDEAL, your customer will
      // be redirected to an intermediate site first to authorize the payment, then
      // redirected to the `return_url`.
      setErrorMessage(error.message || 'An unexpected error occurred.');
      toast({
        variant: 'destructive',
        title: 'Payment failed',
        description: error.message || 'An unexpected error occurred.',
      });
      setIsLoading(false);
    } else {
      // Payment succeeded.
      toast({
        title: 'Payment Successful!',
        description: 'Your payment has been processed.',
      });
      onSuccessfulPayment();
      // Don't set loading to false here, as the parent will handle closing the dialog
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button disabled={isLoading || !stripe || !elements} className="w-full">
        {isLoading ? (
          <Loader className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          'Pay now'
        )}
      </Button>
      {errorMessage && <div className="text-destructive text-sm">{errorMessage}</div>}
    </form>
  );
}
