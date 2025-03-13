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

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get userId from path parameter
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid userId parameter'
      });
    }
    
    console.log(`Fetching subscription for user: ${userId}`);
    
    // Find the customer in Stripe based on metadata
    const customers = await stripe.customers.list({
      limit: 1,
      email: userId + '@gmail.com' // This is just an example, adjust as needed
    });

    // Check if the customer exists
    if (customers.data.length === 0) {
      // Try to find by metadata instead
      const metadataCustomers = await stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1
      });
      
      if (metadataCustomers.data.length === 0) {
        // No customer found
        return res.json({
          success: true,
          subscription: null,
          message: 'No subscription found for this user'
        });
      }
      
      // Use the customer found by metadata
      const customer = metadataCustomers.data[0];
      
      // Get subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      });
      
      if (subscriptions.data.length === 0) {
        return res.json({
          success: true,
          subscription: null,
          customerId: customer.id,
          message: 'Customer found but no active subscription'
        });
      }
      
      // Return the subscription details
      return res.json({
        success: true,
        subscription: subscriptions.data[0],
        customerId: customer.id
      });
    } else {
      // Customer found by email
      const customer = customers.data[0];
      
      // Get subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      });
      
      if (subscriptions.data.length === 0) {
        return res.json({
          success: true,
          subscription: null,
          customerId: customer.id,
          message: 'Customer found but no active subscription'
        });
      }
      
      // Return the subscription details
      return res.json({
        success: true,
        subscription: subscriptions.data[0],
        customerId: customer.id
      });
    }
  } catch (error: any) {
    console.error('Error fetching user subscription:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscription information'
    });
  }
} 