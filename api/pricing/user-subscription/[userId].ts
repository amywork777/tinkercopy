import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import * as admin from 'firebase-admin';

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
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
      });
      
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized directly in user-subscription endpoint');
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

// Initialize Stripe - Fix: Add null check and default to empty string
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
// Initialize Stripe
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16' as any,
});

// Default free tier values
const freeTierDefaults = {
  isPro: false,
  modelsRemainingThisMonth: 2, // Free tier limit
  modelsGeneratedThisMonth: 0,
  downloadsThisMonth: 0,
  subscriptionStatus: 'none',
  subscriptionEndDate: null,
  subscriptionPlan: 'free',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set appropriate CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get userId from path parameter
    const { userId } = req.query;
    
    console.log('1. Received request for user subscription:', {
      userId,
      queryParams: req.query,
      headers: req.headers
    });
    
    if (!userId || typeof userId !== 'string') {
      console.error('2. Invalid userId:', userId);
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid userId parameter'
      });
    }
    
    console.log('3. Fetching subscription for user:', userId);
    
    // Initialize Firebase and Firestore directly
    console.log('4. Initializing Firebase...');
    const adminSdk = initializeFirebaseDirectly();
    const db = getFirestoreDirectly();
    
    console.log('5. Fetching user document...');
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log('6. User document not found, returning free tier defaults');
      return res.json({
        ...freeTierDefaults,
        success: true
      });
    }
    
    console.log('7. User found in Firestore, checking subscription status');
    const userData = userDoc.data() || {};
    console.log('8. User data:', userData);
    
    // If we already have subscription data in Firestore, return it
    if (userData.subscriptionStatus && userData.subscriptionStatus !== 'none') {
      console.log('9. User has subscription data in Firestore:', userData.subscriptionStatus);
      
      // Return formatted subscription data
      return res.json({
        success: true,
        isPro: userData.isPro === true,
        modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 2,
        modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
        downloadsThisMonth: userData.downloadsThisMonth || 0,
        subscriptionStatus: userData.subscriptionStatus,
        subscriptionEndDate: userData.subscriptionEndDate,
        subscriptionPlan: userData.subscriptionPlan || 'free',
      });
    }
    
    // If we have a Stripe customer ID but no subscription status, check with Stripe
    if (userData.stripeCustomerId) {
      console.log('10. User has Stripe customer ID:', userData.stripeCustomerId);
      
      try {
        // Check for active subscriptions
        console.log('11. Checking Stripe for active subscriptions...');
        const subscriptions = await stripe.subscriptions.list({
          customer: userData.stripeCustomerId,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions && subscriptions.data && subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          console.log('12. Found active subscription:', subscription.id);
          
          // Calculate subscription end date
          const subscriptionEndDate = subscription.current_period_end ? 
            new Date(subscription.current_period_end * 1000).toISOString() : 
            new Date().toISOString();
          
          // Get price ID with null checks
          const priceId = subscription.items?.data?.[0]?.price?.id || 'unknown';
          
          // Update user document with subscription info
          const updateData = {
            isPro: true,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionEndDate: subscriptionEndDate,
            subscriptionPlan: priceId,
            modelsRemainingThisMonth: 999999,
            updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
          };
          
          console.log('13. Updating user document with subscription data:', updateData);
          
          try {
            await userDoc.ref.set(updateData, { merge: true });
            console.log('14. Successfully updated user document');
            
            // Return updated subscription data
            return res.json({
              success: true,
              isPro: true,
              modelsRemainingThisMonth: 999999,
              modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
              downloadsThisMonth: userData.downloadsThisMonth || 0,
              subscriptionStatus: subscription.status,
              subscriptionEndDate: subscriptionEndDate,
              subscriptionPlan: priceId,
            });
          } catch (updateError) {
            console.error('15. Error updating user document:', updateError);
            // Continue to return the subscription data even if update fails
            return res.json({
              success: true,
              isPro: true,
              modelsRemainingThisMonth: 999999,
              modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
              downloadsThisMonth: userData.downloadsThisMonth || 0,
              subscriptionStatus: subscription.status,
              subscriptionEndDate: subscriptionEndDate,
              subscriptionPlan: priceId,
            });
          }
        }
      } catch (stripeError) {
        console.error('16. Error checking subscription with Stripe:', stripeError);
      }
    }
    
    // If we get here, return free tier defaults
    console.log('17. No active subscription found, returning free tier defaults');
    return res.json({
      success: true,
      ...freeTierDefaults
    });
    
  } catch (error) {
    console.error('18. Error processing request:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}