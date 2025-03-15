import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin ONCE using modern ESM approach
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
      // Remove storage bucket as it's not needed for Firestore operations
    });
    console.log('Firebase Admin initialized successfully in user-subscription with project:', process.env.FIREBASE_PROJECT_ID);
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw error; // Re-throw to prevent silent failures
  }
}

// Get service instances
const auth = getAuth();
const db = getFirestore();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// Default free tier values
const freeTierDefaults = {
  isPro: false,
  modelsRemainingThisMonth: 2,
  modelsGeneratedThisMonth: 0,
  downloadsThisMonth: 0,
  subscriptionStatus: 'none',
  subscriptionEndDate: null,
  subscriptionPlan: 'free',
  trialActive: false,
  trialEndDate: null
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== USER SUBSCRIPTION REQUEST START ===');
  console.log('Request headers:', req.headers);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Log request parameters
    console.log('Request query:', req.query);
    
    const userId = req.query.userId as string;
    if (!userId) {
      console.error('Missing userId in request');
      return res.status(400).json({
        error: 'Missing userId parameter',
        details: {
          query: req.query
        }
      });
    }

    console.log(`Getting subscription status for user: ${userId} from Firestore`);

    // Get user data from Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    // If user doesn't exist, return free tier defaults
    if (!userDoc.exists) {
      console.log(`User ${userId} not found in Firestore, returning free tier defaults`);
      return res.status(200).json(freeTierDefaults);
    }

    const userData = userDoc.data();
    console.log('Found user data in Firestore:', {
      ...userData,
      uid: '[REDACTED]',
      email: '[REDACTED]'
    });

    // Check if user has Stripe customer ID
    const stripeCustomerId = userData?.stripeCustomerId;
    if (!stripeCustomerId) {
      console.log(`User ${userId} has no Stripe customer ID, returning free tier status`);
      return res.status(200).json({
        ...freeTierDefaults,
        ...userData,
        stripeCustomerId: null
      });
    }

    try {
      // Get customer's subscriptions from Stripe
      console.log(`Fetching Stripe subscriptions for customer: ${stripeCustomerId}`);
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
        expand: ['data.default_payment_method']
      });

      if (!subscriptions.data.length) {
        console.log(`No active subscriptions found for customer ${stripeCustomerId}`);
        
        // Update Firestore to reflect no active subscription
        await userRef.set({
          isPro: false,
          subscriptionStatus: 'none',
          subscriptionPlan: 'free',
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        return res.status(200).json({
          ...freeTierDefaults,
          ...userData,
          subscriptionStatus: 'none'
        });
      }

      // Get the most recent active subscription
      const subscription = subscriptions.data[0];
      const price = subscription.items.data[0].price;

      console.log('Found active subscription:', {
        id: subscription.id,
        status: subscription.status,
        priceId: price.id
      });

      // Update Firestore with latest subscription status
      const updateData = {
        subscriptionStatus: subscription.status,
        subscriptionPlan: price.id,
        isPro: true,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date().toISOString()
      };

      console.log('Updating Firestore with subscription data:', updateData);
      await userRef.set(updateData, { merge: true });

      const response = {
        ...userData,
        ...updateData
      };

      console.log('=== USER SUBSCRIPTION REQUEST END ===');
      return res.status(200).json(response);

    } catch (stripeError) {
      console.error('Error fetching Stripe subscriptions:', stripeError);
      // If Stripe fails, return user data without subscription info
      return res.status(200).json({
        ...freeTierDefaults,
        ...userData,
        error: 'Failed to fetch subscription data'
      });
    }

  } catch (error: any) {
    console.error('Error in user-subscription handler:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      message: error.message
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: {
        name: error.name,
        code: error.code
      }
    });
  }
}