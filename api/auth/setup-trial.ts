import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// PRODUCTION HOTFIX: Direct Firebase initialization for Vercel deployment
// This ensures the API works even if utils/firebase-admin.ts is missing
let firebaseInitialized = false;

// Initialize Firebase Admin if needed
function initializeFirebaseDirectly() {
  // Check if already initialized - avoid trying to access admin.apps.length directly
  try {
    if (firebaseInitialized) {
      console.log('Using existing Firebase Admin SDK instance');
      return admin;
    }
    
    // If no apps exist or this is first initialization
    if (!admin.apps || admin.apps.length === 0) {
      try {
        // Parse the private key - Vercel requires special handling
        const privateKey = process.env.FIREBASE_PRIVATE_KEY 
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
          : undefined;
        
        // Initialize with credential
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID || '',
            privateKey: privateKey || '',
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
        });
        
        firebaseInitialized = true;
        console.log('Firebase Admin SDK initialized directly in setup-trial endpoint');
      } catch (error) {
        console.error('Error initializing Firebase directly:', error);
        throw error;
      }
    } else {
      firebaseInitialized = true;
      console.log('Using existing Firebase Admin app');
    }
    
    return admin;
  } catch (error) {
    console.error('Error in Firebase initialization check:', error);
    
    // Last resort - try to initialize regardless of previous state
    try {
      if (!firebaseInitialized) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY 
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
          : '';
          
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID || '',
            privateKey: privateKey,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
        
        firebaseInitialized = true;
        console.log('Firebase Admin SDK initialized with fallback method');
      }
      return admin;
    } catch (initError) {
      console.error('Fatal error initializing Firebase:', initError);
      throw initError;
    }
  }
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

  console.log(`Setup trial request received: ${JSON.stringify(req.body)}`);

  try {
    const { userId, email, idToken } = req.body;

    if (!userId) {
      console.error('Missing required userId parameter');
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: userId is required' 
      });
    }

    if (!email) {
      console.error('Missing required email parameter');
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: email is required' 
      });
    }

    // Initialize Firebase directly
    const adminSdk = initializeFirebaseDirectly();
    const db = getFirestoreDirectly();
    const auth = getAuthDirectly();

    // Verify the Firebase ID token if provided (extra security)
    if (idToken) {
      try {
        await auth.verifyIdToken(idToken);
        console.log('ID token verified successfully');
      } catch (tokenError) {
        console.error('Error verifying ID token:', tokenError);
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid authentication token' 
        });
      }
    }

    const userRef = db.collection('users').doc(userId);
    
    // Check if user already exists in Firestore
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      // Fix: Add null check and default to empty object
      const userData = userDoc.data() || {};
      
      // Check if user already has pro status or active trial
      if (userData.isPro === true || userData.trialActive === true) {
        console.log(`User ${userId} already has Pro access or an active trial`);
        return res.status(200).json({ 
          success: true, 
          message: 'User already has pro access or active trial',
          status: userData.subscriptionStatus || 'unknown',
          isPro: userData.isPro || false,
          trialActive: userData.trialActive || false,
          trialEndDate: userData.trialEndDate || null
        });
      }
    }
    
    // Calculate trial end time (one hour from now)
    const trialEndDate = new Date();
    trialEndDate.setHours(trialEndDate.getHours() + 1);
    
    console.log(`Setting up one-hour trial for user ${userId} until ${trialEndDate.toISOString()}`);
    
    // Set up user document with trial information
    const userData = {
      uid: userId,
      email: email,
      createdAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      updatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      isPro: true, // Temporarily pro during trial
      trialActive: true,
      trialEndDate: trialEndDate.toISOString(),
      subscriptionStatus: 'trial',
      subscriptionPlan: 'trial',
      modelsRemainingThisMonth: 999999, // Unlimited during trial
      lastResetDate: new Date().toISOString().substring(0, 7),
    };
    
    try {
      // Create or update the user document
      if (userDoc.exists) {
        await userRef.update(userData);
        console.log(`Updated existing user ${userId} with trial information`);
      } else {
        await userRef.set(userData);
        console.log(`Created new user ${userId} with trial information`);
      }
      
      // Double-check that the update was applied
      const updatedDoc = await userRef.get();
      if (!updatedDoc.exists) {
        console.error(`Failed to create user document for ${userId}`);
        throw new Error('Failed to create user document');
      }
      
      const updatedData = updatedDoc.data();
      console.log(`User data after update: ${JSON.stringify(updatedData)}`);
    } catch (dbError) {
      console.error('Error writing to Firestore:', dbError);
      throw dbError;
    }
    
    return res.status(200).json({
      success: true,
      message: 'One-hour free trial activated successfully',
      trialEndDate: trialEndDate.toISOString(),
      isPro: true,
      trialActive: true
    });
  } catch (error: any) {
    console.error('Error setting up trial:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error setting up trial',
      error: error.message
    });
  }
} 