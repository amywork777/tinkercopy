import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin ONCE using modern ESM approach
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
      // Remove storage bucket as it's not needed for Firestore operations
    });
    console.log('Firebase Admin initialized successfully in setup-trial with project:', process.env.FIREBASE_PROJECT_ID);
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw error; // Re-throw to prevent silent failures
  }
}

// Get service instances
const auth = getAuth();
const db = getFirestore();

/**
 * Sets up a one-hour free trial for a newly registered user
 * This function is called from the client when a user completes registration
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== SETUP TRIAL REQUEST START ===');
  console.log('Request headers:', req.headers);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Log request body (redact sensitive info)
    console.log('Request body:', {
      ...req.body,
      idToken: req.body.idToken ? '[REDACTED]' : undefined
    });

    const { idToken, userId, email } = req.body;

    // Validate required fields
    if (!idToken || !userId || !email) {
      console.error('Missing required fields:', { 
        hasToken: !!idToken, 
        hasUserId: !!userId, 
        hasEmail: !!email 
      });
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: { hasToken: !!idToken, hasUserId: !!userId, hasEmail: !!email }
      });
    }

    // Verify token first
    console.log('Verifying token...');
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
      console.log('Token verified for user:', decodedToken.uid);
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (decodedToken.uid !== userId) {
      console.error('Token/User mismatch:', { tokenUid: decodedToken.uid, userId });
      return res.status(403).json({ error: 'Invalid user ID' });
    }

    // Get user document reference
    console.log('Getting user document reference...');
    const userRef = db.collection('users').doc(userId);
    
    // Check if user already exists and has active trial
    const existingDoc = await userRef.get();
    if (existingDoc.exists) {
      const userData = existingDoc.data();
      if (userData?.isPro || userData?.trialActive) {
        console.log('User already has pro access or active trial');
        return res.status(200).json({
          success: true,
          message: 'User already has pro access',
          isPro: userData.isPro,
          trialActive: userData.trialActive
        });
      }
    }

    const trialEndDate = new Date();
    trialEndDate.setHours(trialEndDate.getHours() + 1);

    const userData = {
      uid: userId,
      email: email,
      displayName: decodedToken.name || '',
      photoURL: decodedToken.picture || '',
      isPro: true,
      trialActive: true,
      trialEndDate: trialEndDate.toISOString(),
      subscriptionStatus: 'trial',
      subscriptionPlan: 'trial',
      subscriptionEndDate: trialEndDate.toISOString(),
      modelsRemainingThisMonth: 999999,
      lastResetDate: new Date().toISOString().slice(0, 7),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    console.log('Writing user data to Firestore:', {
      collection: 'users',
      docId: userId,
      data: { ...userData, uid: '[REDACTED]' }
    });
    
    try {
      // First attempt to write
      await userRef.set(userData, { merge: true });
      
      // Verify the write immediately
      console.log('Verifying document write...');
      const doc = await userRef.get();
      if (!doc.exists) {
        throw new Error('Failed to create user document - document does not exist after write');
      }
      
      // Verify the data was written correctly
      const writtenData = doc.data();
      if (!writtenData || !writtenData.uid || !writtenData.email) {
        throw new Error('Failed to create user document - missing required fields after write');
      }
      
      console.log('Document write verified successfully:', {
        exists: doc.exists,
        hasUid: !!writtenData.uid,
        hasEmail: !!writtenData.email,
        isPro: writtenData.isPro,
        trialActive: writtenData.trialActive
      });
    } catch (error) {
      console.error('Error writing to Firestore:', error);
      throw error;
    }

    console.log('=== SETUP TRIAL REQUEST END ===');
    
    return res.status(200).json({
      success: true,
      message: 'Trial activated',
      trialEndDate: trialEndDate.toISOString()
    });

  } catch (error: any) {
    console.error('Error in setup-trial handler:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      message: error.message
    });
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      details: {
        name: error.name,
        code: error.code
      }
    });
  }
} 