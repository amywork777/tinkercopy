const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getFirestore } = require('firebase-admin/firestore');
const router = express.Router();

// Log Stripe key mode
const isProductionKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_');
console.log(`Using Stripe ${isProductionKey ? 'PRODUCTION' : 'TEST'} mode`);
if (!isProductionKey) {
  console.log('Using Stripe TEST mode - no real charges will be made');
} else {
  console.log('✓ Production Stripe key detected');
}

// Constants
const DEFAULT_DOMAIN = process.env.DOMAIN || 'http://localhost:5173';
const STRIPE_PRICES = {
  MONTHLY: process.env.STRIPE_PRICE_MONTHLY || 'price_placeholder',
};

// Log the price IDs being used
console.log('Using Stripe Price IDs:', STRIPE_PRICES);

// Add CORS preflight handler for checkout endpoint
router.options('/create-checkout-session', (req, res) => {
  console.log('Received OPTIONS preflight for checkout endpoint');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Origin, Authorization, Cache-Control, Pragma, Expires');
  res.set('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(204).end();
});

// Create a checkout session
router.post('/create-checkout-session', async (req, res) => {
  console.log('Received checkout session request from:', req.headers.origin || 'unknown origin');
  
  // Add CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Origin, Authorization');
  
  try {
    const { priceId, userId, email, returnUrl } = req.body;
    
    if (!userId || !email) {
      console.log('Missing required parameters: userId or email');
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log(`Creating checkout session for user ${userId} (${email})`);
    
    // Always use monthly price ID regardless of what was requested
    const finalPriceId = priceId || STRIPE_PRICES.MONTHLY;
    console.log(`Using price ID: ${finalPriceId}`);
    
    // Determine the correct domain for success/cancel URLs
    let checkoutDomain = returnUrl || DEFAULT_DOMAIN;
    
    // Get user data from Firestore
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    // Create a new customer or use existing one
    let customerId;
    if (userDoc.exists && userDoc.data().stripeCustomerId) {
      customerId = userDoc.data().stripeCustomerId;
      console.log(`Using existing Stripe customer ID: ${customerId}`);
    } else {
      // Create a new customer
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;
      console.log(`Created new Stripe customer: ${customerId}`);
      
      // Update user with Stripe customer ID
      await userRef.update({
        stripeCustomerId: customerId,
      });
    }
    
    // Create the checkout session with proper URLs
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${checkoutDomain}/pricing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${checkoutDomain}/pricing`,
      subscription_data: {
        metadata: {
          userId: userId,
        },
      },
      // Allow checkout sessions to be used up to 1 hour after creation
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });
    
    console.log(`Created checkout session: ${session.id} with URL: ${session.url}`);
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check session status endpoint
router.get('/check-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(`Checking status of session ${sessionId}`);
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    console.log(`Session ${sessionId} status: ${session.payment_status}`);
    
    res.json({
      success: true,
      status: session.status,
      paymentStatus: session.payment_status,
      customerId: session.customer,
      subscriptionId: session.subscription
    });
  } catch (error) {
    console.error(`Error checking session status: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to check session status',
      error: error.message
    });
  }
});

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  // Log webhook received
  console.log('Stripe webhook received');
  
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set in the environment variables');
    return res.status(500).send('Webhook secret not configured');
  }
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
    
    console.log(`Webhook event received: ${event.type}`);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
  
  const db = getFirestore();
  
  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('Checkout session completed:', session.id);
      
      try {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const customerId = session.customer;
        
        // Find the user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (snapshot.empty) {
          console.error('No user found with customerId:', customerId);
          
          // If the customer has metadata with userId, try that as a fallback
          const customer = await stripe.customers.retrieve(customerId);
          if (customer && customer.metadata && customer.metadata.userId) {
            const userId = customer.metadata.userId;
            console.log(`Found userId ${userId} in customer metadata, using as fallback`);
            
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
              // Update the user's subscription status
              await db.collection('users').doc(userId).update({
                isPro: true,
                stripeCustomerId: customerId, // Make sure this is set
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                subscriptionEndDate: new Date(subscription.current_period_end * 1000),
                modelsRemainingThisMonth: Infinity, // Pro users get unlimited generations
                subscriptionPlan: 'pro', // Only monthly plan is available
                lastUpdated: new Date(),
                trialActive: false
              });
              
              console.log(`Updated user ${userId} with checkout session data using metadata fallback`);
              break;
            }
          }
          
          return res.status(400).send('User not found');
        }
        
        // Get the first matching document
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        
        console.log(`Updating user ${userId} with subscription data from checkout session`);
        
        // Update the user's subscription status
        await db.collection('users').doc(userId).update({
          isPro: true,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000),
          modelsRemainingThisMonth: Infinity, // Pro users get unlimited generations
          // Keep track of the subscription plan
          subscriptionPlan: 'pro', 
          // Clear any trial status
          trialActive: false,
          // Add timestamp for when this update occurred
          lastUpdated: new Date()
        });
        
        console.log(`Successfully updated user ${userId} subscription status to PRO`);
      } catch (error) {
        console.error('Error processing checkout.session.completed webhook:', error);
        // Don't return error status to Stripe - we want to acknowledge receipt
      }
      
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      // Find the user by customer ID
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        
        console.log(`Updating subscription for user ${userId}`);
        
        // Update user subscription status
        await db.collection('users').doc(userId).update({
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000),
          // Only mark as Pro if the subscription is active
          isPro: subscription.status === 'active',
          lastUpdated: new Date()
        });
      }
      
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      // Find the user by customer ID
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        
        console.log(`Subscription cancelled for user ${userId}`);
        
        // Update user to reflect cancelled subscription
        await db.collection('users').doc(userId).update({
          isPro: false,
          subscriptionStatus: 'cancelled',
          modelsRemainingThisMonth: 10, // Reset to free tier limit
          lastUpdated: new Date()
        });
      }
      
      break;
    }
    
    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
  
  // Return a 200 response to acknowledge receipt of the event
  res.send();
});

