import { initializeFirebaseAdmin } from '../server/firebase-admin';
import { db } from '../server/firebase-admin';

export default async function handler(req, res) {
  // Initialize Firebase Admin
  await initializeFirebaseAdmin();
  
  // Security check - require userId parameter
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ 
      error: 'Missing required parameter: userId',
      example: '/api/subscription-debug?userId=YOUR_USER_ID',
    });
  }
  
  try {
    // Get the user document
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        userId,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Get user data, but remove sensitive information
    const userData = userDoc.data();
    
    // Create a sanitized version of user data for safe display
    const safeUserData = {
      uid: userData.uid,
      email: userData.email ? userData.email.substring(0, 3) + '***' : 'None',
      displayName: userData.displayName || 'None',
      isPro: userData.isPro === true,
      subscriptionPlan: userData.subscriptionPlan || 'none',
      subscriptionStatus: userData.subscriptionStatus || 'none',
      subscriptionEndDate: userData.subscriptionEndDate,
      modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 0,
      modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
      lastUpdated: userData.lastUpdated,
      lastResetDate: userData.lastResetDate,
    };
    
    // Return sanitized user data along with environment info
    return res.status(200).json({
      success: true,
      userId,
      user: safeUserData,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'Not set',
        deployTimestamp: process.env.DEPLOY_TIMESTAMP || 'Not set',
      }
    });
    
  } catch (error) {
    console.error('Error in subscription-debug API:', error);
    
    return res.status(500).json({
      error: 'Server error processing subscription debug request',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
} 