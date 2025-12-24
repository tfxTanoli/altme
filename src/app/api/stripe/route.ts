
'use server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PLATFORM_FEE_PERCENTAGE = 0.15; // 15%

export async function POST(request: Request) {
  try {
    const { amount } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    
    // The amount from the client is the photographer's bid.
    // The service fee is charged to the client on top of the bid amount.
    const amountInCents = Math.round(amount * 100);
    const serviceFeeInCents = Math.round(amountInCents * PLATFORM_FEE_PERCENTAGE);
    const totalAmountInCents = amountInCents + serviceFeeInCents;

    // Create a PaymentIntent. The money will be held in the platform's account.
    // We are using the "Separate Charges and Transfers" model.
    // The platform fee is not taken at this stage. It will be accounted for
    // when the photographer's earnings are calculated and payouts are made.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountInCents,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error('Stripe API Error:', error);
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message}` },
      { status: 500 }
    );
  }
}
