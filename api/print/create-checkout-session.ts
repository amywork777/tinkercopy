import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
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
    console.log('POST /api/print/create-checkout-session called with body:', req.body);
    
    // Get parameters from request body for 3D printing
    const { modelName, color, quantity, finalPrice, stlFileData, stlFileName } = req.body;
    
    if (!modelName || !color || !quantity || !finalPrice) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required checkout information' 
      });
    }

    // Create a product in Stripe for this 3D print
    console.log('Creating Stripe product for 3D print...');
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
    
    console.log('Stripe product created:', product.id);
    
    // Create a price for the product
    console.log('Creating Stripe price...');
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(finalPrice * 100), // Convert dollars to cents
      currency: 'usd',
    });
    
    console.log('Stripe price created:', price.id);
    
    // Determine the host for redirect URLs
    const host = req.headers.origin || '';
    
    // Create a checkout session
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
      // Enable billing address collection
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU'], // Add the countries you ship to
      },
    });

    // Return the session ID and URL
    res.json({ 
      success: true,
      sessionId: session.id,
      url: session.url 
    });
  } catch (error: any) {
    console.error('Error creating 3D print checkout session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create 3D print checkout session',
      error: error.message || 'Unknown error'
    });
  }
} 