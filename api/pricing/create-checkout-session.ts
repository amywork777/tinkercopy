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
  console.log('1. Received checkout session request:', {
    body: req.body,
    headers: req.headers,
    method: req.method
  });

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
    
    if (!priceId || !userId) {
      console.error('2. Missing required parameters:', { priceId, userId, email });
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log('3. Getting Firestore instance');
    const db = getFirestoreDirectly();
    const userRef = db.collection('users').doc(userId);
    
    console.log('4. Fetching user document from path:', `users/${userId}`);
    const userDoc = await userRef.get();
    console.log('4a. User document exists:', userDoc.exists);
    if (userDoc.exists) {
      console.log('4b. Current user data:', userDoc.data());
    }
    
    // Get or create customer
    let customerId;
    if (userDoc.exists && userDoc.data()?.stripeCustomerId) {
      customerId = userDoc.data()?.stripeCustomerId;
      console.log('5. Found existing Stripe customer:', customerId);
    } else {
      console.log('6. Creating new Stripe customer');
      try {
        const customer = await stripe.customers.create({
          email,
          metadata: {
            userId,
          },
        });
        customerId = customer.id;
        console.log('7. Created new Stripe customer:', customerId);
        
        const userData = {
          email,
          stripeCustomerId: customerId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        console.log('8. Attempting to update user document with:', userData);
        
        await userRef.set(userData, { merge: true });
        
        // Verify the write
        const updatedDoc = await userRef.get();
        console.log('8a. Verified user document after update:', updatedDoc.data());
      } catch (error) {
        console.error('9. Error creating Stripe customer:', error);
        throw error;
      }
    }
    
    console.log('10. Creating checkout session');
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
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
        userId,
        source: 'pricing_page'
      },
      subscription_data: {
        metadata: {
          userId,
          source: 'pricing_page'
        }
      },
      allow_promotion_codes: true,
    });
    
    console.log('11. Checkout session created:', {
      sessionId: session.id,
      url: session.url
    });
    
    return res.status(200).json({ 
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('12. Error in checkout session creation:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
} 