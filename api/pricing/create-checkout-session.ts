import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';

// Initialize Stripe
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
    console.log('Received request to /api/pricing/create-checkout-session with body:', req.body);
    
    const { priceId, userId, email } = req.body;
    
    if (!priceId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing priceId parameter',
        message: 'The priceId parameter is required for subscription checkout'
      });
    }
    
    // Create a subscription checkout session
    console.log(`Creating subscription checkout with priceId: ${priceId}, userId: ${userId || 'not provided'}`);
    
    // Get the host from the request
    const host = req.headers.origin || '';
    
    // Create the session for subscription
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${host}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${host}/pricing`,
      client_reference_id: userId || undefined,
      customer_email: email || undefined,
      metadata: {
        userId: userId || '',
        checkoutType: 'subscription'
      }
    });
    
    console.log('Created checkout session:', session.id);
    
    // Return the checkout URL
    return res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error('Error creating subscription checkout session:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
} 