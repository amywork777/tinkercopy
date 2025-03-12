const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getFirestore } = require('firebase-admin/firestore');
const router = express.Router();

// Constants
const DEFAULT_DOMAIN = process.env.DOMAIN || 'https://fishcad.com';
const STRIPE_PRICES = {
  MONTHLY: process.env.STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ',
  ANNUAL: process.env.STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
};

// Add CORS preflight handler for checkout endpoint
router.options('/create-checkout-session', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Origin');
  res.set('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(204).end();
});

// Create a checkout session
router.post('/create-checkout-session', async (req, res) => {
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Add CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const { priceId, userId, email, domain, origin } = req.body;
    
    if (!priceId || !userId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log(`Creating checkout session for user ${userId} with price ${priceId}`);
    console.log(`Request from domain: ${domain}, origin: ${origin || 'none'}`);
    
    // Determine the correct domain for success/cancel URLs
    let checkoutDomain = DEFAULT_DOMAIN;
    
    // Special handling for fishcad.com
    if (domain && domain.includes('fishcad.com')) {
      checkoutDomain = 'https://fishcad.com';
      console.log(`Using fishcad.com domain for checkout URLs: ${checkoutDomain}`);
    } else if (domain) {
      // Ensure the domain has https://
      checkoutDomain = domain.startsWith('http') ? domain : `https://${domain}`;
      console.log(`Using customer-provided domain for checkout: ${checkoutDomain}`);
    }
    
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
          price: priceId,
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
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  // Log webhook received
  console.log('Stripe webhook received');
  
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
                subscriptionPlan: subscription.items.data[0].price.id === STRIPE_PRICES.ANNUAL ? 'annual' : 'monthly',
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
          subscriptionPlan: subscription.items.data[0].price.id === STRIPE_PRICES.ANNUAL ? 'annual' : 'monthly',
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
        
        // Check if subscription is active
        const isActive = ['active', 'trialing'].includes(subscription.status);
        
        // Update the user's subscription status
        await db.collection('users').doc(userDoc.id).update({
          isPro: isActive,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000),
          // Update plan if it changed
          subscriptionPlan: subscription.items.data[0].price.id === STRIPE_PRICES.ANNUAL ? 'annual' : 'monthly',
          // Clear any trial status if they have a paid subscription
          trialActive: false
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
        
        // Downgrade user to free tier
        await db.collection('users').doc(userDoc.id).update({
          isPro: false,
          subscriptionStatus: 'canceled',
          modelsRemainingThisMonth: 0, // Free tier with no generations
        });
      }
      
      break;
    }
    
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      
      // Only handle subscription invoices
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customerId = invoice.customer;
        
        // Find the user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];
          
          // Update subscription end date
          await db.collection('users').doc(userDoc.id).update({
            subscriptionEndDate: new Date(subscription.current_period_end * 1000),
            // Reset monthly limits
            modelsGeneratedThisMonth: 0,
            modelsRemainingThisMonth: Infinity, // Pro tier with unlimited generations
            lastResetDate: new Date().toISOString().substring(0, 7),
          });
        }
      }
      
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      
      // Handle failed payment - you might want to notify the user
      if (invoice.subscription) {
        const customerId = invoice.customer;
        
        // Find the user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];
          
          // Update subscription status
          await db.collection('users').doc(userDoc.id).update({
            subscriptionStatus: 'past_due',
          });
          
          // Here you could trigger an email notification to the user
        }
      }
      
      break;
    }
  }
  
  res.status(200).send({ received: true });
});

// Get user subscription status
router.get('/user-subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }
    
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Return user subscription data
    res.json({
      isPro: userData.isPro || false,
      modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 0,
      modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
      downloadsThisMonth: userData.downloadsThisMonth || 0,
      subscriptionStatus: userData.subscriptionStatus || 'none',
      subscriptionEndDate: userData.subscriptionEndDate || null,
      subscriptionPlan: userData.subscriptionPlan || 'free',
      trialActive: userData.trialActive || false,
      trialEndDate: userData.trialEndDate || null
    });
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }
    
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }
    
    // Cancel the subscription at period end
    await stripe.subscriptions.update(userData.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    
    // Update the user's subscription status
    await db.collection('users').doc(userId).update({
      subscriptionStatus: 'canceling',
    });
    
    res.json({ success: true, message: 'Subscription will be canceled at the end of the billing period' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 