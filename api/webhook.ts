import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import * as admin from 'firebase-admin';
import { buffer } from 'micro';

// This is a special helper for raw bodies in Vercel serverless functions
export const config = {
  api: {
    bodyParser: false, // Disable body parsing, needed for Stripe webhook verification
  },
};

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// Initialize Firebase Admin SDK if not already initialized
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
      storageBucket: 'taiyaki-test1.firebasestorage.app'
    });
    
    console.log('Firebase Admin SDK initialized in webhook handler');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Debug: Log the request information
  console.log(`Webhook received: ${req.method} ${req.url}`);
  console.log(`Headers: ${JSON.stringify(req.headers)}`);
  
  // Special handling for OPTIONS requests (CORS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');
    res.status(200).end();
    return;
  }
  
  // Only allow POST for webhooks
  if (req.method !== 'POST') {
    console.error(`Invalid method: ${req.method}`);
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Get the raw request body for Stripe webhook signature verification
  let rawBody: Buffer;
  try {
    rawBody = await buffer(req);
    console.log(`Raw body received, length: ${rawBody.length} bytes`);
  } catch (error) {
    console.error('Error getting raw request body:', error);
    return res.status(400).json({ success: false, message: 'Error reading request body' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;

  try {
    // Verify the event came from Stripe using raw body
    event = stripe.webhooks.constructEvent(
      rawBody.toString(),
      sig,
      webhookSecret
    );
    console.log(`✅ Stripe signature verified for event: ${event.type}, id: ${event.id}`);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ success: false, message: `Webhook Error: ${err.message}` });
  }

  // Get Firestore instance
  const db = admin.firestore();
  console.log(`Processing webhook event: ${event.type}, id: ${event.id}`);

  try {
    // Handle the event based on its type
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`Processing completed checkout session: ${session.id}`);
        console.log(`Session metadata:`, session.metadata);
        console.log(`Session mode: ${session.mode}`);
        
        // Only handle subscription checkouts
        if (session.mode !== 'subscription') {
          console.log('Not a subscription checkout, skipping');
          break;
        }
        
        // Make sure we have a subscription ID
        if (!session.subscription) {
          console.error('No subscription ID in completed session');
          break;
        }
        
        // Fetch more details about the subscription
        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        );
        console.log(`Retrieved subscription: ${subscription.id}, status: ${subscription.status}`);
        
        // Get user ID from session metadata or customer metadata
        let userId = session.metadata?.userId;
        console.log(`Initial userId from session metadata: ${userId || 'not found'}`);
        
        // If no user ID in session metadata, try to get it from customer metadata
        if (!userId && session.customer) {
          console.log(`Looking up customer metadata for customer: ${session.customer}`);
          const customer = await stripe.customers.retrieve(
            typeof session.customer === 'string' ? session.customer : session.customer.id
          ) as Stripe.Customer;
          
          userId = customer.metadata?.userId;
          console.log(`UserId from customer metadata: ${userId || 'not found'}`);
        }
        
        if (!userId) {
          console.error('No user ID found in session or customer metadata');
          break;
        }
        
        console.log(`Updating subscription status for user: ${userId}`);
        
        // Get subscription plan info
        const priceId = subscription.items.data[0].price.id;
        
        // Log the update we're about to make
        console.log(`Setting user to isPro=true, with subscription ID ${subscription.id}, status ${subscription.status}`);
        
        // Update user subscription status in Firestore
        const userDocRef = db.collection('users').doc(userId);
        const updateData = {
          isPro: true,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
          subscriptionPlan: priceId,
          modelsRemainingThisMonth: 999999, // Effectively unlimited
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        console.log(`Updating Firestore document for user ${userId} with:`, updateData);
        
        // Check if the user exists first
        try {
          const userDoc = await userDocRef.get();
          if (!userDoc.exists) {
            console.log(`User ${userId} doesn't exist in Firestore, creating new document`);
            await userDocRef.set({
              ...updateData,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              email: (typeof session.customer === 'string') ? 
                ((await stripe.customers.retrieve(session.customer)) as Stripe.Customer).email || '' : 
                (session.customer as Stripe.Customer)?.email || ''
            });
          } else {
            console.log(`User ${userId} exists in Firestore, updating document`);
            await userDocRef.update(updateData);
            
            // Double-check that the update was applied
            const updatedDoc = await userDocRef.get();
            const updatedData = updatedDoc.data();
            if (!updatedData?.isPro || updatedData?.subscriptionStatus !== subscription.status) {
              console.error(`Update may not have been applied correctly. Current data:`, updatedData);
              // Try to update again with a different approach
              await userDocRef.set(updateData, { merge: true });
            }
          }
          
          console.log(`✅ User ${userId} subscription updated with status: ${subscription.status}`);
        } catch (firestoreError) {
          console.error(`Error updating Firestore for user ${userId}:`, firestoreError);
          // Try alternative update method
          try {
            await userDocRef.set(updateData, { merge: true });
            console.log(`✅ Alternative update method successful for user ${userId}`);
          } catch (fallbackError) {
            console.error(`Fallback update also failed:`, fallbackError);
          }
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Processing subscription update: ${subscription.id}`);
        
        // Get customer ID
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        console.log(`Looking up user with Stripe customer ID: ${customerId}`);
        
        // Find user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (snapshot.empty) {
          console.error(`No user found with Stripe customer ID: ${customerId}`);
          
          // Try to get userId from subscription metadata as a fallback
          const userId = subscription.metadata?.userId;
          if (userId) {
            console.log(`Found userId in subscription metadata: ${userId}`);
            
            // Check if this user exists in Firestore
            const userDoc = await usersRef.doc(userId).get();
            if (userDoc.exists) {
              console.log(`User document exists for ${userId}, updating with new subscription data`);
              // Check if subscription is active
              const isActive = ['active', 'trialing'].includes(subscription.status);
              console.log(`Subscription status: ${subscription.status}, isActive: ${isActive}`);
              
              // Update with subscription data
              const updateData = {
                isPro: isActive,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
                subscriptionPlan: subscription.items.data[0].price.id,
                modelsRemainingThisMonth: isActive ? 999999 : 2, // Unlimited if active, limited if not
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              };
              
              await usersRef.doc(userId).set(updateData, { merge: true });
              console.log(`✅ Updated user ${userId} with subscription data from metadata`);
            } else {
              console.error(`User document not found for userId ${userId} from metadata`);
            }
          } else {
            console.error(`No userId found in subscription metadata`);
          }
          
          break;
        }
        
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        console.log(`Found user: ${userId}`);
        
        // Check if subscription is active
        const isActive = ['active', 'trialing'].includes(subscription.status);
        console.log(`Subscription status: ${subscription.status}, isActive: ${isActive}`);
        
        // Prepare the update data
        const updateData = {
          isPro: isActive,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
          subscriptionPlan: subscription.items.data[0].price.id,
          modelsRemainingThisMonth: isActive ? 999999 : 2, // Unlimited if active, limited if not
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        console.log(`Updating user ${userId} with:`, updateData);
        
        // Update the user's subscription status with a merge to ensure we don't lose data
        await usersRef.doc(userId).set(updateData, { merge: true });
        
        console.log(`✅ User ${userId} subscription updated with status: ${subscription.status}`);
        
        // Double-check that the update was applied
        const updatedDoc = await usersRef.doc(userId).get();
        const updatedData = updatedDoc.data();
        if (!updatedData?.isPro === isActive || updatedData?.subscriptionStatus !== subscription.status) {
          console.error(`Update may not have been applied correctly. Current data:`, updatedData);
          // Try to update again
          await usersRef.doc(userId).set(updateData, { merge: true });
        }
        
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Processing subscription deletion: ${subscription.id}`);
        
        // Get customer ID
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        console.log(`Looking up user with Stripe customer ID: ${customerId}`);
        
        // Find user by customer ID
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).get();
        
        if (snapshot.empty) {
          console.error(`No user found with Stripe customer ID: ${customerId}`);
          break;
        }
        
        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;
        console.log(`Found user: ${userId}`);
        
        // Prepare update data for downgrade
        const updateData = {
          isPro: false,
          subscriptionStatus: 'canceled',
          modelsRemainingThisMonth: 2, // Free tier limit
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        console.log(`Downgrading user to free tier:`, updateData);
        
        // Downgrade user to free tier
        await usersRef.doc(userId).update(updateData);
        
        console.log(`✅ User ${userId} subscription canceled`);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    console.log('Webhook processed successfully');
    return res.status(200).json({ received: true, success: true });
  } catch (error: any) {
    console.error(`Error processing webhook: ${error.message}`);
    console.error(error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
} 