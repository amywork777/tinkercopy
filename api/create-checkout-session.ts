import { VercelRequest, VercelResponse } from '@vercel/node';
import { Stripe } from 'stripe';

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// Get the correct price ID based on the plan type
function getStripePriceId(planType: string): string {
  if (planType === 'MONTHLY') {
    return process.env.STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ';
  } else if (planType === 'ANNUAL') {
    return process.env.STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68';
  }
  return planType; // If planType is already a price ID, use it directly
}

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
    console.log('Received request to /api/create-checkout-session with body:', req.body);

    // Determine if this is a subscription or 3D print checkout
    const { type } = req.body;

    // Determine the host for redirect URLs
    const host = req.headers.origin || '';

    // SUBSCRIPTION CHECKOUT
    if (type === 'subscription') {
      const { priceId: rawPriceId, userId, email, plan } = req.body;
      
      // Handle different ways of providing the price ID
      let priceId = rawPriceId;
      
      // If no direct priceId was provided, check if plan is specified
      if (!priceId && plan) {
        priceId = getStripePriceId(plan);
      }
      
      if (!priceId) {
        return res.status(400).json({ 
          success: false,
          error: 'Missing priceId parameter',
          message: 'The priceId parameter is required for subscription checkout'
        });
      }
      
      console.log(`Creating subscription checkout with priceId: ${priceId}, userId: ${userId || 'not provided'}`);
      
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
    }
    
    // 3D PRINT CHECKOUT
    if (type === '3d_print' || req.body.is3DPrint) {
      const { 
        modelName, 
        color, 
        quantity, 
        finalPrice, 
        stlFileData, 
        stlFileName
      } = req.body;
      
      console.log('Handling 3D print checkout with:', { 
        modelName, 
        color, 
        quantity, 
        finalPrice,
        hasStlFileData: !!stlFileData,
        stlFileName
      });
      
      if (!modelName || !color || !quantity || !finalPrice) {
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
      return res.json({ 
        success: true,
        sessionId: session.id,
        url: session.url 
      });
    }
    
    // Neither subscription nor 3D print - unsupported checkout type
    return res.status(400).json({ 
      success: false, 
      message: 'Unsupported checkout type. Please specify type as "subscription" or "3d_print".' 
    });
    
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
} 