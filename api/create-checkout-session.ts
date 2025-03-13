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
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
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
    console.log('Received request to /api/create-checkout-session with body:', req.body);
    
    // Check if this is a 3D print checkout or a subscription checkout
    if (req.body.productType === '3d_print' || req.body.is3DPrint || req.body.type === '3d_print') {
      console.log('Handling 3D print checkout');
      
      // Get the required fields from the request
      const { 
        modelName, 
        color, 
        quantity, 
        finalPrice, 
        stlFileData, 
        stlFileName 
      } = req.body;
      
      console.log('Received 3D print checkout request with:', { 
        modelName, 
        color, 
        quantity, 
        finalPrice, 
        hasStlFileData: !!stlFileData,
        stlFileName
      });
      
      if (!modelName || !color || !quantity || !finalPrice) {
        console.log('Missing required checkout information');
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required checkout information' 
        });
      }

      // Create a product in Stripe for this 3D print
      const product = await stripe.products.create({
        name: `3D Print: ${modelName}`,
        description: `3D Print in ${color} (Qty: ${quantity})`,
        metadata: {
          modelName,
          color,
          quantity: quantity.toString(),
          printType: '3d_print'
        }
      });
      
      // Create a price for the product
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(finalPrice * 100), // Convert dollars to cents
        currency: 'usd',
      });
      
      // Determine the host for redirect URLs
      const host = req.headers.origin || '';
      
      // Create the checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: price.id,
            quantity: 1, // We already factored quantity into the price
          },
        ],
        mode: 'payment',
        success_url: `${host}/checkout-confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${host}/`,
        metadata: {
          modelName,
          color,
          quantity: quantity.toString(),
          finalPrice: finalPrice.toString(),
          stlFileName: stlFileName || 'unknown.stl'
        },
        billing_address_collection: 'required',
        shipping_address_collection: {
          allowed_countries: ['US', 'CA', 'GB', 'AU'],
        },
      });
      
      // Return the session URL
      return res.json({ 
        success: true,
        sessionId: session.id,
        url: session.url 
      });
    } else {
      // This is a subscription checkout
      console.log('Handling subscription checkout');
      
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
      });
      
      console.log('Created checkout session:', session.id);
      
      return res.json({
        success: true,
        url: session.url,
        sessionId: session.id
      });
    }
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
} 