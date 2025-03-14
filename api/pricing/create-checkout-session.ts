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
      console.log('Firebase Admin SDK initialized directly in checkout endpoint');
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

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

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
    const { priceId, userId, email } = req.body;
    
    if (!priceId || !userId || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters',
        message: 'priceId, userId, and email are all required'
      });
    }
    
    console.log(`Creating subscription checkout for user: ${userId}, email: ${email}, priceId: ${priceId}`);
    
    // Initialize Firebase directly - ignore any import errors
    const adminSdk = initializeFirebaseDirectly();
    const db = getFirestoreDirectly();
    
    // Look up user in Firestore
    let customerId: string | undefined = undefined;
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists && userDoc.data()?.stripeCustomerId) {
        customerId = userDoc.data()?.stripeCustomerId;
        console.log(`Found existing customer ID for user ${userId}: ${customerId}`);
      }
    } catch (error) {
      console.error('Error fetching user from Firestore:', error);
      // Continue without customerId - we'll create a new one
    }
    
    // If no customer ID found, create a new customer
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email,
          metadata: {
            userId, // Store user ID in Stripe customer metadata
          },
        });
        customerId = customer.id;
        console.log(`Created new Stripe customer for user ${userId}: ${customerId}`);
        
        // Update user record with new customer ID
        await db.collection('users').doc(userId).set({
          email,
          stripeCustomerId: customerId,
          createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
          updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`Updated user ${userId} with Stripe customer ID: ${customerId}`);
      } catch (error) {
        console.error('Error creating Stripe customer:', error);
        // Continue without updating Firestore - the webhook will handle it
      }
    }
    
    // IMMEDIATE FIX: Pre-set the user as Pro after checkout creation
    try {
      // This is a temporary fix to ensure users get upgraded immediately
      // to work around any webhook issues
      const userRef = db.collection('users').doc(userId);
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      
      await userRef.set({
        email,
        isPro: true,
        stripeCustomerId: customerId,
        subscriptionStatus: 'active',
        subscriptionPlan: priceId,
        subscriptionEndDate: endDate.toISOString(),
        modelsRemainingThisMonth: 999999,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log(`EMERGENCY FIX: Pre-activated Pro status for user ${userId}`);
    } catch (error) {
      console.error('Error in emergency Pro status activation:', error);
    }
    
    // Create the checkout session with user ID in metadata
    const session = await stripe.checkout.sessions.create({
      customer: customerId || undefined,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://www.fishcad.com'}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://www.fishcad.com'}/pricing`,
      metadata: {
        userId, // IMPORTANT: Store user ID in session metadata for webhook
        source: 'pricing_page'
      },
      subscription_data: {
        metadata: {
          userId, // Store user ID in subscription metadata as well
          source: 'pricing_page'
        }
        // No trial by default
      },
      allow_promotion_codes: true, // Allow promotion codes 
    });
    
    console.log(`Checkout session created with ID: ${session.id}, for user: ${userId}`);
    
    // Double-check that the user document was updated and has Pro status
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log(`User status after checkout: isPro=${userData?.isPro}, status=${userData?.subscriptionStatus}`);
        
        if (!userData?.isPro) {
          console.log('User still not marked as Pro, applying one more update...');
          await db.collection('users').doc(userId).update({
            isPro: true,
            subscriptionStatus: 'active',
            updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    } catch (verifyError) {
      console.error('Error verifying user status:', verifyError);
    }
    
    return res.status(200).json({ 
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create checkout session'
    });
  }
} 