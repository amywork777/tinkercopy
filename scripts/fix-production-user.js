#!/usr/bin/env node

/**
 * PRODUCTION FIX SCRIPT
 * This script directly updates a user to Pro status on the fishcad.com production environment
 * 
 * Usage: 
 *   node scripts/fix-production-user.js --user <userId> --action set-pro
 *   node scripts/fix-production-user.js --email <email> --action set-pro
 */

const admin = require('firebase-admin');
const { Stripe } = require('stripe');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Parse command line arguments
const args = process.argv.slice(2);
let userId = null;
let email = null;
let action = 'set-pro'; // Default action
let serviceAccountPath = null;
let stripeSecretKey = null;

// Process arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--user' || args[i] === '-u') {
    userId = args[i + 1];
    i++;
  } else if (args[i] === '--email' || args[i] === '-e') {
    email = args[i + 1];
    i++;
  } else if (args[i] === '--action' || args[i] === '-a') {
    action = args[i + 1];
    i++;
  } else if (args[i] === '--service-account' || args[i] === '-s') {
    serviceAccountPath = args[i + 1];
    i++;
  } else if (args[i] === '--stripe-key' || args[i] === '-k') {
    stripeSecretKey = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    showHelp();
    process.exit(0);
  }
}

function showHelp() {
  console.log(`
Production User Fix Tool for fishcad.com

Usage:
  node scripts/fix-production-user.js [options]

Options:
  --user, -u <userId>                Firebase User ID to update
  --email, -e <email>                User email to search for (if userId not provided)
  --action, -a <action>              Action to perform (set-pro, reset, check)
                                     Default: set-pro
  --service-account, -s <path>       Path to Firebase service account JSON (optional)
  --stripe-key, -k <key>             Stripe secret key (optional)
  --help, -h                         Show this help message

Examples:
  node scripts/fix-production-user.js --user Ae7ZhMTNs5cfXuBtOkzliiv7kir1
  node scripts/fix-production-user.js --email user@example.com
  `);
}

// Function to initialize Firebase with the production service account
async function initializeFirebase() {
  // Try to find the service account file
  if (!serviceAccountPath) {
    // Try common locations
    const possiblePaths = [
      path.resolve(process.cwd(), 'service-account.json'),
      path.resolve(process.cwd(), 'firebase-service-account.json'),
      path.resolve(process.cwd(), 'credentials/service-account.json')
    ];
    
    for (const potentialPath of possiblePaths) {
      if (fs.existsSync(potentialPath)) {
        serviceAccountPath = potentialPath;
        console.log(`Using service account from ${serviceAccountPath}`);
        break;
      }
    }
  }
  
  let credential;
  
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = require(serviceAccountPath);
      credential = admin.credential.cert(serviceAccount);
    } catch (error) {
      console.error('Error loading service account:', error);
      throw error;
    }
  } else {
    // Prompt for service account information
    console.log('No service account file found. Please enter the Firebase service account details:');
    
    // This is a simplified approach - in a real scenario, you'd want to use a secure method
    const projectId = await promptUser('Project ID: ');
    const clientEmail = await promptUser('Client Email: ');
    const privateKey = await promptUser('Private Key (paste entire key, including BEGIN/END lines): ');
    
    credential = admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n')
    });
  }
  
  try {
    // Initialize Firebase Admin
    admin.initializeApp({
      credential
    });
    
    console.log('Firebase Admin SDK initialized successfully for production');
    return admin;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw error;
  }
}

// Function to initialize Stripe
async function initializeStripe() {
  if (!stripeSecretKey) {
    // Try to get from environment
    stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      // Prompt for Stripe key
      console.log('No Stripe secret key found. Please enter your Stripe secret key:');
      stripeSecretKey = await promptUser('Stripe Secret Key: ');
    }
  }
  
  try {
    return new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  } catch (error) {
    console.error('Error initializing Stripe:', error);
    throw error;
  }
}

// Utility function to prompt for user input
function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Function to find a user by email
async function findUserByEmail(email) {
  try {
    console.log(`Searching for user with email: ${email}`);
    const db = admin.firestore();
    
    // First check in Firestore
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (!usersSnapshot.empty) {
      const userDoc = usersSnapshot.docs[0];
      console.log(`Found user in Firestore: ${userDoc.id}`);
      return {
        id: userDoc.id,
        data: userDoc.data()
      };
    }
    
    // If not found in Firestore, try Firebase Auth
    console.log('User not found in Firestore, checking Firebase Auth...');
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      console.log(`Found user in Firebase Auth: ${userRecord.uid}`);
      return {
        id: userRecord.uid,
        data: {
          email: userRecord.email,
          // Add any other fields you need from auth
        }
      };
    } catch (authError) {
      console.error('Error finding user in Firebase Auth:', authError.message);
    }
    
    return null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    throw error;
  }
}

