const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config({ path: '../.env' });

/**
 * This script initializes the subscription fields for existing users in Firestore.
 * It ensures all users have the proper fields for the subscription system to work.
 */
async function initializeSubscriptions() {
  try {
    // Initialize Firebase
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    };

    const firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });
    
    console.log('Firebase initialized');
    
    // Initialize Firestore
    const db = getFirestore();
    console.log('Firestore initialized');
    
    // Get all users
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    if (snapshot.empty) {
      console.log('No users found in the database.');
      return;
    }
    
    console.log(`Found ${snapshot.size} users. Starting to update...`);
    
    // Get current month for reset dates
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    // Create a batch to update all users
    let batch = db.batch();
    let updateCount = 0;
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      
      // Default subscription values
      const updates = {
        isPro: false,
        modelsGeneratedThisMonth: 0,
        modelsRemainingThisMonth: 3, // Free tier limit
        lastResetDate: currentMonth,
        stripeCustomerId: userData.stripeCustomerId || null,
        stripeSubscriptionId: userData.stripeSubscriptionId || null, 
        subscriptionStatus: userData.subscriptionStatus || 'none',
        subscriptionEndDate: userData.subscriptionEndDate || null,
        subscriptionPlan: userData.subscriptionPlan || 'free',
      };
      
      // Only update if any field is missing
      const needsUpdate = Object.keys(updates).some(key => userData[key] === undefined);
      
      if (needsUpdate) {
        batch.update(doc.ref, updates);
        updateCount++;
        
        // Firestore batches are limited to 500 operations
        if (updateCount % 400 === 0) {
          await batch.commit();
          console.log(`Committed batch ${++batchCount}. ${updateCount} users updated so far.`);
          batch = db.batch();
        }
      }
    }
    
    // Commit any remaining updates
    if (updateCount % 400 !== 0) {
      await batch.commit();
      batchCount++;
    }
    
    console.log(`Update complete. ${updateCount} users were updated in ${batchCount} batches.`);
    
  } catch (error) {
    console.error('Error initializing subscriptions:', error);
  }
}

// Run the initialization
initializeSubscriptions()
  .then(() => console.log('Initialization script complete'))
  .catch(err => console.error('Initialization script failed:', err)); 