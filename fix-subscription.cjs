// Script to directly fix subscription status in Firebase
require('dotenv').config({path: '.env.local'});
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully');
}

async function fixSubscription(userId) {
  if (!userId) {
    console.error('No user ID provided');
    console.log('Usage: node fix-subscription.cjs <userId>');
    process.exit(1);
  }

  console.log(`Fixing subscription for user: ${userId}`);
  
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.error('User not found in Firestore');
      process.exit(1);
    }
    
    const userData = userDoc.data();
    console.log('Current user data:');
    console.log(JSON.stringify({
      isPro: userData.isPro,
      subscriptionStatus: userData.subscriptionStatus,
      stripeCustomerId: userData.stripeCustomerId,
      stripeSubscriptionId: userData.stripeSubscriptionId,
    }, null, 2));
    
    // Calculate one year in the future for subscription end date
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    
    // Update user with Pro status
    const updateData = {
      isPro: true,
      subscriptionStatus: 'active',
      subscriptionEndDate: endDate.toISOString(),
      modelsRemainingThisMonth: 999999, // Effectively unlimited
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // If we don't have a subscription plan, set it to the monthly one
    if (!userData.subscriptionPlan) {
      updateData.subscriptionPlan = process.env.STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ';
    }
    
    console.log('Updating user with the following data:');
    console.log(JSON.stringify(updateData, null, 2));
    
    await userRef.update(updateData);
    console.log('User updated successfully');
    
    // Verify update
    const updatedDoc = await userRef.get();
    const updatedData = updatedDoc.data();
    console.log('User data after update:');
    console.log(JSON.stringify({
      isPro: updatedData.isPro,
      subscriptionStatus: updatedData.subscriptionStatus,
      subscriptionEndDate: updatedData.subscriptionEndDate,
      subscriptionPlan: updatedData.subscriptionPlan,
      modelsRemainingThisMonth: updatedData.modelsRemainingThisMonth
    }, null, 2));
    
    console.log('✅ Fix completed successfully');
  } catch (error) {
    console.error('Error fixing subscription:', error);
  }
}

// Get userId from command line arguments
const userId = process.argv[2];
fixSubscription(userId); 