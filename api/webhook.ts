import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buffer } from 'micro';

// Initialize Firebase Admin ONCE using modern ESM approach
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    console.log('Firebase Admin initialized successfully in webhook');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

// Get service instances
const auth = getAuth();
const db = getFirestore();

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// Define interfaces for type safety
interface UserData {
  uid?: string;
  email?: string;
  isPro?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionEndDate?: string;
  subscriptionPlan?: string;
  modelsRemainingThisMonth?: number;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
}

// This is a special helper for raw bodies in Vercel serverless functions
export const config = {
  api: {
    bodyParser: false, // Disable body parsing, needed for Stripe webhook verification
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawBody = await buffer(req);
  console.log('1. Received webhook event:', {
    method: req.method,
    headers: req.headers,
    bodyLength: rawBody.length,
    rawBody: rawBody.toString()
  });

  // Log environment variables (excluding sensitive data)
  console.log('2. Environment check:', {
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
    hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL
  });

  if (req.method !== 'POST') {
    console.log('3. Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    console.error('4. Missing Stripe signature');
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    console.log('5. Attempting to construct Stripe event with signature:', signature);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    console.log('6. Successfully constructed event:', {
      type: event.type,
      id: event.id
    });

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('7. Processing completed checkout session:', {
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          metadata: session.metadata
        });

        try {
          // Get the user ID from metadata first
          const userId = session.metadata?.userId;
          if (!userId) {
            console.error('8. No userId found in session metadata');
            return res.status(400).json({ error: 'No userId in metadata' });
          }

          console.log('9. Creating document reference for user:', userId);
          const userRef = db.collection('users').doc(userId);

          // Get the customer
          console.log('10. Retrieving customer details');
          const customer = await stripe.customers.retrieve(session.customer as string);
          console.log('11. Customer details:', {
            id: customer.id,
            email: (customer as any).email
          });

          // Update basic customer info immediately
          const initialUpdate = {
            stripeCustomerId: customer.id,
            email: (customer as any).email,
            updatedAt: FieldValue.serverTimestamp()
          };

          console.log('12. Writing initial customer info:', initialUpdate);
          await userRef.set(initialUpdate, { merge: true });
          
          // Verify the write
          const docAfterWrite = await userRef.get();
          console.log('12a. Document after write:', docAfterWrite.exists ? docAfterWrite.data() : 'Document does not exist');
        } catch (error) {
          console.error('Error processing checkout session:', error);
          throw error;
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log(`Processing subscription ${event.type}:`, {
          id: subscription.id,
          customer: subscription.customer,
          status: subscription.status
        });

        try {
          // Find user by Stripe customer ID
          console.log('13. Querying for user with stripeCustomerId:', subscription.customer);
          const snapshot = await db
            .collection('users')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();

          console.log('14. Query complete. Empty?', snapshot.empty);

          if (snapshot.empty) {
            console.error('No user found with customer ID:', subscription.customer);
            return res.status(400).json({ error: 'User not found' });
          }

          const userDoc = snapshot.docs[0];
          console.log('15. Found user document:', userDoc.id);

          const updateData = {
            isPro: true,
            stripeCustomerId: subscription.customer,
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
            subscriptionPlan: subscription.items?.data?.[0]?.price?.id || 'pro',
            modelsRemainingThisMonth: 999999,
            lastResetDate: new Date().toISOString().slice(0, 7),
            trialActive: false,
            trialEndDate: null,
            updatedAt: FieldValue.serverTimestamp()
          };

          console.log('16. Updating user subscription data:', updateData);
          await userDoc.ref.set(updateData, { merge: true });
          
          // Verify the write
          const docAfterWrite = await userDoc.ref.get();
          console.log('16a. Document after write:', docAfterWrite.exists ? docAfterWrite.data() : 'Document does not exist');
        } catch (error) {
          console.error('Error processing subscription:', error);
          throw error;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('Processing subscription deletion:', subscription.id);

        try {
          // Find user by Stripe customer ID
          const snapshot = await db
            .collection('users')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            await userDoc.ref.set({
              isPro: false,
              subscriptionStatus: 'none',
              subscriptionPlan: 'free',
              modelsRemainingThisMonth: 2,
              lastResetDate: new Date().toISOString().slice(0, 7),
              trialActive: false,
              trialEndDate: null,
              subscriptionEndDate: null,
              subscriptionId: null,
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
          }
        } catch (error) {
          console.error('Error processing subscription deletion:', error);
          throw error;
        }
        break;
      }
    }

    return res.json({ received: true });
  } catch (error: any) {
    console.error('Error in webhook handler:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}