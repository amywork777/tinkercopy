/**
 * Direct script to upgrade a user account to Pro status
 * 
 * This script can be used to manually upgrade a specific user account
 * to Pro status in Firebase, bypassing the normal subscription flow.
 * 
 * Run with: node utils/update-account.js <userId>
 */

#!/usr/bin/env node

const admin = require('firebase-admin');
const { Stripe } = require('stripe');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
    console.log('Loaded environment variables from .env.local');
  }
} catch (error) {
  console.error('Error loading .env.local:', error.message);
}

// Initialize Stripe with the secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error('STRIPE_SECRET_KEY not found in environment variables');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized || admin.apps.length > 0) {
    return admin;
  }
  
  try {
    // Try to load service account from environment variable
    let credential;
    
    if (process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      });
    } else {
      // Try to find a service account file
      const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
      if (fs.existsSync(serviceAccountPath)) {
        console.log(`Using service account from ${serviceAccountPath}`);
        credential = admin.credential.cert(require(serviceAccountPath));
      } else {
        console.error('No Firebase credentials found!');
        process.exit(1);
      }
    }
    
    admin.initializeApp({
      credential: credential,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
    });
    
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    process.exit(1);
  }
  
  return admin;
}

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Parse command line arguments
const args = process.argv.slice(2);
let userId = null;
let action = null;
let subscriptionId = null;
let batchMode = false;
let targetFile = null;

// Process arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--user' || args[i] === '-u') {
    userId = args[i + 1];
    i++;
  } else if (args[i] === '--action' || args[i] === '-a') {
    action = args[i + 1];
    i++;
  } else if (args[i] === '--subscription' || args[i] === '-s') {
    subscriptionId = args[i + 1];
    i++;
  } else if (args[i] === '--batch' || args[i] === '-b') {
    batchMode = true;
    targetFile = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    showHelp();
    process.exit(0);
  }
}

function showHelp() {
  console.log(`
Account Updater

Usage:
  node update-account.js [options]

Options:
  --user, -u <userId>                Firebase User ID to update
  --action, -a <action>              Action to perform (set-pro, reset, sync)
  --subscription, -s <subscriptionId> Stripe Subscription ID (for sync action)
  --batch, -b <file>                 Process multiple users from CSV file
  --help, -h                         Show this help message

Examples:
  node update-account.js --user Ae7ZhMTNs5cfXuBtOkzliiv7kir1 --action set-pro
  node update-account.js --user Ae7ZhMTNs5cfXuBtOkzliiv7kir1 --action sync --subscription sub_12345
  node update-account.js --batch users.csv
  `);
}

// Process a CSV file with multiple users
async function processBatchFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    
    // Skip header line if present
    const startLine = lines[0].toLowerCase().includes('userid') ? 1 : 0;
    
    console.log(`Processing ${lines.length - startLine} users from file`);
    
    // Initialize Firebase
    initializeFirebase();
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line - expected format: userId,action[,subscriptionId]
      const parts = line.split(',');
      if (parts.length < 2) {
        console.log(`Line ${i + 1}: Invalid format, skipping`);
        continue;
      }
      
      const userId = parts[0].trim();
      const action = parts[1].trim();
      const subscriptionId = parts.length > 2 ? parts[2].trim() : null;
      
      console.log(`\nProcessing user ${i - startLine + 1}/${lines.length - startLine}: ${userId}`);
      
      try {
        await updateAccount(userId, action, subscriptionId);
      } catch (error) {
        console.error(`Error processing user ${userId}:`, error.message);
      }
    }
    
    console.log('\nBatch processing completed');
    process.exit(0);
  } catch (error) {
    console.error('Error processing batch file:', error.message);
    process.exit(1);
  }
}

// Main function to update an account
async function updateAccount(userId, action, subscriptionId = null) {
  // Validate parameters
  if (!userId) {
    console.error('User ID is required');
    return;
  }
  
  if (!action) {
    console.error('Action is required');
    return;
  }
  
  if (action === 'sync' && !subscriptionId) {
    console.error('Subscription ID is required for sync action');
    return;
  }
  
  // Initialize Firebase
  const adminSdk = initializeFirebase();
  const db = adminSdk.firestore();
  
  // Get user document
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    console.error(`User ${userId} not found in Firestore`);
    return;
  }
  
  const userData = userDoc.data();
  console.log(`User ${userId} found: ${userData.email || 'No email'}`);
  
  // Perform requested action
  switch (action.toLowerCase()) {
    case 'set-pro':
    case 'setpro':
      console.log('Setting user to Pro status');
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // Default to 30 days
      
      const proPlanData = {
        isPro: true,
        subscriptionStatus: 'active',
        subscriptionPlan: 'manually_activated',
        subscriptionEndDate: endDate.toISOString(),
        modelsRemainingThisMonth: 999999,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
      };
      
      await userRef.update(proPlanData);
      console.log('✅ User successfully set to Pro status!');
      break;
      
    case 'reset':
    case 'free':
      console.log('Resetting user to Free tier');
      
      const freePlanData = {
        isPro: false,
        subscriptionStatus: 'none',
        subscriptionPlan: 'free',
        subscriptionEndDate: null,
        modelsRemainingThisMonth: 2,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
      };
      
      await userRef.update(freePlanData);
      console.log('✅ User successfully reset to Free tier!');
      break;
      
    case 'sync':
      console.log(`Syncing user with Stripe subscription ${subscriptionId}`);
      
      try {
        // Retrieve subscription data from Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Get customer ID
        const stripeCustomerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
          
        // Calculate end date
        const endDate = subscription.current_period_end ? 
          new Date(subscription.current_period_end * 1000) : 
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          
        // Get price ID
        const priceId = subscription.items.data && 
          subscription.items.data.length > 0 && 
          subscription.items.data[0].price ? 
            subscription.items.data[0].price.id : 
            'unknown';
            
        // Is subscription active?
        const isActive = subscription.status === 'active' || 
                        subscription.status === 'trialing';
                        
        const subscriptionData = {
          isPro: isActive,
          stripeCustomerId: stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: endDate.toISOString(),
          subscriptionPlan: priceId,
          modelsRemainingThisMonth: isActive ? 999999 : 2,
          updatedAt: adminSdk.firestore.FieldValue.serverTimestamp()
        };
        
        await userRef.update(subscriptionData);
        console.log('✅ User subscription successfully synchronized with Stripe!');
      } catch (error) {
        console.error('Error syncing with Stripe:', error.message);
      }
      break;
      
    default:
      console.error(`Unknown action: ${action}`);
  }
}

// Main execution
if (batchMode && targetFile) {
  processBatchFile(targetFile);
} else if (userId && action) {
  updateAccount(userId, action, subscriptionId).then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
} else {
  // Interactive mode
  rl.question('Enter User ID: ', (inputUserId) => {
    userId = inputUserId.trim();
    
    rl.question('Select action (set-pro, reset, sync): ', (inputAction) => {
      action = inputAction.trim().toLowerCase();
      
      if (action === 'sync') {
        rl.question('Enter Stripe Subscription ID: ', (inputSubId) => {
          subscriptionId = inputSubId.trim();
          
          updateAccount(userId, action, subscriptionId).then(() => {
            process.exit(0);
          }).catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
          });
        });
      } else {
        updateAccount(userId, action).then(() => {
          process.exit(0);
        }).catch(error => {
          console.error('Error:', error.message);
          process.exit(1);
        });
      }
    });
  });
} 