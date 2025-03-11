// Script to update all active trials from 24-hour duration to 1-hour duration
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Load service account file for Firebase Admin SDK
let serviceAccount;
try {
  // Try to find the service account file
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
    console.log('Found service account key file');
  } else {
    console.error('Service account file not found at:', serviceAccountPath);
    process.exit(1);
  }
} catch (error) {
  console.error('Error loading service account:', error);
  process.exit(1);
}

// Initialize Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

// Get Firestore instance
const db = admin.firestore();

async function updateTrialDurations() {
  try {
    console.log('Starting trial duration update...');
    
    // Query for users with active trials
    const usersRef = db.collection('users');
    const activeTrialsQuery = usersRef.where('trialActive', '==', true);
    
    const snapshot = await activeTrialsQuery.get();
    
    if (snapshot.empty) {
      console.log('No active trials found.');
      return;
    }
    
    console.log(`Found ${snapshot.size} active trials to update.`);
    
    // Track successful and failed updates
    let successCount = 0;
    let failCount = 0;
    
    // Process each user with an active trial
    for (const doc of snapshot.docs) {
      try {
        const userData = doc.data();
        const userId = doc.id;
        
        console.log(`Processing user ${userId}...`);
        
        // Check if there's a trial end date
        if (!userData.trialEndDate) {
          console.log(`User ${userId} has no trial end date, skipping.`);
          continue;
        }
        
        // Get the current trial end date
        let currentTrialEnd;
        if (userData.trialEndDate._seconds) {
          currentTrialEnd = new Date(userData.trialEndDate._seconds * 1000);
        } else if (userData.trialEndDate.seconds) {
          currentTrialEnd = new Date(userData.trialEndDate.seconds * 1000);
        } else if (typeof userData.trialEndDate.toDate === 'function') {
          currentTrialEnd = userData.trialEndDate.toDate();
        } else {
          currentTrialEnd = new Date(userData.trialEndDate);
        }
        
        // Calculate when the trial started (approximately)
        const trialStartTime = new Date(currentTrialEnd);
        trialStartTime.setHours(trialStartTime.getHours() - 24); // Assuming 24-hour trial
        
        // Calculate new end time (1 hour from start)
        const newTrialEnd = new Date(trialStartTime);
        newTrialEnd.setHours(trialStartTime.getHours() + 1);
        
        console.log(`User ${userId}: Changing trial end from ${currentTrialEnd} to ${newTrialEnd}`);
        
        // Update the trial end date and subscription end date
        await doc.ref.update({
          trialEndDate: admin.firestore.Timestamp.fromDate(newTrialEnd),
          subscriptionEndDate: admin.firestore.Timestamp.fromDate(newTrialEnd)
        });
        
        console.log(`Successfully updated trial end date for user ${userId}`);
        successCount++;
      } catch (error) {
        console.error(`Error updating user ${doc.id}:`, error);
        failCount++;
      }
    }
    
    console.log(`Update complete. Successfully updated ${successCount} users. Failed: ${failCount}`);
  } catch (error) {
    console.error('Error in updateTrialDurations:', error);
  }
}

// Run the update function
updateTrialDurations()
  .then(() => {
    console.log('Script execution complete.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 