import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import * as admin from 'firebase-admin';
import { buffer } from 'micro';

// This is a special helper for raw bodies in Vercel serverless functions
export const config = {
  api: {
    bodyParser: false, // Disable body parsing, needed for Stripe webhook verification
  },
};

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Try to load service account from environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.appspot.com'
    });
    
    console.log('Firebase Admin SDK initialized in webhook handler');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Special handling for Vercel serverless: get raw body for signature verification
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Get the raw request body for Stripe webhook signature verification
  let rawBody: Buffer;
  try {
    rawBody = await buffer(req);
  } catch (error) {
    console.error('Error getting raw request body:', error);
    return res.status(400).json({ success: false, message: 'Error reading request body' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;

  try {
    // Verify the event came from Stripe using raw body
    event = stripe.webhooks.constructEvent(
      rawBody.toString(),
      sig,
      webhookSecret
    );
    console.log(`✅ Stripe signature verified for event: ${event.type}, id: ${event.id}`);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ success: false, message: `Webhook Error: ${err.message}` });
  }

  // Get Firestore instance
  const db = admin.firestore();
  console.log(`Processing webhook event: ${event.type}, id: ${event.id}`);

  try {
    // Handle the event based on its type
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`Processing completed checkout session: ${session.id}`);
        
        // Only handle subscription checkouts
        if (session.mode !== 'subscription') {
          console.log('Not a subscription checkout, skipping');
          break;
        }
        
        // Make sure we have a subscription ID
        if (!session.subscription) {
          console.error('No subscription ID in completed session');
          break;
        }
        
        // Fetch more details about the subscription
        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        );
        
        // Get user ID from session metadata or customer metadata
        let userId = session.metadata?.userId;
        
        // If no user ID in session metadata, try to get it from customer metadata
        if (!userId && session.customer) {
          const customer = await stripe.customers.retrieve(
            typeof session.customer === 'string' ? session.customer : session.customer.id
          ) as Stripe.Customer;
          
          userId = customer.metadata?.userId;
        }
        
        if (!userId) {
          console.error('No user ID found in session or customer metadata');
          break;
        }
        
        console.log(`Updating subscription status for user: ${userId}`);
        
        // Get subscription plan info
        const priceId = subscription.items.data[0].price.id;
        const isPremiumPlan = true; // All subscription plans are premium
        
        // Update user subscription status in Firestore
        await db.collection('users').doc(userId).set({
          isPro: true,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
          subscriptionPlan: priceId,
          modelsRemainingThisMonth: 999999, // Effectively unlimited
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`User ${userId} subscription updated with status: ${subscription.status}`);
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Processing subscription update: ${subscription.id}`);
        
        // Get customer ID
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        // Find user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (snapshot.empty) {
          console.error(`No user found with Stripe customer ID: ${customerId}`);
          break;
        }
        
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        
        // Check if subscription is active
        const isActive = ['active', 'trialing'].includes(subscription.status);
        
        // Update the user's subscription status
        await usersRef.doc(userId).set({
          isPro: isActive,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
          modelsRemainingThisMonth: isActive ? 999999 : 2, // Unlimited if active, limited if not
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`User ${userId} subscription updated with status: ${subscription.status}`);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Processing subscription deletion: ${subscription.id}`);
        
        // Get customer ID
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        // Find user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (snapshot.empty) {
          console.error(`No user found with Stripe customer ID: ${customerId}`);
          break;
        }
        
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        
        // Downgrade user to free tier
        await usersRef.doc(userId).set({
          isPro: false,
          subscriptionStatus: 'canceled',
          modelsRemainingThisMonth: 2, // Free tier limit
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`User ${userId} subscription canceled`);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    return res.json({ received: true });
  } catch (error: any) {
    console.error(`Error processing webhook: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
} 