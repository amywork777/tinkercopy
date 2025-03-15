import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import * as admin from 'firebase-admin';
import { buffer } from 'micro';

// PRODUCTION HOTFIX: Direct Firebase initialization for Vercel deployment
// This ensures the API works even if utils/firebase-admin.ts is missing
let firebaseInitialized = false;

// Initialize Firebase Admin if needed
function initializeFirebaseDirectly() {
  if (!firebaseInitialized && !admin.apps.length) {
    try {
      // Try to load service account from environment variable
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      // Add validation for required environment variables
      if (!privateKey) {
        console.error('Firebase private key is missing or invalid');
      }
      
      if (!process.env.FIREBASE_PROJECT_ID) {
        console.error('Firebase project ID is missing');
      }
      
      if (!process.env.FIREBASE_CLIENT_EMAIL) {
        console.error('Firebase client email is missing');
      }
      
      const credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey || '',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      });
      
      admin.initializeApp({
        credential: credential,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'model-fusion-studio.appspot.com'
      });
      
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized directly in webhook handler');
    } catch (error) {
      console.error('Error initializing Firebase directly:', error);
      throw error;
    }
  } else if (firebaseInitialized) {
    console.log('Using existing Firebase Admin SDK instance');
  } else if (admin.apps.length) {
    firebaseInitialized = true;
    console.log('Using existing Firebase Admin app');
  }
  
  return admin;
}

// Get the Firestore instance, initializing Firebase if necessary
function getFirestoreDirectly() {
  const adminInstance = initializeFirebaseDirectly();
  return adminInstance.firestore();
}

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
  createdAt?: any; // using any for flexibility with server timestamps
  updatedAt?: any;
  [key: string]: any; // Allow additional properties
}

// This is a special helper for raw bodies in Vercel serverless functions
export const config = {
  api: {
    bodyParser: false, // Disable body parsing, needed for Stripe webhook verification
  },
};

// Initialize Stripe with the secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawBody = await buffer(req);
  console.log('1. Received webhook event:', {
    method: req.method,
    headers: req.headers,
    bodyLength: rawBody.length,
    rawBody: rawBody.toString() // Log raw body for debugging
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

          // Initialize Firestore early
          console.log('9. Initializing Firestore');
          const db = getFirestoreDirectly();
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          console.log('12. Updating initial customer info:', initialUpdate);
          await userRef.set(initialUpdate, { merge: true });
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
          const db = getFirestoreDirectly();
          const snapshot = await db
            .collection('users')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();

          if (snapshot.empty) {
            console.error('No user found with customer ID:', subscription.customer);
            return res.status(400).json({ error: 'User not found' });
          }

          const userDoc = snapshot.docs[0];
          const updateData = {
            isPro: true,
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
            subscriptionPlan: subscription.items?.data?.[0]?.price?.id || 'pro',
            modelsRemainingThisMonth: 999999,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          console.log('Updating user subscription data:', updateData);
          await userDoc.ref.set(updateData, { merge: true });

          // Verify the update
          const updatedDoc = await userDoc.ref.get();
          console.log('Updated user data:', updatedDoc.data());
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
          const db = getFirestoreDirectly();
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
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    console.error('23. Error processing webhook:', {
      message: error.message,
      code: error.code,
      type: error.type,
      stack: error.stack
    });
    return res.status(400).json({
      error: 'Webhook error',
      details: error.message
    });
  }
}