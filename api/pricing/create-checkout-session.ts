import { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
let db: admin.firestore.Firestore;
try {
  // Check if Firebase admin is already initialized
  if (admin.apps.length === 0) {
    // Get Firebase credentials from environment variables
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccount) {
      // Parse the service account JSON if it's provided as a string
      const serviceAccountObj = typeof serviceAccount === 'string' 
        ? JSON.parse(serviceAccount.replace(/\\n/g, '\n')) 
        : serviceAccount;
          
      // Initialize the app
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountObj),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    } else {
      console.warn('Firebase service account key not found. Proceeding without Firebase.');
    }
  }
  
  // Get Firestore instance
  db = admin.firestore();
} catch (error) {
  console.error('Firebase initialization error:', error);
  // Don't fail if Firebase initialization fails, we can still process payments
}

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-08-16' as Stripe.LatestApiVersion,
});

// Stripe price IDs
const PRICE_IDS = {
  PROD: {
    monthly: 'price_1R1jGiCLoBz9jXRlB1uLgvE9',
    yearly: 'price_1R1jGgCLoBz9jXRluMN6PsNw',
  },
  TEST: {
    monthly: 'price_1R1LlMCLoBz9jXRl3OQ5Q6kE',
    yearly: 'price_1R1LmRCLoBz9jXRlQcOuRZJd',
  },
};

// Set to true for test mode, false for production
const USE_TEST_MODE = true;

/**
 * API handler for creating Stripe checkout sessions
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const {
      priceId,
      userId,
      email,
      planType = 'monthly',
      successUrl,
      cancelUrl,
    } = req.body;
    
    console.log('Creating checkout session:', {
      priceId,
      userId,
      email,
      planType,
      mode: USE_TEST_MODE ? 'TEST' : 'LIVE',
    });
    
    // Validate required parameters
    if (!priceId && !planType) {
      return res.status(400).json({ error: 'Price ID or plan type is required' });
    }
    
    // Get the appropriate price ID
    let finalPriceId = priceId;
    if (!finalPriceId) {
      const priceMap = USE_TEST_MODE ? PRICE_IDS.TEST : PRICE_IDS.PROD;
      finalPriceId = planType === 'monthly' ? priceMap.monthly : priceMap.yearly;
    }
    
    // Create checkout session parameters
    const params: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${req.headers.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin}/pricing`,
      metadata: {
        planType,
      },
    };
    
    // Add customer email if provided
    if (email) {
      params.customer_email = email;
    }
    
    // Add client reference ID if provided (for user tracking)
    if (userId) {
      params.client_reference_id = userId;
      
      // Store additional information in Firestore (optional)
      if (db) {
        try {
          await db.collection('checkoutSessions').doc(Date.now().toString()).set({
            userId,
            email,
            planType,
            priceId: finalPriceId,
            createdAt: new Date(),
            mode: USE_TEST_MODE ? 'test' : 'live',
          });
        } catch (firestoreError) {
          console.error('Error storing checkout data in Firestore:', firestoreError);
          // Continue with checkout even if Firestore fails
        }
      }
    }
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create(params);
    
    // Return the session ID and URL
    res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
} 