/**
 * Utility script to check and update a user's subscription status in Firebase
 * 
 * This script can be used to:
 * 1. Check if a user exists in Firebase
 * 2. Check if a user has a Stripe customer ID
 * 3. Check if a user has an active subscription
 * 4. Update a user's subscription status manually
 * 
 * Run with: node utils/check-subscription.js <userId>
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
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
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
let email = null;
let action = 'check';

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
  } else if (args[i] === '--help' || args[i] === '-h') {
    showHelp();
    process.exit(0);
  }
}

function showHelp() {
  console.log(`
Subscription Checker

Usage:
  node check-subscription.js [options]

Options:
  --user, -u <userId>     Firebase User ID to check
  --email, -e <email>     User email to check
  --action, -a <action>   Action to perform (check, set-pro, reset, sync)
  --help, -h              Show this help message

Examples:
  node check-subscription.js --user Ae7ZhMTNs5cfXuBtOkzliiv7kir1
  node check-subscription.js --email user@example.com
  node check-subscription.js --user Ae7ZhMTNs5cfXuBtOkzliiv7kir1 --action set-pro
  `);
}

// Main function to check subscription
async function checkSubscription(userId, email, action = 'check') {
  // Initialize Firebase
  const adminSdk = initializeFirebase();
  const db = adminSdk.firestore();
  
  try {
    let userDoc;
    
    // Try to find user by ID
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log(`No user found with ID: ${userId}`);
        userDoc = null;
      }
    }
    
    // If not found by ID and email is provided, try to find by email
    if (!userDoc && email) {
      const usersRef = db.collection('users');
      const querySnapshot = await usersRef.where('email', '==', email).limit(1).get();
      
      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
        userId = userDoc.id;
        console.log(`Found user with ID: ${userId}`);
      } else {
        console.log(`No user found with email: ${email}`);
        return;
      }
    }
    
    if (!userDoc) {
      console.log('No user found. Please provide a valid user ID or email.');
      return;
    }
    
    const userData = userDoc.data();
    console.log('\n===== User Information =====');
    console.log(`User ID: ${userDoc.id}`);
    console.log(`Email: ${userData.email || 'Not set'}`);
    console.log(`Pro Status: ${userData.isPro ? 'Pro' : 'Free'}`);
    console.log(`Subscription Status: ${userData.subscriptionStatus || 'None'}`);
    console.log(`Subscription Plan: ${userData.subscriptionPlan || 'None'}`);
    console.log(`Subscription End Date: ${userData.subscriptionEndDate || 'Not set'}`);
    console.log(`Models Remaining: ${userData.modelsRemainingThisMonth || 0}`);
    console.log(`Stripe Customer ID: ${userData.stripeCustomerId || 'Not set'}`);
    console.log(`Stripe Subscription ID: ${userData.stripeSubscriptionId || 'Not set'}`);
    
    // Check Stripe for customer/subscription info
    let stripeCustomerId = userData.stripeCustomerId;
    
    if (stripeCustomerId) {
      try {
        // Get customer data from Stripe
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        
        console.log('\n===== Stripe Customer Information =====');
        console.log(`Customer ID: ${customer.id}`);
        console.log(`Email: ${customer.email || 'Not set'}`);
        console.log(`Created: ${new Date(customer.created * 1000).toLocaleString()}`);
        
        // Get subscription data if available
        let subscription = null;
        if (userData.stripeSubscriptionId) {
          try {
            subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
          } catch (subError) {
            console.error('Error retrieving subscription:', subError.message);
          }
        } else {
          // Try to find subscriptions by customer
          const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            limit: 1
          });
          
          if (subscriptions.data.length > 0) {
            subscription = subscriptions.data[0];
          }
        }
        
        if (subscription) {
          console.log('\n===== Stripe Subscription Information =====');
          console.log(`Subscription ID: ${subscription.id}`);
          console.log(`Status: ${subscription.status}`);
          console.log(`Current Period End: ${new Date(subscription.current_period_end * 1000).toLocaleString()}`);
          
          // Check subscription price
          if (subscription.items.data && subscription.items.data.length > 0) {
            const price = subscription.items.data[0].price;
            console.log(`Price ID: ${price.id}`);
            console.log(`Price: ${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
            console.log(`Interval: ${price.recurring?.interval || 'Unknown'}`);
          }
        } else {
          console.log('\nNo active subscription found');
        }
      } catch (stripeError) {
        console.error('Error retrieving Stripe data:', stripeError.message);
      }
    } else {
      console.log('\nNo Stripe customer ID found. Searching by user metadata...');
      
      try {
        // Search by metadata
        const customers = await stripe.customers.search({
          query: `metadata['userId']:'${userId}'`,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          const customer = customers.data[0];
          console.log(`Found Stripe customer by metadata: ${customer.id}`);
          
          console.log('\n===== Stripe Customer Information =====');
          console.log(`Customer ID: ${customer.id}`);
          console.log(`Email: ${customer.email || 'Not set'}`);
          console.log(`Created: ${new Date(customer.created * 1000).toLocaleString()}`);
          
          // Get subscriptions
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            limit: 1
          });
          
          if (subscriptions.data.length > 0) {
            const subscription = subscriptions.data[0];
            console.log('\n===== Stripe Subscription Information =====');
            console.log(`Subscription ID: ${subscription.id}`);
            console.log(`Status: ${subscription.status}`);
            console.log(`Current Period End: ${new Date(subscription.current_period_end * 1000).toLocaleString()}`);
          } else {
            console.log('\nNo active subscription found for this customer');
          }
        } else {
          console.log('No Stripe customer found by metadata search');
          
          // Try searching by email if available
          if (userData.email) {
            console.log(`Searching by email: ${userData.email}`);
            
            const emailCustomers = await stripe.customers.list({
              email: userData.email,
              limit: 1
            });
            
            if (emailCustomers.data.length > 0) {
              const customer = emailCustomers.data[0];
              console.log(`Found Stripe customer by email: ${customer.id}`);
              
              console.log('\n===== Stripe Customer Information =====');
              console.log(`Customer ID: ${customer.id}`);
              console.log(`Email: ${customer.email || 'Not set'}`);
              console.log(`Created: ${new Date(customer.created * 1000).toLocaleString()}`);
            } else {
              console.log('No Stripe customer found by email search');
            }
          }
        }
      } catch (stripeError) {
        console.error('Error searching for Stripe customer:', stripeError.message);
      }
    }
    
    // Handle different actions
    if (action !== 'check') {
      const userRef = db.collection('users').doc(userId);
      
      switch (action) {
        case 'set-pro':
          await promptConfirmation(`Are you sure you want to set user ${userId} to Pro status?`, async () => {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 30); // Default to 30 days
            
            const updateData = {
              isPro: true,
              subscriptionStatus: 'active',
              subscriptionPlan: 'manually_activated',
              subscriptionEndDate: endDate.toISOString(),
              modelsRemainingThisMonth: 999999,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            await userRef.update(updateData);
            console.log('\n✅ User successfully set to Pro status!');
          });
          break;
          
        case 'reset':
          await promptConfirmation(`Are you sure you want to reset user ${userId} to Free tier?`, async () => {
            const updateData = {
              isPro: false,
              subscriptionStatus: 'none',
              subscriptionPlan: 'free',
              subscriptionEndDate: null,
              modelsRemainingThisMonth: 2,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            await userRef.update(updateData);
            console.log('\n✅ User successfully reset to Free tier!');
          });
          break;
          
        case 'sync':
          if (!userData.stripeSubscriptionId) {
            console.log('\nNo subscription ID found to sync with. Use check-subscription first to find a subscription ID.');
            rl.close();
            return;
          }
          
          await promptConfirmation(`Are you sure you want to sync user ${userId} with Stripe subscription ${userData.stripeSubscriptionId}?`, async () => {
            try {
              const subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
              
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
                              
              const updateData = {
                isPro: isActive,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                subscriptionEndDate: endDate.toISOString(),
                subscriptionPlan: priceId,
                modelsRemainingThisMonth: isActive ? 999999 : 2,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              };
              
              if (userData.stripeCustomerId) {
                updateData.stripeCustomerId = userData.stripeCustomerId;
              } else if (typeof subscription.customer === 'string') {
                updateData.stripeCustomerId = subscription.customer;
              }
              
              await userRef.update(updateData);
              console.log('\n✅ User subscription successfully synchronized with Stripe!');
            } catch (error) {
              console.error('Error syncing with Stripe:', error.message);
            }
          });
          break;
      }
    }
  } catch (error) {
    console.error('Error checking subscription:', error);
  }
}

async function promptConfirmation(message, callback) {
  rl.question(`${message} (y/n): `, async (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      await callback();
    } else {
      console.log('Operation cancelled');
    }
    rl.close();
  });
}

// If no user ID or email provided, show help
if (!userId && !email) {
  if (args.length === 0) {
    // Interactive mode
    rl.question('Enter User ID or email: ', async (answer) => {
      if (answer.includes('@')) {
        email = answer;
      } else {
        userId = answer;
      }
      
      rl.question('Action (check, set-pro, reset, sync) [check]: ', async (actionAnswer) => {
        if (actionAnswer && ['check', 'set-pro', 'reset', 'sync'].includes(actionAnswer)) {
          action = actionAnswer;
        }
        
        await checkSubscription(userId, email, action);
        
        if (action === 'check') {
          rl.close();
        }
      });
    });
  } else {
    showHelp();
    process.exit(1);
  }
} else {
  checkSubscription(userId, email, action).then(() => {
    if (action === 'check') {
      rl.close();
    }
  });
} 