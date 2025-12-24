
'use server';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    // This API route no longer interacts with Firestore directly.
    // It only creates the Stripe account and the onboarding link.
    // The account ID will be saved to Firestore on the client-side after successful onboarding.

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US', // Explicitly setting the country is required for Connect onboarding
      email: email,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${request.headers.get('origin')}/earnings?reauth=true`,
      return_url: `${request.headers.get('origin')}/stripe/return?account_id=${account.id}`,
      type: 'account_onboarding',
    });

    // Return the Stripe account ID along with the URL
    return NextResponse.json({ url: accountLink.url, accountId: account.id });

  } catch (error: any) {
    console.error('Stripe Connect API Error:', error);
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
