import { VercelRequest, VercelResponse } from '@vercel/node';
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
      console.log('Firebase Admin SDK initialized directly in setup-trial endpoint');
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

// Get the Auth instance, initializing Firebase if necessary
function getAuthDirectly() {
  const adminInstance = initializeFirebaseDirectly();
  return adminInstance.auth();
}

/**
 * Sets up a one-hour free trial for a newly registered user
 * This function is called from the client when a user completes registration
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
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
    console.log('1. Received setup trial request:', {
      method: req.method,
      headers: req.headers,
      body: req.body
    });

    const { idToken } = req.body;

    if (!idToken) {
      console.error('2. Missing idToken in request body');
      return res.status(400).json({
        success: false,
        error: 'Missing idToken in request body'
      });
    }

    console.log('3. Initializing Firebase Admin...');
    const adminSdk = initializeFirebaseDirectly();
    const auth = adminSdk.auth();
    const db = getFirestoreDirectly();

    console.log('4. Verifying ID token...');
    const decodedToken = await auth.verifyIdToken(idToken);
    console.log('5. Token verified for user:', decodedToken.uid);

    const userRef = db.collection('users').doc(decodedToken.uid);
    
    console.log('6. Checking if user document exists...');
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('7. Found existing user data:', userData);
      
      // If user already has a subscription or trial, return early
      if (userData?.subscriptionStatus && userData.subscriptionStatus !== 'none') {
        console.log('8. User already has subscription:', userData.subscriptionStatus);
        return res.json({
          success: true,
          message: 'User already has an active subscription'
        });
      }
      
      if (userData?.trialActive) {
        console.log('9. User already has active trial');
        return res.json({
          success: true,
          message: 'Trial already active'
        });
      }
    }

    // Calculate trial end date (30 days from now)
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);

    const updateData = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      trialActive: true,
      trialEndDate: trialEndDate.toISOString(),
      modelsRemainingThisMonth: 2,
      modelsGeneratedThisMonth: 0,
      downloadsThisMonth: 0,
      subscriptionStatus: 'trial',
      subscriptionPlan: 'trial',
      createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
    };

    console.log('10. Updating user document with trial data:', updateData);

    try {
      await userRef.set(updateData, { merge: true });
      console.log('11. Successfully updated user document with trial data');
      
      // Verify the update
      const updatedDoc = await userRef.get();
      console.log('12. Verified user document after update:', updatedDoc.data());
      
      return res.json({
        success: true,
        message: 'Trial setup successful'
      });
    } catch (updateError: any) {
      console.error('13. Error updating user document:', {
        error: updateError.message,
        code: updateError.code,
        userId: decodedToken.uid
      });
      throw updateError;
    }
  } catch (error: any) {
    console.error('14. Error processing request:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
} 