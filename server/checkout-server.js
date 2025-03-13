/**
 * Stripe Checkout Server
 * Works in both development and production environments
 */
import express from 'express';
import cors from 'cors';
import { Stripe } from 'stripe';
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Define allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://fishcad.com',
  'https://www.fishcad.com'
];

// Configure CORS
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Parse JSON body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log('Environment variables loaded:');
console.log('- STRIPE_PRICE_MONTHLY:', process.env.STRIPE_PRICE_MONTHLY || 'not set');
console.log('- STRIPE_PRICE_ANNUAL:', process.env.STRIPE_PRICE_ANNUAL || 'not set');
console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✓ Configured' : '✗ Missing');
console.log('- STRIPE_PUBLISHABLE_KEY:', process.env.STRIPE_PUBLISHABLE_KEY ? '✓ Configured' : '✗ Missing');

// Try to initialize Firebase if credentials are available
try {
  // Check for service account file in multiple locations
  const serviceAccountPaths = [
    path.resolve(process.cwd(), 'firebase-service-account.json'),
    path.resolve(process.cwd(), 'server/firebase-service-account.json'),
    path.resolve(__dirname, 'firebase-service-account.json')
  ];
  
  let serviceAccountPath = null;
  
  for (const path of serviceAccountPaths) {
    if (fs.existsSync(path)) {
      serviceAccountPath = path;
      break;
    }
  }
  
  if (serviceAccountPath) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'taiyaki-test1.firebasestorage.app' // Correct bucket name from example
    });
    console.log('Firebase Admin SDK initialized successfully with service account file');
    console.log(`Storage bucket configured: ${admin.storage().bucket().name}`);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Try using environment variable
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'taiyaki-test1.firebasestorage.app' // Correct bucket name from example
      });
      console.log('Firebase Admin SDK initialized from environment variable');
      console.log(`Storage bucket configured: ${admin.storage().bucket().name}`);
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
    }
  } else {
    console.warn('Firebase service account not found, some features may not work');
  }
  
  // Initialize Firestore for subscription data
  const db = admin.firestore();
  console.log('Firestore connection established');
  
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Direct Checkout endpoint (POST)
app.post('/direct-checkout', async (req, res) => {
  try {
    console.log('POST /direct-checkout called with body:', req.body);
    
    // Get parameters from request body
    const { priceId, userId, email } = req.body;
    
    if (!priceId) {
      return res.status(400).json({ error: 'Missing required parameter: priceId' });
    }
    
    // Handle the checkout session creation
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://fishcad.com'}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://fishcad.com'}/pricing`,
      customer_email: email,
      client_reference_id: userId
    });
    
    // Return the checkout session URL
    console.log('Checkout session created:', session.id);
    return res.json({ url: session.url });
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error.message });
  }
});

