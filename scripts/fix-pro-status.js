const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin with service account
const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Error: Firebase service account file not found at:', serviceAccountPath);
  console.error('Please copy your Firebase service account key to this location.');
  process.exit(1);
}

try {
  const serviceAccount = require(serviceAccountPath);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

const db = admin.firestore();

// Get command line arguments
const userId = process.argv[2];
const action = process.argv[3]?.toLowerCase(); // 'enable' or 'disable'

if (!userId || !['enable', 'disable'].includes(action)) {
  console.error('Usage: node fix-pro-status.js USER_ID [enable|disable]');
  console.error('  USER_ID: Firebase auth user ID');
  console.error('  Action: "enable" to grant Pro status, "disable" to remove Pro status');
  process.exit(1);
}

async function fixProStatus() {
  try {
    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.error(`Error: User with ID ${userId} not found in Firestore.`);
      process.exit(1);
    }
    
    const userData = userDoc.data();
    console.log('Current user data:', {
      uid: userData.uid,
      email: userData.email,
      isPro: userData.isPro,
      subscriptionStatus: userData.subscriptionStatus,
      subscriptionPlan: userData.subscriptionPlan,
    });
    
    // Prepare update data based on action
    const updateData = {
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (action === 'enable') {
      updateData.isPro = true;
      updateData.subscriptionStatus = 'active';
      updateData.subscriptionPlan = 'pro';
      updateData.modelsRemainingThisMonth = 100;
      
      // Set subscription end date to 1 month from now
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      updateData.subscriptionEndDate = endDate;
      
    } else { // disable
      updateData.isPro = false;
      updateData.subscriptionStatus = 'none';
      updateData.subscriptionPlan = 'free';
      updateData.modelsRemainingThisMonth = 0;
    }
    
    // Update the user document
    await db.collection('users').doc(userId).update(updateData);
    
    console.log(`Success! User ${userId} Pro status has been ${action === 'enable' ? 'enabled' : 'disabled'}.`);
    console.log('Updated fields:', updateData);
    
    // Get updated user data
    const updatedDoc = await db.collection('users').doc(userId).get();
    const updatedData = updatedDoc.data();
    
    console.log('Updated user data:', {
      uid: updatedData.uid,
      email: updatedData.email,
      isPro: updatedData.isPro,
      subscriptionStatus: updatedData.subscriptionStatus,
      subscriptionPlan: updatedData.subscriptionPlan,
      lastUpdated: updatedData.lastUpdated ? updatedData.lastUpdated.toDate() : null,
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating Pro status:', error);
    process.exit(1);
  }
}

// Run the function
fixProStatus(); 