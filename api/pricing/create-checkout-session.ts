import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';
import { getFirebaseAdmin, getFirestore } from '../../utils/firebase-admin';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { priceId, userId, email } = req.body;
    
    if (!priceId || !userId || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters',
        message: 'priceId, userId, and email are all required'
      });
    }
    
    console.log(`Creating subscription checkout for user: ${userId}, email: ${email}, priceId: ${priceId}`);
    
    // Get Firebase Admin and Firestore instances
    const admin = getFirebaseAdmin();
    const db = getFirestore();
    
    // Look up user in Firestore
    let customerId: string | undefined = undefined;
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists && userDoc.data()?.stripeCustomerId) {
        customerId = userDoc.data()?.stripeCustomerId;
        console.log(`Found existing customer ID for user ${userId}: ${customerId}`);
      }
    } catch (error) {
      console.error('Error fetching user from Firestore:', error);
      // Continue without customerId - we'll create a new one
    }
    
    // If no customer ID found, create a new customer
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email,
          metadata: {
            userId, // Store user ID in Stripe customer metadata
          },
        });
        customerId = customer.id;
        console.log(`Created new Stripe customer for user ${userId}: ${customerId}`);
        
        // Update user record with new customer ID
        await db.collection('users').doc(userId).set({
          email,
          stripeCustomerId: customerId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`Updated user ${userId} with Stripe customer ID: ${customerId}`);
      } catch (error) {
        console.error('Error creating Stripe customer:', error);
        // Continue without updating Firestore - the webhook will handle it
      }
    }
    
    // Create the checkout session with user ID in metadata
    const session = await stripe.checkout.sessions.create({
      customer: customerId || undefined,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://www.fishcad.com'}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://www.fishcad.com'}/pricing`,
      metadata: {
        userId, // IMPORTANT: Store user ID in session metadata for webhook
        source: 'pricing_page'
      },
      subscription_data: {
        metadata: {
          userId, // Store user ID in subscription metadata as well
          source: 'pricing_page'
        }
        // No trial by default
      },
      allow_promotion_codes: true, // Allow promotion codes 
    });
    
    console.log(`Checkout session created with ID: ${session.id}, for user: ${userId}`);
    
    // Create/update the user document in Firestore to ensure it exists
    try {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log(`Creating new user document for ${userId}`);
        await userRef.set({
          email,
          stripeCustomerId: customerId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          isPro: false, // Will be updated by webhook when payment completes
          subscriptionStatus: 'pending', // Will be updated by webhook
        });
      } else {
        console.log(`Updating existing user document for ${userId}`);
        await userRef.update({
          stripeCustomerId: customerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (firestoreError) {
      console.error('Error updating Firestore:', firestoreError);
      // Continue anyway as the webhook will handle this
    }
    
    return res.status(200).json({ 
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create checkout session'
    });
  }
} 