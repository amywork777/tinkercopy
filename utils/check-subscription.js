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
    console.log('Usage: node check-subscription.js <userId>');
    process.exit(1);
  }
  
  console.log(`Checking user: ${userId}`);
  
  try {
    // Check if user exists in Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.error(`User ${userId} not found in Firestore`);
      process.exit(1);
    }
    
    console.log('User found in Firestore');
    
    // Get user data
    const userData = userDoc.data();
    
    console.log('Current user data:');
    console.log(JSON.stringify(userData, null, 2));
    
    // Check Stripe status
    if (userData.stripeCustomerId) {
      console.log(`\nStripe Customer ID: ${userData.stripeCustomerId}`);
      
      // Connect to Stripe
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      
      // Get customer details
      const customer = await stripe.customers.retrieve(userData.stripeCustomerId);
      console.log(`Stripe Customer Email: ${customer.email}`);
      
      // Check for active subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: userData.stripeCustomerId,
        limit: 10,
      });
      
      console.log(`\nFound ${subscriptions.data.length} subscription(s) for this customer:`);
      
      for (const subscription of subscriptions.data) {
        console.log(`\nSubscription ID: ${subscription.id}`);
        console.log(`Status: ${subscription.status}`);
        console.log(`Current period ends: ${new Date(subscription.current_period_end * 1000).toISOString()}`);
        console.log(`Price ID: ${subscription.items.data[0].price.id}`);
        
        // If subscription is active but user is not Pro, offer to update
        if (
          ['active', 'trialing'].includes(subscription.status) && 
          !userData.isPro
        ) {
          console.log('\n📢 FOUND ACTIVE SUBSCRIPTION BUT USER IS NOT PRO! 📢');
          console.log('Would you like to update the user to Pro status? (y/n)');
          
          // Read user input
          const readline = require('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          rl.question('Update user to Pro? (y/n): ', async (answer) => {
            if (answer.toLowerCase() === 'y') {
              // Update user to Pro
              const updateData = {
                isPro: true,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
                subscriptionPlan: subscription.items.data[0].price.id,
                modelsRemainingThisMonth: 999999, // Effectively unlimited
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              };
              
              console.log('Updating user with:');
              console.log(updateData);
              
              await userRef.update(updateData);
              
              console.log('\n✅ User updated to Pro status!');
              
              // Verify the update
              const updatedDoc = await userRef.get();
              console.log('\nUpdated user data:');
              console.log(JSON.stringify(updatedDoc.data(), null, 2));
            } else {
              console.log('No changes made.');
            }
            
            rl.close();
            process.exit(0);
          });
        } else if (userData.isPro) {
          console.log('\n✅ User already has Pro status');
        }
      }
      
      // If no active subscriptions found
      if (subscriptions.data.length === 0 || !subscriptions.data.some(s => ['active', 'trialing'].includes(s.status))) {
        console.log('\n⚠️ No active subscriptions found for this customer');
      }
    } else {
      console.log('\n⚠️ User does not have a Stripe Customer ID');
      
      // Ask if user wants to search for a customer by email
      if (userData.email) {
        console.log(`Would you like to search for a Stripe customer with email: ${userData.email}?`);
        
        // Read user input
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('Search for customer by email? (y/n): ', async (answer) => {
          if (answer.toLowerCase() === 'y') {
            // Connect to Stripe
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            
            // Search for customer by email
            const customers = await stripe.customers.list({
              email: userData.email,
              limit: 10,
            });
            
            console.log(`\nFound ${customers.data.length} customer(s) with this email:`);
            
            if (customers.data.length > 0) {
              for (const customer of customers.data) {
                console.log(`\nCustomer ID: ${customer.id}`);
                console.log(`Email: ${customer.email}`);
                
                // Check for subscriptions
                const subscriptions = await stripe.subscriptions.list({
                  customer: customer.id,
                  limit: 10,
                });
                
                console.log(`Found ${subscriptions.data.length} subscription(s) for this customer`);
                
                if (subscriptions.data.length > 0) {
                  for (const subscription of subscriptions.data) {
                    console.log(`- Subscription ID: ${subscription.id}, Status: ${subscription.status}`);
                  }
                }
              }
              
              // Ask if user wants to link a Stripe customer
              rl.question('\nEnter a Stripe Customer ID to link to this user (or press enter to skip): ', async (customerId) => {
                if (customerId) {
                  // Update user with Stripe customer ID
                  await userRef.update({
                    stripeCustomerId: customerId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                  });
                  
                  console.log(`\n✅ User updated with Stripe Customer ID: ${customerId}`);
                  console.log('Please run this script again to check for subscriptions.');
                } else {
                  console.log('No changes made.');
                }
                
                rl.close();
                process.exit(0);
              });
            } else {
              console.log('No Stripe customers found with this email.');
              rl.close();
              process.exit(0);
            }
          } else {
            console.log('No changes made.');
            rl.close();
            process.exit(0);
          }
        });
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