import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import { getFirebaseAdmin, getFirestore } from '../utils/firebase-admin';
import { buffer } from 'micro';

// Define interfaces for type safety
interface UserData {
  uid?: string;
  email?: string;
  isPro?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionEndDate?: string;
  subscriptionPlan?: string;
  modelsRemainingThisMonth?: number;
  createdAt?: any; // using any for flexibility with server timestamps
  updatedAt?: any;
  [key: string]: any; // Allow additional properties
}

// This is a special helper for raw bodies in Vercel serverless functions
export const config = {
  api: {
    bodyParser: false, // Disable body parsing, needed for Stripe webhook verification
  },
};

// Initialize Stripe with the secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Debug: Log the request information
  console.log(`Webhook received: ${req.method} ${req.url}`);
  
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

  if (!sig) {
    console.error('Missing stripe-signature header');
    return res.status(400).json({ success: false, message: 'Missing signature header' });
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

  // Get Firebase Admin and Firestore instances
  try {
    const admin = getFirebaseAdmin();
    const db = getFirestore();
    
    console.log(`Processing webhook event: ${event.type}, id: ${event.id}`);

    // Handle the event based on its type
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`Processing completed checkout session: ${session.id}`);
        
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
        const subscriptionId = typeof session.subscription === 'string' 
          ? session.subscription 
          : session.subscription.id;
          
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        console.log(`Retrieved subscription: ${subscription.id}, status: ${subscription.status}`);
        
        // Get user ID from session metadata or customer metadata
        let userId = session.metadata?.userId;
        console.log(`Initial userId from session metadata: ${userId || 'not found'}`);
        
        // If no user ID in session metadata, try to get it from customer metadata
        if (!userId && session.customer) {
          console.log(`Looking up customer metadata for customer: ${session.customer}`);
          const customerId = typeof session.customer === 'string' 
            ? session.customer 
            : session.customer.id;
            
          const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
          
          userId = customer.metadata?.userId;
          console.log(`UserId from customer metadata: ${userId || 'not found'}`);
        }
        
        if (!userId) {
          console.error('No user ID found in session or customer metadata');
          break;
        }
        
        console.log(`Updating subscription status for user: ${userId}`);
        
        // Get subscription plan info - add null checks
        const priceId = subscription.items.data && 
                       subscription.items.data.length > 0 && 
                       subscription.items.data[0].price ? 
          subscription.items.data[0].price.id : 
          'unknown';
        
        // Get customer ID - add null checks
        const customerId = typeof session.customer === 'string' 
          ? session.customer 
          : session.customer?.id;
          
        // Calculate end date - add null checks
        const endDate = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now
        
        // Log the update we're about to make
        console.log(`Setting user ${userId} to isPro=true, with subscription ID ${subscription.id}, status ${subscription.status}`);
        
        // Update user subscription status in Firestore
        const userDocRef = db.collection('users').doc(userId);
        const updateData: UserData = {
          isPro: true,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionEndDate: endDate.toISOString(),
          subscriptionPlan: priceId,
          modelsRemainingThisMonth: 999999, // Effectively unlimited
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        console.log(`Updating Firestore document for user ${userId} with:`, JSON.stringify(updateData));
        
        // Check if the user exists first
        try {
          const userDoc = await userDocRef.get();
          if (!userDoc.exists) {
            console.log(`User ${userId} doesn't exist in Firestore, creating new document`);
            
            // Get customer email - add null checks
            let customerEmail = '';
            if (typeof session.customer === 'string') {
              try {
                const customerData = await stripe.customers.retrieve(session.customer) as Stripe.Customer;
                customerEmail = customerData.email || '';
              } catch (error) {
                console.error('Error retrieving customer email:', error);
              }
            } else if (session.customer) {
              customerEmail = (session.customer as Stripe.Customer)?.email || '';
            }
            
            await userDocRef.set({
              ...updateData,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              email: customerEmail
            });
          } else {
            console.log(`User ${userId} exists in Firestore, updating document`);
            await userDocRef.update(updateData);
            
            // Double-check that the update was applied
            const updatedDoc = await userDocRef.get();
            const updatedData = updatedDoc.data();
            if (updatedData && (!updatedData.isPro || updatedData.subscriptionStatus !== subscription.status)) {
              console.error(`Update may not have been applied correctly. Current data:`, updatedData);
              // Try to update again with a different approach
              await userDocRef.set(updateData, { merge: true });
            }
          }
          
          console.log(`✅ Successfully updated subscription status for user ${userId}`);
        } catch (firestoreError) {
          console.error(`⚠️ Error updating Firestore for user ${userId}:`, firestoreError);
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Processing subscription update: ${subscription.id}, status: ${subscription.status}`);
        
        // Get user ID from subscription metadata
        let userId = subscription.metadata?.userId;
        
        // If no user ID in subscription metadata, try to get it from customer metadata
        if (!userId && subscription.customer) {
          const customerId = typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id;
            
          try {
            const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
            userId = customer.metadata?.userId;
          } catch (error) {
            console.error('Error retrieving customer:', error);
          }
        }
        
        if (!userId) {
          console.error('No user ID found in subscription or customer metadata');
          break;
        }
        
        const db = getFirestore();
        const userRef = db.collection('users').doc(userId);
        
        try {
          // Get current user data
          const userDoc = await userRef.get();
          if (!userDoc.exists) {
            console.error(`User ${userId} not found in Firestore`);
            break;
          }
          
          const userData = userDoc.data() || {};
          
          // Update status based on subscription status
          const isPro = subscription.status === 'active' || 
                        subscription.status === 'trialing';
                        
          // Calculate end date
          const endDate = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null;
            
          const updateData: any = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            subscriptionStatus: subscription.status,
            isPro: isPro,
          };
          
          if (endDate) {
            updateData.subscriptionEndDate = endDate.toISOString();
          }
          
          // Update Firestore
          await userRef.update(updateData);
          console.log(`Updated subscription status for user ${userId} to ${subscription.status}, isPro=${isPro}`);
          
        } catch (firestoreError) {
          console.error('Error updating user subscription status:', firestoreError);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Processing subscription deletion: ${subscription.id}`);
        
        // Get user ID from subscription metadata
        let userId = subscription.metadata?.userId;
        
        // If no user ID in subscription metadata, try to get it from customer metadata
        if (!userId && subscription.customer) {
          const customerId = typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id;
            
          try {
            const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
            userId = customer.metadata?.userId;
          } catch (error) {
            console.error('Error retrieving customer:', error);
          }
        }
        
        if (!userId) {
          console.error('No user ID found in subscription or customer metadata');
          break;
        }
        
        const db = getFirestore();
        const userRef = db.collection('users').doc(userId);
        
        try {
          // Update subscription status
          await userRef.update({
            isPro: false,
            subscriptionStatus: 'canceled',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          console.log(`Updated subscription status for user ${userId} to canceled, isPro=false`);
        } catch (firestoreError) {
          console.error('Error updating user subscription status:', firestoreError);
        }
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    // Return a response to acknowledge receipt of the event
    return res.status(200).json({ received: true, id: event.id });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ success: false, message: 'Error processing webhook' });
  }
} 