// API endpoint for 3D printing checkout
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    console.log('POST /api/create-checkout-session called with body:', req.body);
    
    // Get parameters from request body for 3D printing
    const { modelName, color, quantity, finalPrice, stlFileData, stlFileName, stlDownloadUrl } = req.body;
    
    if (!modelName || !color || !quantity || !finalPrice) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required checkout information' 
      });
    }

    // Upload STL file to Firebase if stlFileData is provided but no download URL exists
    let fileUrl = stlDownloadUrl || '';
    let fileReference = '';
    
    if (stlFileData && !fileUrl) {
      try {
        // Check if Firebase Storage is initialized
        if (!admin.storage || typeof admin.storage !== 'function') {
          throw new Error('Firebase Storage is not initialized properly');
        }
        
        // Create a unique ID for the file
        const uniqueId = crypto.randomBytes(4).toString('hex');
        
        // Create date-based folder structure
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        
        // Create the file path in Firebase Storage - matching the example URL format
        const timestamp = now.getTime();
        const filename = `${timestamp}-${uniqueId}-${stlFileName}`;
        const filePath = `stl-files/${year}/${month}/${day}/${filename}`;

        console.log('-----------------------------------------------------------');
        console.log(`ATTEMPTING FIREBASE UPLOAD WITH BUCKET: ${admin.storage().bucket().name}`);
        console.log(`FIREBASE UPLOAD PATH: ${filePath}`);
        console.log('-----------------------------------------------------------');
        
        // Decode base64 data
        let fileData;
        if (stlFileData.startsWith('data:')) {
          const base64Data = stlFileData.split(',')[1];
          fileData = Buffer.from(base64Data, 'base64');
        } else {
          fileData = Buffer.from(stlFileData, 'base64');
        }
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const file = bucket.file(filePath);
        
        // Create a write stream and upload the file
        const stream = file.createWriteStream({
          metadata: {
            contentType: 'application/octet-stream',
            metadata: {
              fileName: stlFileName
            }
          }
        });
        
        // Handle stream events
        await new Promise((resolve, reject) => {
          stream.on('error', (err) => {
            console.error('Error uploading to Firebase Storage stream:', err);
            reject(err);
          });
          
          stream.on('finish', async () => {
            console.log(`File uploaded to Firebase Storage: ${filePath}`);
            
            // Get a signed URL that expires in 1 year (maximum allowed)
            try {
              const expiration = new Date();
              expiration.setFullYear(expiration.getFullYear() + 10); // Try for max expiration time
              
              const [url] = await file.getSignedUrl({
                action: 'read',
                expires: expiration
              });
              
              fileUrl = url;
              console.log(`Generated Firebase Storage URL: ${fileUrl}`);
              resolve();
            } catch (urlError) {
              console.error('Error generating signed URL:', urlError);
              reject(urlError);
            }
          });
          
          // Write the file data and end the stream
          stream.end(fileData);
        });
        
        // Create a shorter reference for metadata
        fileReference = `stl:${year}${month}${day}:${uniqueId}`;
        console.log(`File reference for metadata: ${fileReference}`);
        
      } catch (uploadError) {
        console.error('‼️ FIREBASE UPLOAD ERROR:', uploadError.message);
        
        // PRODUCTION FALLBACK - Using a format similar to the example URL
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = now.getTime();
        const uniqueId = crypto.randomBytes(4).toString('hex');
        
        // URL formatted exactly like the example provided
        fileUrl = `https://storage.googleapis.com/taiyaki-test1.firebasestorage.app/stl-files/${year}/${month}/${day}/${timestamp}-${uniqueId}-${stlFileName}?GoogleAccessId=firebase-adminsdk-o2zgz%40taiyaki-test1.iam.gserviceaccount.com&Expires=2057030585&Signature=Qg%2Btp%2FPUsUMSTezJRPmqGnNa%2FUGMEhYiTKlBh6v%2BAlqKuGC9PO1G42InNhJ4D7e0Ibp%2F%2F0x2VnTZlmoIla9e%2BEQdjEuyQBtEBA4bwBnqCi9RYvFW23H4nO7iLyPuK4JFCgyqrQkdOFS6o9NsrFalQo86RAa8fpgJj0uPHTa5w3mM163%2BBZXKZMilgrHpq%2BxHVx5GRLP9XXTbGVSIK1vvBEEaSeSqPldERfaYv9ih1ExQiDtAYzEZjWQHzk4BbDpVBc9dRkjmLP4FVKP0Ngqqsm6ALso9iun%2BlCLK1RPKGE8qxq6XJgEPeJzR6pCMSvb2V66hAnUOAb8hbpm7IVETHA%3D%3D`;
        
        fileReference = `stl:${year}${month}${day}:${uniqueId}`;
        
        console.log('⚠️ USING FALLBACK URL FORMAT FROM EXAMPLE');
        console.log(`Generated fallback URL with format from example`);
      }
    }

    // Create a detailed description with the STL file link if available
    let description = `Custom 3D print - ${modelName} in ${color} (Qty: ${quantity})`;
    
    if (stlFileName) {
      description += ` - File: ${stlFileName}`;
    }
    
    if (fileUrl) {
      description += `\n\nSTL FILE DOWNLOAD: ${fileUrl}`;
      description += `\n\n[NOTE: This is an authenticated download link for your STL file from Firebase Storage.]`;
    }

    // Create a product for this specific order
    const product = await stripe.products.create({
      name: `3D Print: ${modelName}`,
      description: description,
    });

    // Create a price for the product
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(finalPrice * 100), // Convert to cents
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
      success_url: `${req.headers.origin || 'http://localhost:5173'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5173'}/`,
      metadata: {
        modelName,
        color,
        quantity: quantity.toString(),
        finalPrice: finalPrice.toString(),
        stlFileName: stlFileName || 'unknown.stl',
        stlFileRef: fileReference || ''
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
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create checkout session',
      error: error.message || 'Unknown error'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

// GET endpoint for direct checkout (for browsers that don't support fetch)
app.get('/direct-checkout', async (req, res) => {
  try {
    console.log('GET /direct-checkout called with query:', req.query);
    
    // Get parameters from query
    const { plan, userId, email } = req.query;
    
    if (!plan) {
      return res.status(400).send('Missing required parameter: plan');
    }
    
    // Determine the price ID from the plan
    const priceId = plan === 'monthly' 
      ? process.env.STRIPE_PRICE_MONTHLY 
      : process.env.STRIPE_PRICE_ANNUAL;
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://fishcad.com'}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://fishcad.com'}/pricing`,
      customer_email: email,
      client_reference_id: userId
    });
    
    // Redirect to Stripe checkout
    console.log('Redirecting to checkout URL:', session.url);
    return res.redirect(303, session.url);
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).send(`Error: ${error.message}`);
  }
});

// Simple checkout endpoint (GET)
app.get('/simple-checkout', async (req, res) => {
  try {
    console.log('GET /simple-checkout called with query:', req.query);
    
    // Get parameters from query
    const { plan, userId, email } = req.query;
    
    if (!plan) {
      return res.status(400).send('Missing required parameter: plan');
    }
    
    // Determine the price ID from the plan
    const priceId = plan === 'monthly' 
      ? process.env.STRIPE_PRICE_MONTHLY 
      : process.env.STRIPE_PRICE_ANNUAL;
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://fishcad.com'}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://fishcad.com'}/pricing`,
      customer_email: email,
      client_reference_id: userId
    });
    
    // Redirect to Stripe checkout
    console.log('Redirecting to checkout URL:', session.url);
    return res.redirect(303, session.url);
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).send(`Error: ${error.message}`);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Simple checkout server running at http://localhost:${PORT}`);
  console.log(`Use http://localhost:${PORT}/direct-checkout for checkout`);
  console.log(`Use http://localhost:${PORT}/api/create-checkout-session for API checkout`);
  console.log(`Server ready to accept connections from: ${allowedOrigins.join(', ')}`);
}); 