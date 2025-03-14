import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Try to load service account from environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      }),
      storageBucket: 'taiyaki-test1.firebasestorage.app'
    });
    
    console.log('Firebase Admin SDK initialized in debug endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Define types for the user data
interface UserDebugInfo {
  id: string;
  email: string;
  createdAt: string;
  isPro: boolean;
  trialActive: boolean;
}

/**
 * Debug endpoint to check if a user exists in Firebase and has correct subscription data
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

  // Support both GET and POST methods
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get userId from query params (GET) or request body (POST)
    const userId = req.method === 'GET' 
      ? req.query.userId as string 
      : req.body.userId as string;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: userId' 
      });
    }

    // Get Firebase Auth user
    console.log(`Looking up Firebase Auth user with ID: ${userId}`);
    let authUser = null;
    try {
      authUser = await admin.auth().getUser(userId);
      console.log(`Firebase Auth user found: ${authUser.uid}`);
    } catch (error) {
      console.error(`Error fetching Firebase Auth user: ${error}`);
    }
    
    // Get Firestore user data
    console.log(`Looking up Firestore user with ID: ${userId}`);
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log(`No Firestore document found for user: ${userId}`);
      return res.status(200).json({
        success: false,
        authUser: authUser || null,
        firestoreUser: null,
        message: 'User exists in Firebase Auth but not in Firestore'
      });
    }
    
    // Return user data
    const userData = userDoc.data();
    console.log(`Firestore user found: ${userId}`);
    
    return res.status(200).json({
      success: true,
      authUser: authUser ? {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
        emailVerified: authUser.emailVerified,
        creationTime: authUser.metadata.creationTime,
        lastSignInTime: authUser.metadata.lastSignInTime
      } : null,
      firestoreUser: userData
    });
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error retrieving user data',
      error: error.message
    });
  }
} 