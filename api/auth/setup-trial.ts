import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// PRODUCTION HOTFIX: Direct Firebase initialization for Vercel deployment
// This ensures the API works even if utils/firebase-admin.ts is missing
let firebaseInitialized = false;

// Initialize Firebase Admin if needed
function initializeFirebaseDirectly() {
  if (!admin.apps.length) {
    try {
      console.log('Starting Firebase initialization...');
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

      // Use the storage bucket from environment variables
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app';

      console.log('Firebase configuration:', {
        projectId: process.env.FIREBASE_PROJECT_ID,
        hasPrivateKey: !!privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        storageBucket: storageBucket,
        privateKeyLength: privateKey?.length
      });
      
      const credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      });
      
      console.log('Created admin credential, initializing app...');
      
      admin.initializeApp({
        credential: credential,
        storageBucket: storageBucket
      });
      
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized successfully');

      // Verify initialization by trying to access Firestore
      const db = admin.firestore();
      console.log('Firestore access verified');
      
      return admin;
    } catch (error: any) {
      console.error('Error initializing Firebase:', {
        error: error.message,
        stack: error.stack,
        code: error.code
      });
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
    console.log('Getting Firestore instance...');
    const adminInstance = initializeFirebaseDirectly();
    const db = adminInstance.firestore();
    
    // Verify Firestore connection
    console.log('Testing Firestore connection...');
    db.collection('_test_').doc('_test_').set({ test: true }, { merge: true })
      .then(() => {
        console.log('Firestore write test successful');
        db.collection('_test_').doc('_test_').delete()
          .then(() => console.log('Test document cleaned up'))
          .catch((err: any) => console.error('Error cleaning up test document:', err));
      })
      .catch((err: any) => console.error('Firestore write test failed:', err));
    
    console.log('Successfully got Firestore instance');
    return db;
  } catch (error: any) {
    console.error('Error getting Firestore instance:', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    throw error;
  }
}

// Get the Auth instance, initializing Firebase if necessary
function getAuthDirectly() {
  try {
    console.log('Getting Auth instance...');
    const adminInstance = initializeFirebaseDirectly();
    const auth = adminInstance.auth();
    console.log('Successfully got Auth instance');
    return auth;
  } catch (error: any) {
    console.error('Error getting Auth instance:', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
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

    const { idToken, userId, email } = req.body;

    if (!idToken || !userId || !email) {
      console.error('2. Missing required fields in request body:', { 
        hasIdToken: !!idToken,
        hasUserId: !!userId,
        hasEmail: !!email
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields in request body'
      });
    }

    console.log('3. Getting Firebase instances...');
    const db = getFirestoreDirectly();
    const auth = getAuthDirectly();

    console.log('4. Verifying ID token...');
    const decodedToken = await auth.verifyIdToken(idToken);
    console.log('5. Token verified for user:', decodedToken.uid);

    // Verify that the provided userId matches the token
    if (decodedToken.uid !== userId) {
      console.error('6. User ID mismatch:', {
        providedUserId: userId,
        tokenUserId: decodedToken.uid
      });
      return res.status(403).json({
        success: false,
        error: 'User ID mismatch'
      });
    }

    // Verify that the provided email matches the token
    if (decodedToken.email !== email) {
      console.error('7. Email mismatch:', {
        providedEmail: email,
        tokenEmail: decodedToken.email
      });
      return res.status(403).json({
        success: false,
        error: 'Email mismatch'
      });
    }

    const userRef = db.collection('users').doc(userId);
    
    console.log('8. Checking if user document exists...');
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('9. Found existing user data:', userData);
      
      // If user already has a subscription or trial, return early
      if (userData?.subscriptionStatus && userData.subscriptionStatus !== 'none') {
        console.log('10. User already has subscription:', userData.subscriptionStatus);
        return res.json({
          success: true,
          message: 'User already has an active subscription'
        });
      }
      
      if (userData?.trialActive) {
        console.log('11. User already has active trial');
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

    console.log('12. Creating user document with initial data:', updateData);

    try {
      await userRef.set(updateData);
      console.log('13. Successfully created user document');
      
      // Verify the update
      const updatedDoc = await userRef.get();
      if (!updatedDoc.exists) {
        throw new Error('Document was not created');
      }
      console.log('14. Verified user document after update:', updatedDoc.data());
      
      return res.json({
        success: true,
        message: 'Trial setup successful',
        trialEndDate: trialEndDate.toISOString()
      });
    } catch (updateError: any) {
      console.error('15. Error creating user document:', {
        error: updateError.message,
        code: updateError.code,
        userId: decodedToken.uid
      });
      throw updateError;
    }
  } catch (error: any) {
    console.error('16. Error processing request:', {
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