// Main function to update user subscription status
async function updateUserSubscription(userId, action = 'set-pro') {
  try {
    console.log(`Updating user ${userId} with action: ${action}`);
    
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User document doesn't exist in Firestore. Creating new document.`);
      // If the user exists in Auth but not in Firestore, we can still create a document
      
      // First check if the user exists in Auth
      try {
        const userRecord = await admin.auth().getUser(userId);
        console.log(`User exists in Auth: ${userRecord.email}`);
      } catch (authError) {
        console.error('Warning: User not found in Firebase Auth either:', authError.message);
        console.log('Continuing anyway to create the document...');
      }
    } else {
      console.log(`User document exists: ${JSON.stringify(userDoc.data(), null, 2)}`);
    }
    
    // Perform the requested action
    if (action === 'set-pro') {
      console.log('Setting user to Pro status...');
      
      // Calculate end date (1 year from now for subscriptions)
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      
      const updateData = {
        isPro: true,
        subscriptionStatus: 'active',
        subscriptionPlan: 'manually_activated',
        subscriptionEndDate: endDate.toISOString(),
        modelsRemainingThisMonth: 999999, // Effectively unlimited for Pro users
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      if (userDoc.exists) {
        await userRef.update(updateData);
        console.log('User document updated successfully');
      } else {
        // Create a new document
        await userRef.set({
          uid: userId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ...updateData
        });
        console.log('New user document created with Pro status');
      }
      
      // Double-check that the update was applied
      const updatedDoc = await userRef.get();
      console.log(`User status after update: ${JSON.stringify(updatedDoc.data(), null, 2)}`);
      
      console.log('✅ SUCCESS: User has been upgraded to Pro status!');
    } else if (action === 'check') {
      if (!userDoc.exists) {
        console.log('⚠️ User document does not exist in Firestore');
        return;
      }
      
      const userData = userDoc.data();
      console.log('Current user subscription status:');
      console.log(`- isPro: ${userData.isPro || false}`);
      console.log(`- subscriptionStatus: ${userData.subscriptionStatus || 'none'}`);
      console.log(`- subscriptionPlan: ${userData.subscriptionPlan || 'none'}`);
      console.log(`- subscriptionEndDate: ${userData.subscriptionEndDate || 'none'}`);
      
      if (userData.stripeCustomerId) {
        console.log(`- Stripe Customer ID: ${userData.stripeCustomerId}`);
        
        // Check Stripe if we have a customer ID
        try {
          const stripe = await initializeStripe();
          const customer = await stripe.customers.retrieve(userData.stripeCustomerId);
          console.log(`- Stripe Customer: ${customer.email}`);
          
          if (userData.stripeSubscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
              console.log(`- Stripe Subscription: ${subscription.id}`);
              console.log(`- Stripe Subscription Status: ${subscription.status}`);
            } catch (subError) {
              console.log(`- Error retrieving subscription: ${subError.message}`);
            }
          } else {
            console.log('- No Stripe Subscription ID found');
          }
        } catch (stripeError) {
          console.log(`- Error retrieving Stripe data: ${stripeError.message}`);
        }
      }
    } else if (action === 'reset') {
      console.log('Resetting user to Free tier...');
      
      const updateData = {
        isPro: false,
        subscriptionStatus: 'none',
        subscriptionPlan: 'free',
        subscriptionEndDate: null,
        modelsRemainingThisMonth: 2,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await userRef.update(updateData);
      console.log('✅ SUCCESS: User has been reset to Free tier');
    }
  } catch (error) {
    console.error('Error updating user subscription:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    if (!userId && !email) {
      // Try interactive mode
      console.log('No user ID or email provided. Starting interactive mode...');
      
      const identifierType = await promptUser('Search by (1) User ID or (2) Email? [Enter 1 or 2]: ');
      
      if (identifierType === '1') {
        userId = await promptUser('Enter User ID: ');
      } else if (identifierType === '2') {
        email = await promptUser('Enter Email: ');
      } else {
        console.error('Invalid option. Please enter 1 or 2.');
        process.exit(1);
      }
      
      action = await promptUser('Enter action (set-pro, check, reset) [Default: set-pro]: ') || 'set-pro';
    }
    
    // Initialize Firebase Admin SDK
    await initializeFirebase();
    
    // If email is provided but not userId, try to find the user by email
    if (email && !userId) {
      const user = await findUserByEmail(email);
      if (user) {
        userId = user.id;
        console.log(`Found user ID: ${userId}`);
      } else {
        console.error(`Could not find user with email: ${email}`);
        process.exit(1);
      }
    }
    
    if (!userId) {
      console.error('No user ID provided and could not find user by email');
      process.exit(1);
    }
    
    // Update the user's subscription
    await updateUserSubscription(userId, action);
    
    console.log('Operation completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the main function
main(); 