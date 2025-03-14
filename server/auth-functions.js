// Firebase authentication functions for handling user events
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Load service account from environment variables
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.appspot.com'
    });
    
    console.log('Firebase Admin SDK initialized in auth-functions');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

/**
 * Sets up a one-hour free trial for a new user
 * @param {string} userId - The Firebase user ID
 * @param {string} email - The user's email address
 */
async function setupOneHourFreeTrial(userId, email) {
  if (!userId) {
    console.error('No user ID provided for free trial setup');
    return;
  }

  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    
    // Check if user already exists in Firestore
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      // Only set up trial if user doesn't already have pro status
      // This prevents resetting trial when a user signs in again
      const userData = userDoc.data();
      
      if (userData.isPro || userData.trialActive) {
        console.log(`User ${userId} already has Pro access or an active trial`);
        return;
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
    
    return { success: true, trialEndDate: trialEndDate.toISOString() };
  } catch (error) {
    console.error('Error setting up one-hour trial:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Checks if a user's trial has expired and downgrades them if needed
 * @param {string} userId - The Firebase user ID
 */
async function checkAndExpireTrialIfNeeded(userId) {
  if (!userId) {
    console.error('No user ID provided for trial expiration check');
    return;
  }
  
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User ${userId} does not exist, can't check trial status`);
      return { success: false, error: 'User not found' };
    }
    
    const userData = userDoc.data();
    
    // Skip if user is not on trial or has a paid subscription
    if (!userData.trialActive || userData.subscriptionStatus === 'active') {
      return { success: true, message: 'User is not on trial or has paid subscription' };
    }
    
    const now = new Date();
    const trialEndDate = new Date(userData.trialEndDate);
    
    // Check if trial has expired
    if (now > trialEndDate) {
      console.log(`Trial has expired for user ${userId}. Downgrading to free tier.`);
      
      // Update user to free tier
      await userRef.update({
        isPro: false,
        trialActive: false,
        subscriptionStatus: 'none',
        subscriptionPlan: 'free',
        modelsRemainingThisMonth: 2, // Reset to free tier limit
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { 
        success: true, 
        message: 'Trial expired, user downgraded to free tier',
        status: 'expired'
      };
    }
    
    return { 
      success: true, 
      message: 'Trial still active',
      status: 'active',
      remainingTime: trialEndDate.getTime() - now.getTime()
    };
  } catch (error) {
    console.error('Error checking trial status:', error);
    return { success: false, error: error.message };
  }
}

// Export the functions
module.exports = {
  setupOneHourFreeTrial,
  checkAndExpireTrialIfNeeded
}; 