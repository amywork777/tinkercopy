import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Define interfaces for type safety
interface UserData {
  isPro?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionEndDate?: string;
  subscriptionPlan?: string;
  modelsRemainingThisMonth?: number;
  [key: string]: any; // Allow additional properties
}

interface StripeSubscription {
  id: string;
  status: string;
  current_period_end: number;
  items: {
    data: Array<{
      price: {
        id: string;
      }
    }>
  };
  [key: string]: any; // Allow additional properties
}

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
    
    console.log('Firebase Admin SDK initialized in fix-subscription endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

/**
 * API endpoint to fix a user's subscription status
 * This is an emergency fix for users who have paid but their account is not upgraded
 */
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userId, email, idToken, fixType = 'check' } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: userId and email are required' 
      });
    }

    // Verify the Firebase ID token if provided (for security)
    if (idToken) {
      try {
        await admin.auth().verifyIdToken(idToken);
      } catch (tokenError) {
        console.error('Error verifying ID token:', tokenError);
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid authentication token' 
        });
      }
    }

    // Get Firestore instance
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    
    // Check if user exists in Firestore
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found in database' 
      });
    }
    
    const userData = userDoc.data() as UserData;
    console.log(`Found user ${userId} in Firestore:`, userData);
    
    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let stripeCustomerId = userData?.stripeCustomerId;
    let subscription: StripeSubscription | null = null;
    
    // If user doesn't have a Stripe customer ID, try to find one
    if (!stripeCustomerId) {
      try {
        // Search by metadata
        const customers = await stripe.customers.search({
          query: `metadata['userId']:'${userId}'`,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
          console.log(`Found Stripe customer ID for user ${userId}: ${stripeCustomerId}`);
          
          // Update the user record with the customer ID
          await userRef.update({
            stripeCustomerId: stripeCustomerId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Try searching by email
          const emailCustomers = await stripe.customers.list({
            email: email,
            limit: 1
          });
          
          if (emailCustomers.data.length > 0) {
            stripeCustomerId = emailCustomers.data[0].id;
            console.log(`Found Stripe customer by email for user ${userId}: ${stripeCustomerId}`);
            
            // Update the customer metadata in Stripe
            await stripe.customers.update(stripeCustomerId, {
              metadata: { userId: userId }
            });
            
            // Update the user record with the customer ID
            await userRef.update({
              stripeCustomerId: stripeCustomerId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      } catch (stripeError) {
        console.error('Error searching for Stripe customer:', stripeError);
      }
    }
    
    // If we now have a stripeCustomerId, check for subscriptions
    if (stripeCustomerId) {
      try {
        // Check for active subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          subscription = subscriptions.data[0] as StripeSubscription;
          console.log(`Found active subscription for user ${userId}: ${subscription.id}`);
          
          // If user is not Pro but has an active subscription, or if forceUpdate is true
          if (!userData.isPro || fixType === 'force') {
            console.log(`Upgrading user ${userId} to Pro status`);
            
            // Calculate subscription end date
            const endDate = new Date(subscription.current_period_end * 1000);
            
            // Update the user's subscription status
            const updateData = {
              isPro: true,
              stripeCustomerId: stripeCustomerId,
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              subscriptionEndDate: endDate.toISOString(),
              subscriptionPlan: subscription.items.data[0].price.id,
              modelsRemainingThisMonth: 999999, // Effectively unlimited
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Update the user document
            await userRef.update(updateData);
            
            // Fetch updated user data
            const updatedDoc = await userRef.get();
            
            return res.status(200).json({
              success: true,
              message: 'User upgraded to Pro status successfully',
              userData: updatedDoc.data(),
              fixApplied: true
            });
          } else {
            return res.status(200).json({
              success: true,
              message: 'User already has Pro status',
              userData: userData,
              fixApplied: false
            });
          }
        } else {
          // No active subscriptions found
          console.log(`No active subscriptions found for Stripe customer: ${stripeCustomerId}`);
          
          // If this is a force upgrade request, upgrade the user anyway
          if (fixType === 'force') {
            console.log(`Force upgrading user ${userId} to Pro status`);
            
            // Calculate subscription end date (1 year from now)
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            // Update the user's subscription status
            const updateData = {
              isPro: true,
              stripeCustomerId: stripeCustomerId,
              subscriptionStatus: 'active',
              subscriptionEndDate: endDate.toISOString(),
              subscriptionPlan: process.env.STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
              modelsRemainingThisMonth: 999999, // Effectively unlimited
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Update the user document
            await userRef.update(updateData);
            
            // Fetch updated user data
            const updatedDoc = await userRef.get();
            
            return res.status(200).json({
              success: true,
              message: 'User force upgraded to Pro status',
              userData: updatedDoc.data(),
              fixApplied: true
            });
          } else {
            return res.status(200).json({
              success: false,
              message: 'No active subscription found for this user',
              userData: userData,
              fixApplied: false
            });
          }
        }
      } catch (stripeError) {
        console.error('Error checking for subscriptions:', stripeError);
      }
    }
    
    // If no Stripe customer ID was found or if we reach this point
    if (fixType === 'force') {
      console.log(`Force upgrading user ${userId} to Pro status without Stripe info`);
      
      // Calculate subscription end date (1 year from now)
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      
      // Update the user's subscription status
      const updateData = {
        isPro: true,
        subscriptionStatus: 'active',
        subscriptionEndDate: endDate.toISOString(),
        subscriptionPlan: process.env.STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
        modelsRemainingThisMonth: 999999, // Effectively unlimited
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Update the user document
      await userRef.update(updateData);
      
      // Fetch updated user data
      const updatedDoc = await userRef.get();
      
      return res.status(200).json({
        success: true,
        message: 'User force upgraded to Pro status without Stripe info',
        userData: updatedDoc.data(),
        fixApplied: true
      });
    }
    
    return res.status(200).json({
      success: false,
      message: 'No subscription found and no force upgrade requested',
      userData: userData,
      fixApplied: false
    });
  } catch (error: any) {
    console.error('Error fixing subscription:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fixing subscription',
      error: error.message
    });
  }
} 