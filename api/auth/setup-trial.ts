import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// PRODUCTION HOTFIX: Direct Firebase initialization for Vercel deployment
// This ensures the API works even if utils/firebase-admin.ts is missing
let firebaseInitialized = false;

// Initialize Firebase Admin if needed
function initializeFirebaseDirectly() {
  if (!admin.apps.length) {
    try {
      // Try to load service account from environment variable
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      if (!privateKey) {
        throw new Error('Firebase private key is missing or invalid');
      }
      
      if (!process.env.FIREBASE_PROJECT_ID) {
        throw new Error('Firebase project ID is missing');
      }
      
      if (!process.env.FIREBASE_CLIENT_EMAIL) {
        throw new Error('Firebase client email is missing');
      }

      // Derive admin storage bucket from public bucket if not set
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 
        (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET 
          ? process.env.FIREBASE_PROJECT_ID + '.appspot.com'
          : 'taiyaki-test1.appspot.com');

      console.log('Initializing Firebase with:', {
        projectId: process.env.FIREBASE_PROJECT_ID,
        hasPrivateKey: !!privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        storageBucket: storageBucket
      });
      
      const credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      });
      
      admin.initializeApp({
        credential: credential,
        storageBucket: storageBucket
      });
      
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      throw error;
    }
  } else {
    console.log('Firebase Admin SDK already initialized');
  }
  
  return admin;
}

// Get the Firestore instance, initializing Firebase if necessary
function getFirestoreDirectly() {
  try {
    const adminInstance = initializeFirebaseDirectly();
    const db = adminInstance.firestore();
    console.log('Successfully got Firestore instance');
    return db;
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
}

// Get the Auth instance, initializing Firebase if necessary
function getAuthDirectly() {
  try {
    const adminInstance = initializeFirebaseDirectly();
    const auth = adminInstance.auth();
    console.log('Successfully got Auth instance');
    return auth;
  } catch (error) {
    console.error('Error getting Auth instance:', error);
    throw error;
  }
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

    console.log('3. Getting Firebase instances...');
    const db = getFirestoreDirectly();
    const auth = getAuthDirectly();

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

    // Calculate trial end date (one hour from now)
    const trialEndDate = new Date();
    trialEndDate.setHours(trialEndDate.getHours() + 1);

    const updateData = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      displayName: decodedToken.name || '',
      isPro: true, // Pro access during trial
      lastResetDate: new Date().toISOString().slice(0, 7), // Format: "YYYY-MM"
      modelsRemainingThisMonth: 999999, // Unlimited during trial
      photoURL: decodedToken.picture || '',
      subscriptionEndDate: trialEndDate.toISOString(),
      subscriptionPlan: 'trial',
      subscriptionStatus: 'trial',
      trialActive: true,
      trialEndDate: trialEndDate.toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log('10. Creating user document with initial data:', updateData);

    try {
      await userRef.set(updateData);
      console.log('11. Successfully created user document');
      
      // Verify the update
      const updatedDoc = await userRef.get();
      if (!updatedDoc.exists) {
        throw new Error('Document was not created');
      }
      console.log('12. Verified user document after update:', updatedDoc.data());
      
      return res.json({
        success: true,
        message: 'Trial setup successful',
        trialEndDate: trialEndDate.toISOString()
      });
    } catch (updateError: any) {
      console.error('13. Error creating user document:', {
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