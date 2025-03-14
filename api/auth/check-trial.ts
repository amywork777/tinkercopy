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
      })
    });
    
    console.log('Firebase Admin SDK initialized in check-trial endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

/**
 * Checks if a user's trial has expired and downgrades them if needed
 * This function can be called manually or via a scheduled function
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set appropriate CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get user ID from request
    const userId = req.method === 'POST' 
      ? req.body.userId 
      : req.query.userId as string;
    
    // If no user ID is provided, check all trial users
    if (!userId) {
      return await checkAllTrialUsers(res);
    }
    
    // Check specific user's trial status
    return await checkUserTrialStatus(userId, res);
  } catch (error: any) {
    console.error('Error checking trial status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking trial status',
      error: error.message
    });
  }
}

/**
 * Checks a specific user's trial status
 */
async function checkUserTrialStatus(userId: string, res: VercelResponse) {
  console.log(`Checking trial status for user: ${userId}`);
  const db = admin.firestore();
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
      modelsRemainingThisMonth: 2, // Reset to free tier
      trialEndDate: null, // Clear trial end date
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    message: 'Trial is still active',
    status: 'trial',
    isPro: true,
    trialActive: true,
    remainingTime: remainingMinutes,
    trialEndDate: trialEndDate.toISOString()
  });
}

/**
 * Checks all users who have active trials and downgrades any that have expired
 */
async function checkAllTrialUsers(res: VercelResponse) {
  console.log('Checking all active trials for expiration');
  const db = admin.firestore();
  
  // Find all users with active trials
  const usersRef = db.collection('users');
  const snapshot = await usersRef
    .where('trialActive', '==', true)
    .get();
  
  if (snapshot.empty) {
    return res.status(200).json({
      success: true,
      message: 'No active trials found',
      checked: 0,
      expired: 0
    });
  }
  
  console.log(`Found ${snapshot.size} users with active trials`);
  
  // Check each trial and update if expired
  const now = new Date();
  let expiredCount = 0;
  let processedCount = 0;
  
  // Process all trial users
  const updatePromises = snapshot.docs.map(async (doc) => {
    processedCount++;
    const userData = doc.data();
    const userId = doc.id;
    
    try {
      if (!userData.trialEndDate) {
        console.warn(`User ${userId} has trialActive=true but no trialEndDate`);
        return;
      }
      
      const trialEndDate = new Date(userData.trialEndDate);
      
      // Check if trial has expired
      if (now > trialEndDate) {
        console.log(`Trial expired for user ${userId}. Downgrading to free tier.`);
        expiredCount++;
        
        // Update user to free tier
        await doc.ref.update({
          isPro: false,
          trialActive: false,
          subscriptionStatus: 'none',
          subscriptionPlan: 'free',
          modelsRemainingThisMonth: 2, // Reset to free tier
          trialEndDate: null, // Clear trial end date
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error(`Error processing user ${userId}:`, error);
    }
  });
  
  // Wait for all updates to complete
  await Promise.all(updatePromises);
  
  return res.status(200).json({
    success: true,
    message: `Checked ${processedCount} trials, expired ${expiredCount}`,
    checked: processedCount,
    expired: expiredCount
  });
} 