import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin ONCE
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

/**
 * Sets up a one-hour free trial for a newly registered user
 * This function is called from the client when a user completes registration
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== REQUEST START ===');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    console.log('Request body:', {
      ...req.body,
      idToken: req.body.idToken ? '[REDACTED]' : undefined
    });

    const { idToken, userId, email } = req.body;

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
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('Token verified for user:', decodedToken.uid);

    if (decodedToken.uid !== userId) {
      console.error('Token/User mismatch:', { tokenUid: decodedToken.uid, userId });
      return res.status(403).json({ error: 'Invalid user ID' });
    }

    // Create/update user document
    console.log('Getting Firestore instance...');
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log('Writing user data:', { ...userData, uid: '[REDACTED]' });
    
    await userRef.set(userData, { merge: true });
    
    // Verify the write
    console.log('Verifying document write...');
    const doc = await userRef.get();
    if (!doc.exists) {
      throw new Error('Failed to create user document');
    }

    console.log('User document created successfully');
    console.log('=== REQUEST END ===');
    
    return res.status(200).json({
      success: true,
      message: 'Trial activated',
      trialEndDate: trialEndDate.toISOString()
    });

  } catch (error: any) {
    console.error('Error in handler:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
} 