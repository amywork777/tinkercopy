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
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    console.log('Firebase Admin initialized successfully in check-trial endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Get service instances
const auth = getAuth();
const db = getFirestore();

/**
 * Checks if a user's trial has expired and downgrades them if needed
 * This function can be called manually or via a scheduled function
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId parameter'
      });
    }

    await checkUserTrialStatus(userId, res);
  } catch (error: any) {
    console.error('Error checking trial status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

/**
 * Checks a specific user's trial status
 */
async function checkUserTrialStatus(userId: string, res: VercelResponse) {
  console.log(`Checking trial status for user: ${userId}`);
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  const userData = userDoc.data() || {};
  
  // Check if user is on trial
  if (userData.trialActive !== true) {
    return res.status(200).json({
      success: true,
      message: 'User is not on trial',
      status: userData.subscriptionStatus || 'none',
      isPro: userData.isPro || false
    });
  }
  
  // Check if trial has expired
  const now = new Date();
  const trialEndDate = new Date(userData.trialEndDate);
  
  console.log(`Trial status for ${userId}:
    Current time: ${now.toISOString()}
    Trial end time: ${trialEndDate.toISOString()}
    Time remaining: ${Math.max(0, (trialEndDate.getTime() - now.getTime()) / 1000 / 60).toFixed(2)} minutes
  `);
  
  if (now > trialEndDate) {
    console.log(`Trial has expired for user ${userId}. Downgrading to free tier.`);
    
    // Update user to free tier
    await userRef.update({
      isPro: false,
      trialActive: false,
      subscriptionStatus: 'none',
      subscriptionPlan: 'free',
      modelsRemainingThisMonth: 2,
      trialEndDate: null,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Trial expired, user downgraded to free tier',
      status: 'none',
      isPro: false,
      trialActive: false,
      remainingTime: 0
    });
  }
  
  // Trial is still active
  const remainingTimeMs = trialEndDate.getTime() - now.getTime();
  const remainingMinutes = Math.max(0, remainingTimeMs / 1000 / 60);
  
  return res.status(200).json({
    success: true,
    message: 'Trial is active',
    status: 'trial',
    isPro: true,
    trialActive: true,
    remainingTime: remainingMinutes
  });
} 