// Get user subscription endpoint
router.get('/user-subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Getting subscription data for user: ${userId}`);
    
    // Get user data from Firestore
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User ${userId} not found in Firestore`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    console.log(`Retrieved user data for ${userId}`);
    
    // If user has a Stripe subscription ID, get the subscription details
    if (userData.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
        
        // Check if the subscription is active
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        
        // Ensure user status is consistent with Stripe status
        if (userData.isPro !== isActive) {
          console.log(`User ${userId} pro status is inconsistent with Stripe. Updating from ${userData.isPro} to ${isActive}`);
          
          // Update the user's pro status to match Stripe
          await userRef.update({
            isPro: isActive,
            subscriptionStatus: subscription.status,
            lastUpdated: new Date()
          });
          
          // Update local userData for response
          userData.isPro = isActive;
          userData.subscriptionStatus = subscription.status;
        }
      } catch (stripeError) {
        console.error(`Error retrieving subscription from Stripe: ${stripeError.message}`);
        // If we can't reach Stripe, just continue with the data from Firestore
      }
    }
    
    // Return the user's subscription data
    res.json({
      isPro: userData.isPro === true,
      modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 0,
      modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
      downloadsThisMonth: userData.downloadsThisMonth || 0,
      subscriptionStatus: userData.subscriptionStatus || 'none',
      subscriptionEndDate: userData.subscriptionEndDate 
        ? userData.subscriptionEndDate instanceof Date 
          ? userData.subscriptionEndDate.toISOString() 
          : userData.subscriptionEndDate
        : null,
      subscriptionPlan: userData.subscriptionPlan || 'free',
      trialActive: userData.trialActive === true,
      trialEndDate: userData.trialEndDate 
        ? userData.trialEndDate instanceof Date 
          ? userData.trialEndDate.toISOString()
          : userData.trialEndDate 
        : null
    });
  } catch (error) {
    console.error('Error retrieving user subscription:', error);
    res.status(500).json({ error: 'Failed to retrieve subscription data' });
  }
});

// Start free trial endpoint
router.post('/start-trial', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Starting free trial for user: ${userId}`);
    
    // Get user data from Firestore
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User ${userId} not found in Firestore`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Check if the user has already had a trial
    if (userData.trialUsed) {
      console.log(`User ${userId} has already used their trial`);
      return res.status(400).json({ error: 'User has already used their free trial' });
    }
    
    // Calculate trial end date (7 days from now)
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Update the user with trial data
    await userRef.update({
      isPro: true,
      trialActive: true,
      trialStartDate: now,
      trialEndDate: trialEndDate,
      trialUsed: true,
      subscriptionStatus: 'trialing',
      subscriptionPlan: 'pro',
      modelsRemainingThisMonth: Infinity, // Pro users get unlimited generations
      lastUpdated: now
    });
    
    console.log(`Free trial started for user ${userId}, ending on ${trialEndDate.toISOString()}`);
    
    // Return the updated trial data
    res.json({
      success: true,
      isPro: true,
      trialActive: true,
      trialStartDate: now.toISOString(),
      trialEndDate: trialEndDate.toISOString(),
      message: 'Free trial started successfully'
    });
  } catch (error) {
    console.error('Error starting free trial:', error);
    res.status(500).json({ error: 'Failed to start free trial' });
  }
});

// Cancel subscription endpoint
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Canceling subscription for user: ${userId}`);
    
    // Get user data from Firestore
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User ${userId} not found in Firestore`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Check if the user has an active subscription
    if (!userData.stripeSubscriptionId) {
      console.log(`User ${userId} does not have an active subscription`);
      return res.status(400).json({ error: 'User does not have an active subscription' });
    }
    
    // Cancel the subscription with Stripe
    const subscription = await stripe.subscriptions.update(
      userData.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );
    
    console.log(`Subscription ${userData.stripeSubscriptionId} canceled for user ${userId}`);
    
    // Update the user in Firestore
    await userRef.update({
      subscriptionStatus: 'canceling',
      subscriptionCancelDate: new Date(),
      lastUpdated: new Date()
    });
    
    // Return the updated subscription status
    res.json({
      success: true,
      subscriptionStatus: 'canceling',
      message: 'Subscription has been canceled and will end at the end of the current billing period',
      endDate: new Date(subscription.current_period_end * 1000).toISOString()
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Verify subscription endpoint
router.post('/verify-subscription', async (req, res) => {
  try {
    const { userId, email, sessionId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Verifying subscription for user: ${userId}, session: ${sessionId || 'none'}`);
    
    // Get user data from Firestore
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User ${userId} not found in Firestore`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Check if the user already has Pro status
    if (userData.isPro === true) {
      console.log(`User ${userId} already has Pro status, no need to verify`);
      return res.json({
        success: true,
        subscription: {
          isPro: true,
          modelsRemainingThisMonth: userData.modelsRemainingThisMonth || Infinity,
          subscriptionStatus: userData.subscriptionStatus || 'active',
          subscriptionPlan: userData.subscriptionPlan || 'pro'
        },
        message: 'User already has Pro access'
      });
    }
    
    // If a session ID was provided, check the session status
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        // If the session was successful, update the user
        if (session.payment_status === 'paid' || session.status === 'complete') {
          // Update the user to Pro
          await userRef.update({
            isPro: true,
            stripeSubscriptionId: session.subscription,
            subscriptionStatus: 'active',
            subscriptionPlan: 'pro',
            modelsRemainingThisMonth: Infinity,
            lastUpdated: new Date()
          });
          
          console.log(`User ${userId} upgraded to Pro based on session ${sessionId}`);
          
          return res.json({
            success: true,
            subscription: {
              isPro: true,
              modelsRemainingThisMonth: Infinity,
              subscriptionStatus: 'active',
              subscriptionPlan: 'pro'
            },
            message: 'User subscription verified and upgraded to Pro'
          });
        } else {
          console.log(`Session ${sessionId} is not complete: ${session.status}, ${session.payment_status}`);
        }
      } catch (sessionError) {
        console.error(`Error retrieving session ${sessionId}:`, sessionError);
        // Continue to check other methods
      }
    }
    
    // Check if the user has a Stripe customer ID but no subscription
    if (userData.stripeCustomerId) {
      try {
        // Look for active subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: userData.stripeCustomerId,
          status: 'active',
          limit: 1
        });
        
        // If an active subscription exists, update the user
        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          
          await userRef.update({
            isPro: true,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionEndDate: new Date(subscription.current_period_end * 1000),
            subscriptionPlan: 'pro',
            modelsRemainingThisMonth: Infinity,
            lastUpdated: new Date()
          });
          
          console.log(`User ${userId} upgraded to Pro based on existing subscription ${subscription.id}`);
          
          return res.json({
            success: true,
            subscription: {
              isPro: true,
              modelsRemainingThisMonth: Infinity,
              subscriptionStatus: subscription.status,
              subscriptionPlan: 'pro'
            },
            message: 'User subscription verified and upgraded to Pro'
          });
        }
      } catch (stripeError) {
        console.error('Error checking Stripe subscriptions:', stripeError);
        // Continue to check other methods
      }
    }
    
    // If we get here, the user does not have an active subscription
    console.log(`User ${userId} does not have an active subscription`);
    
    return res.json({
      success: true,
      subscription: {
        isPro: false,
        modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 10,
        subscriptionStatus: 'none',
        subscriptionPlan: 'free'
      },
      message: 'User does not have an active subscription'
    });
  } catch (error) {
    console.error('Error verifying subscription:', error);
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
});

module.exports = router; 