import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

let firebaseInitialized = false;

function initializeFirebase() {
  if (!firebaseInitialized && !admin.apps.length) {
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      if (!privateKey) {
        throw new Error('Firebase private key is missing');
      }
      
      if (!process.env.FIREBASE_PROJECT_ID) {
        throw new Error('Firebase project ID is missing');
      }
      
      if (!process.env.FIREBASE_CLIENT_EMAIL) {
        throw new Error('Firebase client email is missing');
      }
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'model-fusion-studio.appspot.com'
      });
      
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized');
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      throw error;
    }
  }
  
  return admin;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('1. Received test write request:', {
      body: req.body,
      headers: req.headers
    });

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log('2. Initializing Firebase...');
    const adminSdk = initializeFirebase();
    const db = adminSdk.firestore();

    console.log('3. Getting user document reference...');
    const userRef = db.collection('users').doc(userId);

    console.log('4. Checking if document exists...');
    const doc = await userRef.get();
    console.log('5. Document exists:', doc.exists);
    if (doc.exists) {
      console.log('6. Current data:', doc.data());
    }

    const testData = {
      testWrite: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isPro: true,
      subscriptionStatus: 'test_write',
      subscriptionPlan: 'test_plan',
      modelsRemainingThisMonth: 999,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log('7. Attempting to write test data:', testData);

    // Try both update and set to see which one works
    try {
      console.log('8a. Attempting update...');
      await userRef.update(testData);
      console.log('8b. Update successful');
    } catch (updateError) {
      console.log('8c. Update failed, trying set with merge...');
      await userRef.set(testData, { merge: true });
      console.log('8d. Set with merge successful');
    }

    // Verify the write
    console.log('9. Verifying write...');
    const updatedDoc = await userRef.get();
    console.log('10. Updated document data:', updatedDoc.data());

    return res.status(200).json({
      success: true,
      message: 'Test write successful',
      data: updatedDoc.data()
    });

  } catch (error) {
    console.error('Error in test write:', error);
    return res.status(500).json({
      error: 'Failed to write to Firebase',
      details: error.message,
      stack: error.stack
    });
  }
} 