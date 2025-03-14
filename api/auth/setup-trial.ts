import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Try to load service account from environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;
    
    // Fix: Add null checks and make sure admin credential is valid
    if (!privateKey) {
      console.error('Firebase private key is missing or invalid');
    }
    
    const credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      privateKey: privateKey || '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    });
    
    admin.initializeApp({
      credential: credential,
      storageBucket: 'taiyaki-test1.firebasestorage.app'
    });
    
    console.log('Firebase Admin SDK initialized in setup-trial endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
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

  try {
    const { userId, email, idToken } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: userId and email are required' 
      });
    }

    // Verify the Firebase ID token if provided (extra security)
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isPro: true, // Temporarily pro during trial
      trialActive: true,
      trialEndDate: trialEndDate.toISOString(),
      subscriptionStatus: 'trial',
      subscriptionPlan: 'trial',
      modelsRemainingThisMonth: 999999, // Unlimited during trial
      lastResetDate: new Date().toISOString().substring(0, 7),
    };
    
    // Create or update the user document
    if (userDoc.exists) {
      await userRef.update(userData);
      console.log(`Updated existing user ${userId} with trial information`);
    } else {
      await userRef.set(userData);
      console.log(`Created new user ${userId} with trial information`);
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