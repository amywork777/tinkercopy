import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import * as admin from 'firebase-admin';

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
      storageBucket: 'taiyaki-test1.firebasestorage.app'
    });
    
    console.log('Firebase Admin SDK initialized in user-subscription endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
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
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid userId parameter'
      });
    }
    
    console.log(`Fetching subscription for user: ${userId}`);
    
    // Step 1: First check Firestore directly
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      console.log('User found in Firestore, checking subscription status');
      const userData = userDoc.data() || {};
      
      // If we already have subscription data in Firestore, return it
      if (userData.subscriptionStatus && userData.subscriptionStatus !== 'none') {
        console.log(`User has subscription data in Firestore: ${userData.subscriptionStatus}`);
        
        // Return formatted subscription data
        return res.json({
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
        console.log(`User has Stripe customer ID: ${userData.stripeCustomerId}, checking with Stripe`);
        
        try {
          // Check for active subscriptions
          const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripeCustomerId,
            status: 'active',
            limit: 1
          });
          
          if (subscriptions.data.length > 0) {
            const subscription = subscriptions.data[0];
            console.log(`Found active subscription for customer: ${subscription.id}`);
            
            // Calculate subscription end date
            const subscriptionEndDate = new Date(subscription.current_period_end * 1000).toISOString();
            const priceId = subscription.items.data[0].price.id;
            
            // Update user document with subscription info
            const updateData = {
              isPro: true,
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              subscriptionEndDate: subscriptionEndDate,
              subscriptionPlan: priceId,
              modelsRemainingThisMonth: 999999, // Effectively unlimited
              updatedAt: admin.firestore.Timestamp.fromDate(new Date())
            };
            
            console.log(`Updating user document with subscription data:`, updateData);
            await userDoc.ref.update(updateData);
            
            // Return updated subscription data
            return res.json({
              isPro: true,
              modelsRemainingThisMonth: 999999,
              modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
              downloadsThisMonth: userData.downloadsThisMonth || 0,
              subscriptionStatus: subscription.status,
              subscriptionEndDate: subscriptionEndDate,
              subscriptionPlan: priceId,
            });
          }
        } catch (stripeError) {
          console.error('Error checking subscription with Stripe:', stripeError);
          // Continue to try other methods
        }
      }
    }
    
    // Step 2: Search for Stripe customer by user ID metadata
    console.log('Searching for Stripe customer by user ID metadata');
    try {
      const customers = await stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1
      });
      
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        console.log(`Found Stripe customer by metadata: ${customer.id}`);
        
        // Get subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          console.log(`Found active subscription: ${subscription.id}`);
          
          // Calculate subscription end date
          const subscriptionEndDate = new Date(subscription.current_period_end * 1000).toISOString();
          const priceId = subscription.items.data[0].price.id;
          
          // Create or update user document with subscription info
          const updateData = {
            uid: userId,
            email: customer.email || '',
            isPro: true,
            stripeCustomerId: customer.id,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionEndDate: subscriptionEndDate,
            subscriptionPlan: priceId,
            modelsRemainingThisMonth: 999999, // Effectively unlimited
            updatedAt: admin.firestore.Timestamp.fromDate(new Date())
          };
          
          console.log('Creating or updating user document with subscription data');
          await db.collection('users').doc(userId).set(updateData, { merge: true });
          
          // Return subscription data
          return res.json({
            isPro: true,
            modelsRemainingThisMonth: 999999,
            modelsGeneratedThisMonth: 0,
            downloadsThisMonth: 0,
            subscriptionStatus: subscription.status,
            subscriptionEndDate: subscriptionEndDate,
            subscriptionPlan: priceId,
          });
        }
      }
    } catch (stripeError) {
      console.error('Error searching for Stripe customer:', stripeError);
      // Continue to use free tier defaults
    }
    
    // No subscription found - return free tier defaults
    console.log('No subscription found for user, returning free tier defaults');
    return res.json(freeTierDefaults);
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscription information'
    });
  }
} 