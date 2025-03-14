/**
 * Direct script to upgrade a user account to Pro status
 * 
 * This script can be used to manually upgrade a specific user account
 * to Pro status in Firebase, bypassing the normal subscription flow.
 * 
 * Run with: node utils/update-account.js <userId>
 */

// Load environment variables
require('dotenv').config();

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
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
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    
    console.log('Firebase Admin SDK initialized');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    process.exit(1);
  }
}

// Get Firestore instance
const db = admin.firestore();

// Main function
async function main() {
  // Get user ID from command line arguments
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('Please provide a user ID as an argument');
    console.log('Usage: node utils/update-account.js <userId>');
    process.exit(1);
  }
  
  console.log(`Upgrading user: ${userId} to Pro status`);
  
  try {
    // Check if user exists in Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.error(`User ${userId} not found in Firestore`);
      process.exit(1);
    }
    
    console.log('User found in Firestore');
    
    // Calculate subscription end date (1 year from now)
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    
    // Create update data for Pro status
    const updateData = {
      isPro: true,
      subscriptionStatus: 'active',
      subscriptionEndDate: endDate.toISOString(),
      subscriptionPlan: process.env.STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
      modelsRemainingThisMonth: 999999, // Effectively unlimited
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    console.log('Updating user with:');
    console.log(updateData);
    
    // Update the user document
    await userRef.update(updateData);
    
    console.log('\n✅ User upgraded to Pro status!');
    
    // Verify the update was successful
    const updatedDoc = await userRef.get();
    const updatedData = updatedDoc.data();
    
    console.log('\nUpdated user data:');
    console.log(`isPro: ${updatedData.isPro}`);
    console.log(`subscriptionStatus: ${updatedData.subscriptionStatus}`);
    console.log(`subscriptionEndDate: ${updatedData.subscriptionEndDate}`);
    console.log(`modelsRemainingThisMonth: ${updatedData.modelsRemainingThisMonth}`);
    
    if (updatedData.isPro !== true) {
      console.error('Warning: User was not properly upgraded to Pro status!');
      
      // Try updating with merge option as a fallback
      console.log('Trying alternative update method...');
      
      await userRef.set(updateData, { merge: true });
      
      // Check again
      const recheckDoc = await userRef.get();
      const recheckData = recheckDoc.data();
      
      if (recheckData.isPro === true) {
        console.log('\n✅ User successfully upgraded to Pro status with alternative method!');
      } else {
        console.error('Failed to upgrade user to Pro status. Manual database update may be required.');
      }
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 