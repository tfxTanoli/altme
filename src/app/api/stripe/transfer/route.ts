
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// This assumes you have your Stripe secret key in environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const { amount, destination } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount provided.' }, { status: 400 });
    }
    if (!destination) {
      return NextResponse.json({ error: 'No destination account provided.' }, { status: 400 });
    }

    // Create a Transfer to the photographer's Connected Account
    // The amount is in cents, so we multiply by 100
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: destination,
    });

    return NextResponse.json({ success: true, transfer });

  } catch (error: any) {
    console.error('Stripe Transfer API Error:', error);
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred with the transfer.' },
      { status: 500 }
    );
  }
}
