import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import { getFirebaseAdmin, getFirestore } from '../utils/firebase-admin';

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set appropriate CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check authentication/admin status (simplified for this tool)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const expectedApiKey = process.env.ADMIN_API_KEY || 'admin-fishcad-2024';
  
  if (apiKey !== expectedApiKey) {
    return res.status(403).json({ 
      success: false, 
      message: 'Unauthorized. This endpoint requires authentication.' 
    });
  }

  // Handle different request types
  if (req.method === 'GET') {
    // GET - lookup subscription data
    const { userId, email, checkOnly } = req.query;
    
    if (!userId && !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters. Either userId or email must be provided.' 
      });
    }
    
    try {
      const admin = getFirebaseAdmin();
      const db = getFirestore();
      
      let userDoc;
      
      // Try to find user by ID
      if (userId) {
        const userRef = db.collection('users').doc(userId as string);
        userDoc = await userRef.get();
      }
      
      // If not found by ID and email is provided, try to find by email
      if (!userDoc?.exists && email) {
        const usersRef = db.collection('users');
        const querySnapshot = await usersRef.where('email', '==', email).limit(1).get();
        
        if (!querySnapshot.empty) {
          userDoc = querySnapshot.docs[0];
        }
      }
      
      if (!userDoc?.exists) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found in database' 
        });
      }
      
      const userData = userDoc.data();
      
      // Check Stripe for customer/subscription info
      let stripeCustomerId = userData?.stripeCustomerId;
      let stripeData = null;
      
      if (stripeCustomerId) {
        try {
          // Get customer data from Stripe
          const customer = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer;
          
          // Get subscription data if available
          let subscription = null;
          if (userData?.stripeSubscriptionId) {
            try {
              subscription = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
            } catch (subError) {
              console.error('Error retrieving subscription:', subError);
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
          
          stripeData = {
            customer,
            subscription
          };
        } catch (stripeError) {
          console.error('Error retrieving Stripe data:', stripeError);
        }
      }
      
      return res.status(200).json({
        success: true,
        user: {
          id: userDoc.id,
          ...userData,
        },
        stripe: stripeData
      });
    } catch (error) {
      console.error('Error retrieving user data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error retrieving user data',
        error: error.message
      });
    }
  } else if (req.method === 'POST') {
    // POST - update subscription status
    const { userId, action, subscriptionId, customerId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: userId' 
      });
    }
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: action' 
      });
    }
    
    try {
      const admin = getFirebaseAdmin();
      const db = getFirestore();
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found in database' 
        });
      }
      
      const userData = userDoc.data();
      
      // Handle different actions
      switch (action) {
        case 'set_pro': {
          // Manually set user to pro
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
          
          return res.status(200).json({
            success: true,
            message: 'User successfully set to Pro status',
            user: {
              id: userDoc.id,
              ...userData,
              ...updateData
            }
          });
        }
        
        case 'sync_stripe': {
          // Sync with Stripe data
          if (!subscriptionId) {
            return res.status(400).json({ 
              success: false, 
              message: 'Missing required parameter for sync_stripe action: subscriptionId' 
            });
          }
          
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            // Get customer ID either from request or subscription
            const stripeCustomerId = customerId || 
              (typeof subscription.customer === 'string' ? 
                subscription.customer : 
                subscription.customer.id);
                
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
              stripeCustomerId,
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              subscriptionEndDate: endDate.toISOString(),
              subscriptionPlan: priceId,
              modelsRemainingThisMonth: isActive ? 999999 : 2,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            await userRef.update(updateData);
            
            return res.status(200).json({
              success: true,
              message: 'User subscription synchronized with Stripe',
              user: {
                id: userDoc.id,
                ...userData,
                ...updateData
              },
              stripe: subscription
            });
          } catch (stripeError) {
            console.error('Error syncing with Stripe:', stripeError);
            return res.status(500).json({ 
              success: false, 
              message: 'Error syncing with Stripe',
              error: stripeError.message
            });
          }
        }
        
        case 'reset': {
          // Reset to free tier
          const updateData = {
            isPro: false,
            subscriptionStatus: 'none',
            subscriptionPlan: 'free',
            subscriptionEndDate: null,
            modelsRemainingThisMonth: 2,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await userRef.update(updateData);
          
          return res.status(200).json({
            success: true,
            message: 'User reset to free tier',
            user: {
              id: userDoc.id,
              ...userData,
              ...updateData
            }
          });
        }
        
        default:
          return res.status(400).json({ 
            success: false, 
            message: `Unknown action: ${action}` 
          });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error updating user',
        error: error.message
      });
    }
  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
} 