// Diagnostic script to check subscription status
require('dotenv').config({path: '.env.local'});
const admin = require('firebase-admin');
const { Stripe } = require('stripe');

// Initialize Firebase Admin SDK
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

try {
  // Initialize Firebase if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized successfully');
  }

  // Initialize Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('Stripe initialized successfully');

  async function checkSubscription(userId) {
    console.log(`Checking subscription for user: ${userId}`);
    
    try {
      // 1. Check Firebase user data
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(userId).get();
      
      console.log('User exists in Firebase:', userDoc.exists);
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log('User data from Firebase:');
        console.log(JSON.stringify({
          isPro: userData.isPro,
          subscriptionStatus: userData.subscriptionStatus,
          stripeCustomerId: userData.stripeCustomerId,
          stripeSubscriptionId: userData.stripeSubscriptionId,
        }, null, 2));
        
        // 2. If we have a Stripe customer ID, check with Stripe
        if (userData.stripeCustomerId) {
          console.log(`\nChecking Stripe for customer: ${userData.stripeCustomerId}`);
          
          // Retrieve customer from Stripe
          const customer = await stripe.customers.retrieve(userData.stripeCustomerId);
          console.log('Stripe customer exists:', !!customer);
          console.log('Stripe customer metadata:', JSON.stringify(customer.metadata, null, 2));
          
          // Check for active subscriptions
          const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripeCustomerId,
            limit: 5
          });
          
          console.log(`\nFound ${subscriptions.data.length} subscriptions for customer`);
          
          if (subscriptions.data.length > 0) {
            subscriptions.data.forEach((sub, index) => {
              console.log(`\nSubscription ${index + 1}:`);
              console.log(`ID: ${sub.id}`);
              console.log(`Status: ${sub.status}`);
              console.log(`Created: ${new Date(sub.created * 1000).toISOString()}`);
              console.log(`Current period end: ${new Date(sub.current_period_end * 1000).toISOString()}`);
              console.log(`Metadata:`, JSON.stringify(sub.metadata, null, 2));
              
              if (sub.items && sub.items.data && sub.items.data.length > 0) {
                console.log(`Price ID: ${sub.items.data[0].price.id}`);
              }
            });
            
            // Check if user's stripeSubscriptionId matches any of these subscriptions
            if (userData.stripeSubscriptionId) {
              const matchingSubscription = subscriptions.data.find(sub => sub.id === userData.stripeSubscriptionId);
              console.log(`\nUser's recorded subscription ID matches an actual subscription: ${!!matchingSubscription}`);
              
              if (matchingSubscription) {
                console.log(`Matching subscription status: ${matchingSubscription.status}`);
                console.log(`User's subscriptionStatus in Firestore: ${userData.subscriptionStatus}`);
                console.log(`Values match: ${matchingSubscription.status === userData.subscriptionStatus}`);
              }
            }
          }
        } else {
          console.log('No Stripe customer ID found in user data');
        }
      } else {
        console.log('User not found in Firestore');
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }
  
  // Get userId from command line arguments
  const userId = process.argv[2];
  
  if (!userId) {
    console.log('Please provide a user ID as a command line argument');
    console.log('Usage: node test-subscription.js <userId>');
    process.exit(1);
  }
  
  // Run the check
  checkSubscription(userId);
  
} catch (error) {
  console.error('Initialization error:', error);
} 