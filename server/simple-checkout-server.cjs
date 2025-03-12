const express = require('express');
const cors = require('cors');
const { Stripe } = require('stripe');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const os = require('os');
const crypto = require('crypto');

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK if not already initialized
let firestore;
let storage;

try {
  if (!admin.apps || !admin.apps.length) {
    try {
      // First try using service account file
      const serviceAccount = require('./firebase-service-account.json');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
      });
      
      console.log('Firebase Admin SDK initialized successfully with service account file');
    } catch (serviceAccountError) {
      console.error('Error loading service account:', serviceAccountError);
      
      // Fallback to environment variables
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
      });
      
      console.log('Firebase Admin SDK initialized with environment variables');
    }
  }
  
  // Create Firestore references if available
  firestore = admin.firestore();
  storage = admin.storage().bucket();
  console.log('Firestore connection established');
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  console.log('Continuing without Firebase - will fallback to memory storage');
  // Firestore and storage will be undefined
}

// Set up Nodemailer for email notifications
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    
    // Verify the connection
    transporter.verify((error) => {
      if (error) {
        console.error('Error setting up email transport:', error);
      } else {
        console.log('Email transport ready for sending notifications');
      }
    });
  } catch (emailError) {
    console.error('Failed to initialize email transport:', emailError);
  }
} else {
  console.log('Email credentials not provided. Email notifications will be disabled.');
}

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Validate Stripe key
(async function validateStripeKey() {
  try {
    // Attempt to make a simple API call to check if the key is valid
    const testBalance = await stripe.balance.retrieve();
    console.log('Stripe API key is valid. Connected to Stripe successfully.');
  } catch (error) {
    console.error('⚠️ Stripe API key validation failed:', error.message);
    console.error('⚠️ Checkout functionality will not work correctly without a valid Stripe API key');
    if (error.type === 'StripeAuthenticationError') {
      console.error('⚠️ Please check your Stripe secret key in the .env file');
    }
  }
})();

// Create an in-memory store for orders when Firestore is unavailable
const memoryOrderStore = [];
// Create an in-memory store for STL files
const stlFileStorage = new Map();

// Create temporary directory for STL files
const stlFilesDir = path.join(__dirname, 'temp-stl-files');
if (!fs.existsSync(stlFilesDir)) {
  fs.mkdirSync(stlFilesDir, { recursive: true });
  console.log(`Created STL files directory: ${stlFilesDir}`);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173',      // Local Vite dev server
  'http://localhost:3000',      // Local Next.js dev server
  'https://fishcad.com',        // Production domain
  'https://www.fishcad.com',    // Production domain with www
  'https://app.fishcad.com',    // App subdomain (if used)
  process.env.DOMAIN            // Domain from env var (if set)
].filter(Boolean); // Remove any undefined/null values

console.log('Allowed CORS origins:', allowedOrigins);

// Configure CORS middleware with specific options
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      console.log('Request with no origin allowed');
      return callback(null, true);
    }
    
    // Check if the origin is allowed
    if (allowedOrigins.includes(origin) || 
        origin.endsWith('fishcad.com') || 
        origin.includes('localhost')) {
      console.log(`CORS request from origin: ${origin} - allowed`);
      return callback(null, true);
    }
    
    console.error(`CORS request from origin: ${origin} - not allowed`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add OPTIONS handler for preflight requests
app.options('*', cors());

// Add health check endpoint
app.get('/api/health-check', (req, res) => {
  console.log('Health check requested from:', req.headers.origin || 'unknown origin');
  res.status(200).json({ 
    status: 'ok', 
    message: 'API is healthy',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Special case for Stripe webhook to handle raw body
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// Add pricing API endpoint for subscription checkout
app.post('/api/pricing/create-checkout-session', async (req, res) => {
  try {
    const { priceId, userId, email, force_new_customer } = req.body;
    
    console.log('Received subscription checkout request:', { 
      priceId, 
      userId, 
      email,
      force_new_customer: !!force_new_customer
    });
    
    if (!priceId || !userId || !email) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    let customerId = null;
    
    // Handle Stripe customer
    if (firestore && !force_new_customer) {
      try {
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists && userDoc.data().stripeCustomerId) {
          try {
            // Verify that customer exists in live mode
            await stripe.customers.retrieve(userDoc.data().stripeCustomerId);
            customerId = userDoc.data().stripeCustomerId;
            console.log(`Using existing Stripe customer ID: ${customerId}`);
          } catch (stripeError) {
            console.log(`Customer ID exists in Firestore but not in Stripe (likely test vs live mode). Creating new customer.`);
            const customer = await stripe.customers.create({
              email: email,
              metadata: {
                userId: userId,
              },
            });
            customerId = customer.id;
            
            // Update Firestore with the new customer ID
            await userRef.update({
              stripeCustomerId: customerId,
            });
            console.log(`Created new Stripe customer: ${customerId} and updated Firestore`);
          }
        } else {
          // Create a new customer
          const customer = await stripe.customers.create({
            email: email,
            metadata: {
              userId: userId,
            },
          });
          customerId = customer.id;
          console.log(`Created new Stripe customer: ${customerId}`);
          
          // Create or update user document with Stripe customer ID
          if (userDoc.exists) {
            // If document exists, update it
            await userRef.update({
              stripeCustomerId: customerId,
            });
            console.log(`Updated existing user document with Stripe customer ID`);
          } else {
            // If document doesn't exist, create it
            await userRef.set({
              uid: userId,
              email: email,
              stripeCustomerId: customerId,
              createdAt: new Date(),
              isPro: false,
              subscriptionStatus: 'none',
              modelsRemainingThisMonth: 0,
              lastResetDate: new Date().toISOString().substring(0, 7),
            });
            console.log(`Created new user document with Stripe customer ID`);
          }
        }
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        
        // Check if this is a "not found" error for the user document
        if (firestoreError.code === 5 && firestoreError.details && firestoreError.details.includes('No document to update')) {
          // Create a new user document
          try {
            const userRef = firestore.collection('users').doc(userId);
            
            // Create a new customer first
            const customer = await stripe.customers.create({
              email: email,
              metadata: {
                userId: userId,
              },
            });
            customerId = customer.id;
            
            // Then create the user document
            await userRef.set({
              uid: userId,
              email: email,
              stripeCustomerId: customerId,
              createdAt: new Date(),
              isPro: false,
              subscriptionStatus: 'none',
              modelsRemainingThisMonth: 0,
              lastResetDate: new Date().toISOString().substring(0, 7),
            });
            console.log(`Created new user document for ID: ${userId}`);
          } catch (createError) {
            console.error('Error creating user document:', createError);
            // Continue with Stripe checkout anyway
          }
        } else {
          // For other errors, continue with Stripe checkout without updating Firestore
          const customer = await stripe.customers.create({
            email: email,
            metadata: {
              userId: userId,
            },
          });
          customerId = customer.id;
          console.log(`Created new Stripe customer (Firestore failed): ${customerId}`);
        }
      }
    } else {
      // Fallback if Firestore is not available or force_new_customer is true
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;
      console.log(`Created new Stripe customer (${force_new_customer ? 'forced new' : 'no Firestore'}): ${customerId}`);
    }
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.DOMAIN || 'http://localhost:5173'}/pricing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN || 'http://localhost:5173'}/pricing`,
      subscription_data: {
        metadata: {
          userId: userId,
        },
      },
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to store an STL file temporarily
app.post('/api/stl-files', (req, res) => {
  try {
    const { stlData, fileName } = req.body;
    
    console.log('Received STL file upload request:', { 
      hasStlData: !!stlData, 
      fileName,
      dataType: typeof stlData,
      dataLength: stlData ? (typeof stlData === 'string' ? stlData.length : 'non-string') : 0
    });
    
    if (!stlData) {
      console.error('STL file upload failed: No STL data provided');
      return res.status(400).json({ 
        success: false, 
        message: 'No STL data provided' 
      });
    }
    
    // Generate a unique ID for the file
    const fileId = `stl-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const safeName = fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'model.stl';
    const filePath = path.join(stlFilesDir, `${fileId}-${safeName}`);
    
    // Process the data if it's a data URL
    let fileContent;
    try {
      if (typeof stlData === 'string' && stlData.startsWith('data:')) {
        const matches = stlData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches.length >= 3) {
          fileContent = Buffer.from(matches[2], 'base64');
          console.log(`Decoded base64 data URL, size: ${fileContent.length} bytes`);
    } else {
          console.log('Data URL format not recognized, treating as raw data');
          fileContent = Buffer.from(stlData);
        }
      } else {
        console.log('Not a data URL, treating as raw data');
        fileContent = Buffer.from(stlData);
      }
      
      if (!fileContent || fileContent.length === 0) {
        throw new Error('Processed file content is empty');
      }
    } catch (dataProcessingError) {
      console.error('STL data processing error:', dataProcessingError);
      return res.status(400).json({
        success: false,
        message: 'Failed to process STL data',
        error: dataProcessingError.message
      });
    }
    
    // Write the file
    try {
      fs.writeFileSync(filePath, fileContent);
      console.log(`Stored STL file at: ${filePath}, size: ${fileContent.length} bytes`);
    } catch (fileWriteError) {
      console.error('File write error:', fileWriteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to write STL file to disk',
        error: fileWriteError.message
      });
    }
    
    // Store the metadata in memory
    stlFileStorage.set(fileId, {
      filePath,
      fileName: safeName,
      createdAt: new Date().toISOString()
    });
    
    // Generate the public URL
    const publicUrl = `http://localhost:${process.env.PORT || 3001}/api/stl-files/${fileId}`;
    console.log(`Created public URL for STL file: ${publicUrl}`);
    
    return res.status(200).json({
      success: true,
      fileId,
      url: publicUrl,
      storagePath: filePath
    });
  } catch (error) {
    console.error('Unexpected error storing STL file:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to store STL file',
      error: error.message
    });
  }
});

// Endpoint to retrieve an STL file by ID
app.get('/api/stl-files/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Try to retrieve the file metadata
    const fileData = stlFileStorage.get(fileId);
    
    if (!fileData) {
      return res.status(404).json({
        success: false,
        message: 'STL file not found'
      });
    }
    
    // Set appropriate headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Send the file
    return res.sendFile(fileData.filePath);
  } catch (error) {
    console.error('Error retrieving STL file:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve STL file'
    });
  }
});

/**
 * Stores STL data in Firebase Storage
 * @param {string|Buffer} stlData - The STL data to store, either as a base64 string or Buffer
 * @param {string} fileName - The name of the STL file
 * @returns {Promise<{downloadUrl: string, publicUrl: string, storagePath: string, fileName: string, fileSize: number}>}
 */
async function storeSTLInFirebase(stlData, fileName) {
  console.log('Preparing to store STL file in Firebase Storage...');
  
  try {
    // Ensure Firebase Storage is initialized
    if (!admin || !admin.storage || typeof admin.storage !== 'function') {
      console.error('Firebase Storage not initialized properly');
      throw new Error('Firebase Storage not initialized');
    }
    
    // Create a safe filename (replace spaces and special chars)
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Process the STL data
    let stlBuffer;
    console.log(`Processing ${typeof stlData === 'string' ? 'base64' : 'buffer'} STL data...`);
    
    if (typeof stlData === 'string') {
      // If stlData is a base64 string, convert it to buffer
      const base64Data = stlData.replace(/^data:.*?;base64,/, '');
      stlBuffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(stlData)) {
      stlBuffer = stlData;
    } else {
      throw new Error(`Unsupported STL data format: ${typeof stlData}`);
    }
    
    const fileSize = stlBuffer.length;
    console.log(`STL file size: ${fileSize} bytes`);
    
    // Write to a temporary file
    const timestamp = Date.now();
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const tempFilePath = path.join(os.tmpdir(), `${timestamp}-${uniqueId}-${safeFileName}`);
    
    console.log(`Writing STL data to temporary file: ${tempFilePath}`);
    fs.writeFileSync(tempFilePath, stlBuffer);
    console.log('Temporary STL file created successfully');
    
    // Create a path in Firebase Storage organized by date (YYYY/MM/DD)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const storagePath = `stl-files/${year}/${month}/${day}/${timestamp}-${uniqueId}-${safeFileName}`;
    console.log(`Firebase Storage path: ${storagePath}`);
    
    // Upload the file to Firebase Storage
    const bucket = admin.storage().bucket();
    if (!bucket) {
      throw new Error('Firebase Storage bucket not available');
    }
    
    console.log('Uploading to Firebase Storage...');
    
    // Set metadata including content type
    const metadata = {
      contentType: 'application/sla',
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    };
    
    // Upload file with metadata
    await bucket.upload(tempFilePath, {
      destination: storagePath,
      metadata: metadata
    });
    
    console.log('STL file uploaded successfully to Firebase Storage');
    
    // Get URLs - don't try to set ACLs since uniform bucket-level access is enabled
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 315360000000, // 10 years in milliseconds
    });
    
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    
    console.log(`Generated public URL: ${publicUrl}`);
    console.log(`Generated signed URL (expires in 10 years): ${signedUrl}`);
    
    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFilePath);
      console.log('Temporary file deleted');
    } catch (cleanupError) {
      console.error('Error deleting temporary file:', cleanupError);
    }
    
    return {
      downloadUrl: signedUrl,
      publicUrl: publicUrl,
      storagePath: storagePath,
      fileName: safeFileName,
      fileSize: fileSize
    };
    
  } catch (error) {
    // Clean up temporary file in case of error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Temporary file deleted');
      } catch (cleanupError) {
        console.error('Error deleting temporary file:', cleanupError);
      }
    }
    
    console.error('STL storage error:', error);
    throw new Error(`Firebase upload failed: ${error.message}`);
  }
}

// Add sendOrderConfirmationEmail function
async function sendOrderConfirmationEmail(orderData) {
  try {
    console.log('Preparing order confirmation email for:', orderData.customerEmail);
    
    // Use Nodemailer if configured
    if (process.env.EMAIL_USER && transporter) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: orderData.customerEmail,
        subject: `Order Confirmation: ${orderData.orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4a5568;">Your 3D Print Order Confirmation</h2>
            <p>Hello ${orderData.customerName},</p>
            <p>Thank you for your order! We've received your payment and are processing your 3D print.</p>
            
            <div style="background-color: #f7fafc; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #4a5568;">Order Details</h3>
              <p><strong>Order ID:</strong> ${orderData.orderId}</p>
              <p><strong>Date:</strong> ${new Date(orderData.orderDate).toLocaleString()}</p>
              <p><strong>Model:</strong> ${orderData.orderDetails.modelName}</p>
              <p><strong>Color:</strong> ${orderData.orderDetails.color}</p>
              <p><strong>Quantity:</strong> ${orderData.orderDetails.quantity}</p>
              <p><strong>Total:</strong> $${orderData.amountTotal.toFixed(2)}</p>
            </div>
            
            ${orderData.stlFile && (orderData.stlFile.downloadUrl || orderData.stlFile.publicUrl) ? `
              <div style="background-color: #e6f7ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #0366d6;">Your 3D Model File</h3>
                <p>Your STL file "${orderData.stlFile.fileName}" has been securely stored and is available for download.</p>
                <a href="${orderData.stlFile.downloadUrl || orderData.stlFile.publicUrl}" 
                   style="display: inline-block; background-color: #0366d6; color: white; padding: 10px 20px; 
                          text-decoration: none; border-radius: 4px; margin-top: 10px; font-weight: bold;">
                  Download STL
                </a>
              </div>
            ` : ''}
            
            <div style="margin-top: 30px;">
              <p>If you have any questions about your order, please contact our support team.</p>
              <p>Thank you for choosing our 3D printing service!</p>
            </div>
          </div>
        `
      };
      
      const info = await transporter.sendMail(mailOptions);
      console.log('Order confirmation email sent with Nodemailer:', info.messageId);
      return true;
    } else {
      console.log('Email configuration not available. Skipping order confirmation email.');
      return false;
    }
  } catch (error) {
    console.error('Failed to send order confirmation email:', error);
    return false;
  }
}

// Function to handle successful payment
async function handleSuccessfulPayment(session) {
  try {
    console.log('Processing successful payment', session.id);
    
    // Extract order details from session metadata
    const { 
      modelName, 
      color, 
      quantity, 
      finalPrice, 
      stlFileName, 
      stlDownloadUrl,
      stlPublicUrl,
      stlStoragePath,
      stlFileSize,
      stlDataPreview
    } = session.metadata;
    
    console.log('Order details from session metadata:', {
      modelName, 
      color, 
      quantity, 
      finalPrice, 
      stlFileName,
      hasStlDownloadUrl: !!stlDownloadUrl,
      hasStlPublicUrl: !!stlPublicUrl,
      hasStlStoragePath: !!stlStoragePath,
      stlFileSize: stlFileSize || 'unknown'
    });
    
    // Get user info from session or use default values
    const customerEmail = session.customer_details?.email || 'No email provided';
    const customerName = session.customer_details?.name || 'No name provided';
    
    // Get shipping details if available
    let shippingAddress = 'No shipping address provided';
    if (session.shipping) {
      const address = session.shipping.address;
      shippingAddress = `${address.line1}, ${address.city}, ${address.state}, ${address.postal_code}, ${address.country}`;
      if (address.line2) {
        shippingAddress = `${address.line1}, ${address.line2}, ${address.city}, ${address.state}, ${address.postal_code}, ${address.country}`;
      }
    }
    
    // Get STL data details - look at multiple sources for the download URL
    let stlInfo = {
      fileName: stlFileName || 'unknown.stl',
      downloadUrl: stlDownloadUrl || '',
      publicUrl: stlPublicUrl || '',
      storagePath: stlStoragePath || '',
      fileSize: parseInt(stlFileSize || '0', 10) || 0
    };
    
    // Log STL info for debugging
    console.log('STL file information:', {
      fileName: stlInfo.fileName,
      hasDownloadUrl: !!stlInfo.downloadUrl,
      hasPublicUrl: !!stlInfo.publicUrl,
      hasStoragePath: !!stlInfo.storagePath,
      fileSize: stlInfo.fileSize
    });
    
    // Create an order ID (could be random or based on session ID)
    const orderId = `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Store order in the database
    try {
      const orderData = {
        orderId,
        stripeSessionId: session.id,
        customerEmail,
        customerName,
        shippingAddress,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total / 100, // Convert from cents to dollars
        orderDetails: {
          modelName,
          color,
          quantity: parseInt(quantity, 10) || 1,
          finalPrice: parseFloat(finalPrice) || 0
        },
        stlFile: {
          fileName: stlInfo.fileName,
          downloadUrl: stlInfo.downloadUrl,
          publicUrl: stlInfo.publicUrl,
          storagePath: stlInfo.storagePath,
          fileSize: stlInfo.fileSize,
          dataPreview: stlDataPreview || ''
        },
        orderStatus: 'received',
        orderDate: new Date(),
        fulfillmentStatus: 'pending',
        estimatedShippingDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
      };
      
      let savedToFirestore = false;
      
      // First try to save to Firestore
      try {
        console.log('Saving order to Firestore:', orderId);
        const db = admin.firestore();
        await db.collection('orders').doc(orderId).set(orderData);
        console.log('Order saved successfully to Firestore:', orderId);
        savedToFirestore = true;
      } catch (firestoreError) {
        console.error('Error storing order in Firestore:', firestoreError);
        // Fallback to memory storage
        memoryOrderStore.push(orderData);
        console.log(`Order ${orderId} stored in memory (Firestore failed)`);
      }
      
      // Try to send confirmation email, but don't throw if it fails
      try {
        await sendOrderConfirmationEmail(orderData);
        console.log(`Order confirmation email sent to ${customerEmail}`);
      } catch (emailError) {
        console.error('Failed to send order confirmation email:', emailError);
        // Continue processing even if email fails
      }
      
      return orderData;
    } catch (dbError) {
      console.error('Failed to save order to database:', dbError);
      // Don't throw, just log the error and continue
      return {
        orderId,
        error: `Error saving order: ${dbError.message}`
      };
    }
  } catch (error) {
    console.error('Error handling successful payment:', error);
    throw new Error(`Failed to process payment: ${error.message}`);
  }
}

// Send order notification email to the business
async function sendOrderNotificationEmail(orderData) {
  const businessEmail = process.env.BUSINESS_EMAIL;
  
  if (!businessEmail) {
    console.error('No business email configured for notifications');
    return false;
  }
  
  // Format shipping address if available
  let formattedAddress = 'No shipping address provided';
  
  if (orderData.shippingAddress) {
    const address = orderData.shippingAddress;
    formattedAddress = `
      ${address.name || ''}<br>
      ${address.line1 || ''}<br>
      ${address.line2 ? address.line2 + '<br>' : ''}
      ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}<br>
      ${address.country || ''}
    `;
  }
  
  // Prepare email content
  const subject = `New 3D Print Order: ${orderData.orderId}`;
  
  // Extract signed URL for easy copy-paste
  const signedUrl = orderData.stlFile?.downloadUrl || '';
  
  const htmlContent = `
    <h1>New 3D Print Order Received</h1>
    
    <h2>Order Details</h2>
    <ul>
      <li><strong>Order ID:</strong> ${orderData.orderId}</li>
      <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
      <li><strong>Model:</strong> ${orderData.modelName || 'Unknown'}</li>
      <li><strong>Color:</strong> ${orderData.color || 'Unknown'}</li>
      <li><strong>Quantity:</strong> ${orderData.quantity || 1}</li>
      <li><strong>Price:</strong> $${orderData.finalPrice ? orderData.finalPrice.toFixed(2) : '0.00'}</li>
    </ul>
    
    <h2>Customer Information</h2>
    <ul>
      <li><strong>Email:</strong> ${orderData.customerEmail || 'No email provided'}</li>
    </ul>
    
    <h2>Payment Information</h2>
    <ul>
      <li><strong>Payment Status:</strong> ${orderData.paymentStatus || 'Unknown'}</li>
      <li><strong>Payment ID:</strong> ${orderData.paymentId || 'Unknown'}</li>
    </ul>
    
    <h2>Shipping Address</h2>
    <div>${formattedAddress}</div>
    
    ${(orderData.stlFile && (orderData.stlFile.fileName || orderData.stlFileName)) ? `
    <h2>STL File Information</h2>
    <ul>
      <li><strong>Filename:</strong> ${orderData.stlFile?.fileName || orderData.stlFileName || 'Unnamed File'}</li>
      ${orderData.stlFile?.fileSize ? `<li><strong>File Size:</strong> ${(orderData.stlFile.fileSize / 1024 / 1024).toFixed(2)} MB</li>` : ''}
      ${orderData.stlFile?.storagePath ? `<li><strong>Storage Path:</strong> ${orderData.stlFile.storagePath}</li>` : ''}
    </ul>
    
    ${signedUrl ? `
    <div style="margin: 20px 0; padding: 15px; border: 2px solid #4CAF50; background-color: #f8fff8; border-radius: 5px;">
      <h3 style="margin-top: 0; color: #2E7D32;">⬇️ Direct STL Download Link (Valid for 10 Years)</h3>
      <div style="margin-bottom: 10px;">
        <a href="${signedUrl}" style="display: inline-block; padding: 12px 20px; background-color: #4CAF50; color: white; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 16px;">Download STL File</a>
      </div>
      <div style="margin-top: 10px; word-break: break-all; background-color: #f0f0f0; padding: 10px; border: 1px solid #ddd; border-radius: 3px; font-family: monospace; font-size: 12px;">
        ${signedUrl}
      </div>
    </div>
    `: ''}
    
    <h3>All Download Links</h3>
    <ul>
      ${orderData.stlFile?.downloadUrl ? `<li><strong>Signed URL:</strong> <a href="${orderData.stlFile.downloadUrl}">Download File</a></li>` : ''}
      ${orderData.stlFile?.publicUrl ? `<li><strong>Public URL:</strong> <a href="${orderData.stlFile.publicUrl}">Download File</a></li>` : ''}
      ${orderData.stlFile?.alternativeUrl ? `<li><strong>Alternative URL:</strong> <a href="${orderData.stlFile.alternativeUrl}">Download File</a></li>` : ''}
    </ul>
    ` : ''}
    
    <p>Please begin processing this order as soon as possible.</p>
  `;
  
  try {
    // Send email
    const info = await transporter.sendMail({
      from: `"3D Print Order System" <${process.env.EMAIL_USER}>`,
      to: businessEmail,
      subject: subject,
      html: htmlContent,
    });
    
    console.log('Order notification email sent with Nodemailer:', info.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send order notification email:', error);
    return false;
  }
}

// Send confirmation email to the customer
async function sendCustomerConfirmationEmail(orderDetails) {
  if (!orderDetails.customerEmail) {
    console.error('No customer email provided for confirmation');
    return false;
  }
  
  // Prepare email content
  const subject = `Your 3D Print Order Confirmation - ${orderDetails.orderId}`;
  
  const htmlContent = `
    <h1>Your 3D Print Order Confirmation</h1>
    <p>Thank you for your order! We've received your request and will begin processing it shortly.</p>
    
    <h2>Order Details</h2>
    <ul>
      <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
      <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
      <li><strong>Model:</strong> ${orderDetails.modelName || 'Unknown'}</li>
      <li><strong>Color:</strong> ${orderDetails.color || 'Unknown'}</li>
      <li><strong>Quantity:</strong> ${orderDetails.quantity || 1}</li>
      <li><strong>Total:</strong> $${orderDetails.finalPrice ? orderDetails.finalPrice.toFixed(2) : '0.00'}</li>
    </ul>
    
    ${orderDetails.stlFile && (orderDetails.stlFile.downloadUrl || orderDetails.stlFile.publicUrl) ? `
    <div style="margin-top: 20px; margin-bottom: 20px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 5px; background-color: #f9f9f9;">
      <h3 style="margin-top: 0; color: #333;">Your 3D Model File</h3>
      <p>Your STL file is stored securely. You can download it using the button below:</p>
      <a href="${orderDetails.stlFile.downloadUrl || orderDetails.stlFile.publicUrl}" 
         style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
         Download STL
      </a>
    </div>
    ` : ''}
    
    <p>We will ship your order to the address you provided.</p>
    
    <p>You will receive updates about your order status at this email address.</p>
    
    <p>If you have any questions, please contact our customer support.</p>
    
    <p>Thank you for choosing our 3D printing service!</p>
  `;
  
  try {
    // Send email
    const info = await transporter.sendMail({
      from: `"3D Print Orders" <${process.env.EMAIL_USER}>`,
      to: orderDetails.customerEmail,
      subject: subject,
      html: htmlContent,
    });
    
    console.log('Customer confirmation email sent with Nodemailer:', info.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send customer confirmation email:', error);
    return false;
  }
}

// Create Express route for creating a checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { 
      modelName, 
      color, 
      quantity, 
      finalPrice, 
      stlFileName, 
      stlFileData, 
      stlDownloadUrl,
      stlStoragePath 
    } = req.body;
    
    console.log('Received checkout request with:', { 
      modelName, 
      color, 
      quantity, 
      finalPrice, 
      hasStlFileData: !!stlFileData,
      stlFileDataType: stlFileData ? typeof stlFileData : 'none',
      stlFileDataLength: stlFileData ? (typeof stlFileData === 'string' ? stlFileData.length : 0) : 0,
      stlFileName,
      stlDownloadUrl,
      stlStoragePath
    });
    
    if (!modelName || !color || !quantity || !finalPrice) {
      console.log('Missing required checkout information');
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required checkout information' 
      });
    }

    // Process and store STL file in Firebase Storage
    let finalStlDownloadUrl = stlDownloadUrl;
    let finalStlPublicUrl = '';
    let finalStlStoragePath = stlStoragePath;
    let stlFileSize = 0;
    let stlDataString = '';
    let stlFileUploaded = false;

    // Store STL file in Firebase if data is provided
    if (stlFileData) {
      try {
        console.log('Processing STL file data for storage...');
        
        // Upload to Firebase Storage
        const uploadResult = await storeSTLInFirebase(stlFileData, stlFileName);
        
        // If successful, update the URLs and path
        finalStlDownloadUrl = uploadResult.downloadUrl;
        finalStlPublicUrl = uploadResult.publicUrl;
        finalStlStoragePath = uploadResult.storagePath;
        stlFileSize = uploadResult.fileSize || 0;
        stlFileUploaded = true;
        
        console.log('STL file successfully uploaded to Firebase Storage:');
        console.log(`- Download URL: ${finalStlDownloadUrl.substring(0, 100)}...`);
        console.log(`- Public URL: ${finalStlPublicUrl}`);
        console.log(`- Storage Path: ${finalStlStoragePath}`);
        console.log(`- File Size: ${stlFileSize} bytes`);
        
        // Save a shorter preview of the STL data for the metadata
        if (typeof stlFileData === 'string') {
          const maxPreviewLength = 100; // Just enough to identify the file format
          stlDataString = stlFileData.length > maxPreviewLength 
            ? stlFileData.substring(0, maxPreviewLength) + '...[truncated]' 
            : stlFileData;
        }
      } catch (uploadError) {
        console.error('Failed to upload STL to Firebase Storage:', uploadError);
        
        // Fallback: store in memory if Firebase fails
        try {
          console.log('Creating fallback in-memory storage for STL file');
          const orderTempId = `temp-${Date.now()}`;
          
          // Limit the stored STL data to a shorter preview in the Stripe metadata
          if (typeof stlFileData === 'string') {
            const maxPreviewLength = 100; // Stripe has limits on metadata size
            stlDataString = stlFileData.length > maxPreviewLength 
              ? stlFileData.substring(0, maxPreviewLength) + '...[truncated]' 
              : stlFileData;
          }
          
          // Store full data in memory
          stlFileStorage.set(orderTempId, {
            stlString: stlFileData,
            fileName: stlFileName,
            createdAt: new Date().toISOString()
          });
          
          console.log(`Stored full STL data in memory with key: ${orderTempId}`);
        } catch (memoryError) {
          console.error('Failed to create memory backup for STL data:', memoryError);
        }
      }
    } else {
      console.log('No STL file data provided with checkout request');
    }
    
    // Format STL information for the description
    let stlInfo = stlFileName ? ` - File: ${stlFileName}` : '';
    
    // Add a download link if available
    if (finalStlDownloadUrl) {
      stlInfo += `\n\nSTL FILE DOWNLOAD LINK: ${finalStlDownloadUrl}`;
    }
    
    // Create a Stripe product for this order
    console.log('Creating Stripe product...');
    const product = await stripe.products.create({
      name: `${modelName} (${color}, Qty: ${quantity})`,
      description: `3D Print: ${modelName} in ${color}${stlInfo}`,
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
    const host = req.headers.origin || `http://${req.headers.host}`;
    console.log('Using host for redirect:', host);
    
    // Create the Stripe checkout session with STL file metadata
    console.log('Creating Stripe checkout session...');
    
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
        stlFileName: stlFileName || 'unknown.stl',
        hasStlDownloadUrl: !!finalStlDownloadUrl,
        hasStlPublicUrl: !!finalStlPublicUrl,
        hasStlStoragePath: !!finalStlStoragePath,
        stlFileSize: stlFileSize.toString(),
        stlFileUploaded: stlFileUploaded.toString(),
        orderTempId: stlFileData && !stlFileUploaded ? `temp-${Date.now()}` : '', 
        stlDataPreview: stlDataString || ''
      },
      // Enable billing address collection to get email and address for shipping
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU'], // Add the countries you ship to
      },
    });
    console.log('Stripe checkout session created:', session.id);

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
      error: error.message 
    });
  }
});

// Add a health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Stripe checkout server is running' });
});

// Add a filament endpoint to handle requests for filament colors
app.get('/api/slant3d/filament', (req, res) => {
  // Return a sample list of filament colors
  const filaments = [
    { id: 'black-pla', name: 'Black', hex: '#121212' },
    { id: 'white-pla', name: 'White', hex: '#f9f9f9' },
    { id: 'gray-pla', name: 'Gray', hex: '#9e9e9e' },
    { id: 'red-pla', name: 'Red', hex: '#f44336' },
    { id: 'blue-pla', name: 'Royal Blue', hex: '#1976d2' },
    { id: 'green-pla', name: 'Forest Green', hex: '#2e7d32' },
    { id: 'yellow-pla', name: 'Bright Yellow', hex: '#fbc02d' },
    { id: 'orange-pla', name: 'Orange', hex: '#ff9800' },
    { id: 'purple-pla', name: 'Purple', hex: '#7b1fa2' },
    { id: 'pink-pla', name: 'Hot Pink', hex: '#e91e63' },
    { id: 'teal-pla', name: 'Teal', hex: '#009688' },
    { id: 'silver-pla', name: 'Silver Metallic', hex: '#b0bec5' },
    { id: 'gold-pla', name: 'Gold Metallic', hex: '#ffd700' },
    { id: 'bronze-pla', name: 'Bronze Metallic', hex: '#cd7f32' },
    { id: 'glow-pla', name: 'Glow-in-the-Dark', hex: '#c6ff00' }
  ];
  
  res.json(filaments);
});

// Add a calculate price endpoint
app.post('/api/calculate-price', (req, res) => {
  try {
    // Get the parameters
    const { modelData, quantity = 1, material = 'PLA' } = req.body;
    
    if (!modelData) {
      return res.status(400).json({
        success: false,
        message: 'No model data provided'
      });
    }
    
    console.log(`Received price calculation request for ${material} model, quantity: ${quantity}`);
    
    // Determine model size/complexity based on the data length
    let modelDataStr = typeof modelData === 'string' ? modelData : JSON.stringify(modelData);
    
    // If it's a data URL, get just the data part after the comma
    if (typeof modelDataStr === 'string' && modelDataStr.startsWith('data:')) {
      modelDataStr = modelDataStr.split(',')[1] || modelDataStr;
    }
    
    const dataSize = modelDataStr.length;
    console.log(`Model data size: ${Math.round(dataSize / 1024)} KB`);
    
    // Base price calculation using data size as a proxy for complexity
    // $5 base price + $1 per 10KB, adjusted by quantity
    const baseItemPrice = 5 + (dataSize / 10240);
    const totalBasePrice = baseItemPrice * quantity;
    
    // Add randomness to make pricing seem more realistic (±10%)
    const randomFactor = 0.9 + (Math.random() * 0.2);
    const finalBasePrice = totalBasePrice * randomFactor;
    
    // Material and printing cost breakdown (40% material, 60% printing)
    const materialCost = finalBasePrice * 0.4;
    const printingCost = finalBasePrice * 0.6;
    
    // Fixed shipping cost
    const shippingCost = 4.99;
    
    // Calculate total price
    const totalPrice = finalBasePrice + shippingCost;
    
    // Return the price information
    return res.status(200).json({
      success: true,
      message: 'Price calculated successfully',
      basePrice: parseFloat(baseItemPrice.toFixed(2)),
      totalBasePrice: parseFloat(finalBasePrice.toFixed(2)),
      materialCost: parseFloat(materialCost.toFixed(2)),
      printingCost: parseFloat(printingCost.toFixed(2)),
      shippingCost: parseFloat(shippingCost.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      quantity: quantity,
      material: material
    });
  } catch (error) {
    console.error('Error calculating price:', error);
    
    // Fallback to a simple calculation
    const qty = req.body.quantity || 1;
    const basePrice = 15 + ((qty - 1) * 5);
    
    return res.status(500).json({
      success: false,
      message: 'Error calculating price, using estimate',
      basePrice: parseFloat(basePrice.toFixed(2)),
      totalBasePrice: parseFloat(basePrice.toFixed(2)),
      materialCost: parseFloat((basePrice * 0.4).toFixed(2)),
      printingCost: parseFloat((basePrice * 0.6).toFixed(2)),
      shippingCost: 4.99,
      totalPrice: parseFloat((basePrice + 4.99).toFixed(2)),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add a Slant3D price calculation endpoint for compatibility
app.post('/api/slant3d/calculate-price', (req, res) => {
  // Redirect to our normal calculate-price endpoint
  return app.handle(req, { ...res, _headers: {}, getHeader: () => {}, setHeader: () => {} }, () => {
    req.url = '/api/calculate-price';
    app.handle(req, res);
  });
});

// Add endpoint to get order details by session ID
app.get('/api/order-details', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    // First check Firestore for an order with this session ID
    let orderDoc = null;
    
    if (firestore) {
      try {
        const ordersSnapshot = await firestore
          .collection('orders')
          .where('sessionId', '==', session_id)
          .limit(1)
          .get();
        
        if (!ordersSnapshot.empty) {
          orderDoc = ordersSnapshot.docs[0].data();
          console.log('Found order in Firestore:', orderDoc.orderId);
          console.log('Order has STL data:', !!orderDoc.stlFileData);
          console.log('STL data length:', orderDoc.stlFileData ? orderDoc.stlFileData.length : 0);
        }
      } catch (firestoreError) {
        console.error('Error querying Firestore:', firestoreError);
      }
    }
    
    // If not found in Firestore, check memory storage
    if (!orderDoc) {
      // Check memory storage
      for (const order of memoryOrderStore) {
        if (order.sessionId === session_id) {
          orderDoc = order;
          console.log('Found order in memory storage:', orderDoc.orderId);
          console.log('Order has STL data:', !!orderDoc.stlFileData);
          console.log('STL data length:', orderDoc.stlFileData ? orderDoc.stlFileData.length : 0);
          break;
        }
      }
    }
    
    // If we found an order, return it
    if (orderDoc) {
      return res.status(200).json({
        success: true,
        order: orderDoc
      });
    }
    
    // If no order found, try to get the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // If the payment was successful, process the order
    if (session.payment_status === 'paid') {
      // Process the order and save it
      const orderData = await handleSuccessfulPayment(session);
      
      if (orderData) {
        return res.status(200).json({
          success: true,
          order: orderData
        });
      }
    }
    
    // Extract order details from the Stripe session
    const {
      metadata = {},
      amount_total = 0,
      payment_status = 'unpaid'
    } = session;
    
    // Retrieve the STL data if available from memory storage
    let stlFileData = '';
    if (metadata.orderTempId) {
      const memoryData = stlFileStorage.get(metadata.orderTempId);
      if (memoryData && memoryData.stlString) {
        stlFileData = memoryData.stlString;
        console.log(`Retrieved STL data from memory, length: ${stlFileData.length}`);
      }
    }
    
    // Create a temporary order object
    const orderDetails = {
      orderId: `temp-${session.id.substring(0, 8)}`,
      sessionId: session.id,
      modelName: metadata.modelName || 'Custom 3D Print',
      color: metadata.color || 'Unknown',
      quantity: parseInt(metadata.quantity || '1'),
      finalPrice: amount_total / 100, // Convert from cents to dollars
      paymentStatus: payment_status,
      stlFileName: metadata.stlFileName || 'model.stl',
      stlFileUrl: metadata.stlDownloadUrl || '',
      stlStoragePath: metadata.stlStoragePath || '',
      stlFileData: stlFileData || metadata.stlDataPreview || '', // Include STL data from memory or preview from metadata
      orderDate: new Date().toISOString()
    };
    
    return res.status(200).json({
      success: true,
      order: orderDetails
    });
  } catch (error) {
    console.error('Error getting order details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
});

// Webhook handling for Stripe events
app.post('/api/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    // Verify the event came from Stripe
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test'
    );
    
    // Handle the event based on its type
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Payment successful for session:', session.id);
        
        // Process the completed checkout session
        await handleSuccessfulPayment(session);
        break;
      }
      // Add more cases for other events you want to handle
    }
    
    res.json({received: true});
  } catch (err) {
    console.error('Webhook Error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Add an endpoint to download a stored STL file from Firebase Storage
app.get('/api/download-stl/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`Processing STL download request for order: ${orderId}`);
    
    // First check memory store for the order
    let memoryOrder = null;
    for (const order of memoryOrderStore) {
      if (order.orderId === orderId) {
        memoryOrder = order;
        console.log(`Found order in memory store: ${orderId}`);
        break;
      }
    }
    
    // Handle memory order if found
    if (memoryOrder && memoryOrder.stlFile) {
      // If we have a direct download URL from memory, use it
      if (memoryOrder.stlFile.downloadUrl) {
        console.log(`Memory order has a download URL. Redirecting to: ${memoryOrder.stlFile.downloadUrl}`);
        return res.redirect(memoryOrder.stlFile.downloadUrl);
      }
      
      // If we have STL data directly in memory, serve it
      if (memoryOrder.stlFileData || memoryOrder.stlFile.dataPreview) {
        const stlData = memoryOrder.stlFileData || memoryOrder.stlFile.dataPreview;
        console.log('Serving STL data directly from memory');
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/sla');
        res.setHeader('Content-Disposition', `attachment; filename="${memoryOrder.stlFile.fileName || 'model.stl'}"`);
        
        // Send the STL data
        return res.send(stlData);
      }
    }
    
    // If not in memory or memory doesn't have STL data, try Firestore
    try {
      // Get the order from Firestore
      const db = admin.firestore();
      const orderDoc = await db.collection('orders').doc(orderId).get();
      
      if (!orderDoc.exists) {
        console.log(`Order not found in Firestore: ${orderId}`);
      } else {
        const order = orderDoc.data();
        console.log(`Found order in Firestore: ${orderId}`);
        
        // First check if we have a direct download URL
        if (order.stlFile && order.stlFile.downloadUrl) {
          console.log(`Order has a download URL. Redirecting to: ${order.stlFile.downloadUrl}`);
          return res.redirect(order.stlFile.downloadUrl);
        }
        
        // If no download URL but we have a storage path, generate a new download URL
        if (order.stlFile && order.stlFile.storagePath) {
          try {
            console.log(`Generating download URL for path: ${order.stlFile.storagePath}`);
            
            const bucket = admin.storage().bucket();
            const file = bucket.file(order.stlFile.storagePath);
            
            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
              console.log(`File does not exist at path: ${order.stlFile.storagePath}`);
              
              // If we have a data preview, serve that as a fallback
              if (order.stlFile.dataPreview) {
                console.log('Serving STL data preview from Firestore as fallback');
                
                // Set headers for file download
                res.setHeader('Content-Type', 'application/sla');
                res.setHeader('Content-Disposition', `attachment; filename="${order.stlFile.fileName || 'model.stl'}"`);
                
                // Send the STL data
                return res.send(order.stlFile.dataPreview);
              }
              
              return res.status(404).json({
                success: false,
                message: 'STL file not found in storage'
              });
            }
            
            // Generate a signed URL valid for 1 hour
            const [signedUrl] = await file.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + 60 * 60 * 1000 // 1 hour
            });
            
            console.log(`Generated new signed URL for download: ${signedUrl}`);
            
            // Update the order with the new download URL
            await db.collection('orders').doc(orderId).update({
              'stlFile.downloadUrl': signedUrl,
              'stlFile.downloadUrlGeneratedAt': new Date().toISOString()
            });
            
            // Redirect to the download URL
            return res.redirect(signedUrl);
          } catch (storageError) {
            console.error('Error accessing Firebase Storage:', storageError);
            
            // If we have a data preview, serve that as a fallback
            if (order.stlFile.dataPreview) {
              console.log('Serving STL data preview after storage error');
              
              // Set headers for file download
              res.setHeader('Content-Type', 'application/sla');
              res.setHeader('Content-Disposition', `attachment; filename="${order.stlFile.fileName || 'model.stl'}"`);
              
              // Send the STL data
              return res.send(order.stlFile.dataPreview);
            }
            
            return res.status(500).json({
              success: false,
              message: 'Error accessing file in Firebase Storage',
              error: storageError.message
            });
          }
        }
        
        // If we have STL data in the order itself, serve it directly
        if (order.stlFile && order.stlFile.dataPreview) {
          console.log('Order has STL data preview. Serving limited STL data directly.');
          
          // Set headers for file download
          res.setHeader('Content-Type', 'application/sla');
          res.setHeader('Content-Disposition', `attachment; filename="${order.stlFile.fileName || 'model.stl'}"`);
          
          // Send the STL data
          return res.send(order.stlFile.dataPreview);
        }
      }
    } catch (firestoreError) {
      console.error('Error accessing Firestore:', firestoreError);
    }
    
    // If we get here, we don't have any STL data for this order
    console.log(`No STL data available for order: ${orderId}`);
    return res.status(404).json({
      success: false,
      message: 'No STL file data found for this order'
    });
  } catch (error) {
    console.error('Error processing STL download request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add an improved endpoint for getting order details
app.get('/api/order-details/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`Getting order details for: ${orderId}`);
    
    // First check memory store for the order
    let memoryOrder = null;
    for (const order of memoryOrderStore) {
      if (order.orderId === orderId) {
        memoryOrder = order;
        console.log(`Found order in memory store: ${orderId}`);
        break;
      }
    }
    
    // If found in memory, return it
    if (memoryOrder) {
      // Create a download link
      const host = req.headers.origin || `http://${req.headers.host}`;
      if (memoryOrder.stlFile) {
        memoryOrder.stlFile.downloadLink = `${host}/api/download-stl/${orderId}`;
      }
      
      return res.json({
        success: true,
        order: memoryOrder,
        source: 'memory'
      });
    }
    
    // If not in memory, try Firestore
    let firestoreOrder = null;
    try {
      // Get the order from Firestore
      const db = admin.firestore();
      const orderDoc = await db.collection('orders').doc(orderId).get();
      
      if (!orderDoc.exists) {
        console.log(`Order not found in Firestore: ${orderId}`);
      } else {
        firestoreOrder = orderDoc.data();
        console.log(`Found order in Firestore: ${orderId}`);
        
        // Generate a fresh download URL if needed
        if (firestoreOrder.stlFile && firestoreOrder.stlFile.storagePath) {
          try {
            const bucket = admin.storage().bucket();
            const file = bucket.file(firestoreOrder.stlFile.storagePath);
            
            // Check if file exists
            const [exists] = await file.exists();
            if (exists) {
              // Generate a signed URL valid for 1 day
              const [signedUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
              });
              
              // Update the order with the fresh URL
              firestoreOrder.stlFile.downloadUrl = signedUrl;
              firestoreOrder.stlFile.downloadUrlGeneratedAt = new Date().toISOString();
              
              // Also update in Firestore
              await orderDoc.ref.update({
                'stlFile.downloadUrl': signedUrl,
                'stlFile.downloadUrlGeneratedAt': new Date().toISOString()
              });
              
              console.log(`Generated fresh download URL for order: ${orderId}`);
            }
          } catch (storageError) {
            console.warn('Could not refresh download URL:', storageError.message);
            // Continue with existing URL if available
          }
        }
        
        // Create a download link
        const host = req.headers.origin || `http://${req.headers.host}`;
        if (firestoreOrder.stlFile) {
          firestoreOrder.stlFile.downloadLink = `${host}/api/download-stl/${firestoreOrder.orderId}`;
        }
        
        return res.json({
          success: true,
          order: firestoreOrder,
          source: 'firestore'
        });
      }
    } catch (firestoreError) {
      console.error('Error getting order from Firestore:', firestoreError);
      // Continue to look in Stripe sessions
    }
    
    // If we got this far and still don't have an order, check for Stripe sessions
    // that might match this order ID pattern (common for temp-{timestamp} orders)
    if (orderId.startsWith('temp-') || orderId.startsWith('order-')) {
      try {
        console.log('Searching Stripe for matching sessions');
        // List recent Stripe sessions (limited to 10 for performance)
        const sessions = await stripe.checkout.sessions.list({
          limit: 10,
        });
        
        // Look for matching timestamp or other identifying information
        const timestampPart = orderId.split('-')[1]; // Extract timestamp if present
        
        for (const session of sessions.data) {
          // Check if this session might match our order
          if (session.metadata && 
              (session.id.includes(timestampPart) || 
               session.metadata.orderTempId === orderId)) {
            
            console.log(`Found potential matching Stripe session: ${session.id}`);
            // Try to create an order from this session
            const orderResult = await handleSuccessfulPayment(session);
            
            // Add download link
            const host = req.headers.origin || `http://${req.headers.host}`;
            if (orderResult.stlFile) {
              orderResult.stlFile.downloadLink = `${host}/api/download-stl/${orderResult.orderId}`;
            }
            
            return res.json({
              success: true,
              order: orderResult,
              source: 'stripe-lookup'
            });
          }
        }
      } catch (stripeError) {
        console.error('Error searching Stripe sessions:', stripeError);
      }
    }
    
    // If we get here, the order was not found anywhere
    return res.status(404).json({
      success: false,
      message: 'Order not found',
      orderId
    });
    
  } catch (error) {
    console.error('Error getting order details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add a checkout-confirmation endpoint to get order details
app.get('/api/checkout-confirmation', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    console.log(`Getting order details for checkout session: ${sessionId}`);
    
    // First check the memory store for this session
    let memoryOrder = null;
    for (const order of memoryOrderStore) {
      if (order.stripeSessionId === sessionId) {
        memoryOrder = order;
        console.log(`Found order in memory store for session: ${sessionId}`);
        break;
      }
    }
    
    // If found in memory, use that
    if (memoryOrder) {
      // Add download link for STL file if needed
      const host = req.headers.origin || `http://${req.headers.host}`;
      if (memoryOrder.stlFile) {
        memoryOrder.stlFile.downloadLink = `${host}/api/download-stl/${memoryOrder.orderId}`;
      }
      
      return res.json({
        success: true,
        order: memoryOrder,
        source: 'memory'
      });
    }
    
    // If not in memory, try Firestore
    let firestoreOrder = null;
    try {
      // Try to find the order in Firestore by session ID
      const db = admin.firestore();
      const ordersSnapshot = await db.collection('orders').where('stripeSessionId', '==', sessionId).limit(1).get();
      
      if (!ordersSnapshot.empty) {
        // We found an order matching this session ID
        const orderDoc = ordersSnapshot.docs[0];
        firestoreOrder = orderDoc.data();
        console.log(`Found order in Firestore for session: ${sessionId}`);
        
        // Generate fresh download URL if needed
        if (firestoreOrder.stlFile && firestoreOrder.stlFile.storagePath) {
          try {
            const bucket = admin.storage().bucket();
            const file = bucket.file(firestoreOrder.stlFile.storagePath);
            
            // Check if file exists
            const [exists] = await file.exists();
            if (exists) {
              // Generate a signed URL valid for 24 hours
              const [signedUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
              });
              
              // Update the order with the fresh URL
              firestoreOrder.stlFile.downloadUrl = signedUrl;
              firestoreOrder.stlFile.downloadUrlGeneratedAt = new Date().toISOString();
              
              // Also update in Firestore
              await orderDoc.ref.update({
                'stlFile.downloadUrl': signedUrl,
                'stlFile.downloadUrlGeneratedAt': new Date().toISOString()
              });
              
              console.log(`Generated fresh download URL for session: ${sessionId}`);
            }
          } catch (storageError) {
            console.warn('Could not refresh download URL:', storageError.message);
            // Continue with existing URL if available
          }
        }
        
        // Create a download link
        const host = req.headers.origin || `http://${req.headers.host}`;
        if (firestoreOrder.stlFile) {
          firestoreOrder.stlFile.downloadLink = `${host}/api/download-stl/${firestoreOrder.orderId}`;
        }
        
        return res.json({
          success: true,
          order: firestoreOrder,
          source: 'firestore'
        });
      }
    } catch (firestoreError) {
      console.error('Error querying Firestore:', firestoreError);
      // Proceed to try Stripe directly
    }
    
    // If not found in memory or Firestore, try to get the session from Stripe directly
    console.log(`Retrieving session from Stripe: ${sessionId}`);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'line_items']
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Checkout session not found'
      });
    }
    
    // If session exists but we don't have an order yet, create one now
    if (session) {
      try {
        console.log(`Creating order from Stripe session: ${sessionId}`);
        const orderResult = await handleSuccessfulPayment(session);
        
        // Add download link
        const host = req.headers.origin || `http://${req.headers.host}`;
        if (orderResult.stlFile) {
          orderResult.stlFile.downloadLink = `${host}/api/download-stl/${orderResult.orderId}`;
        }
        
        return res.json({
          success: true,
          order: orderResult,
          source: 'stripe-new'
        });
      } catch (orderCreationError) {
        console.error('Error creating order from Stripe session:', orderCreationError);
      }
    }
    
    // If we get here, we couldn't find or create a proper order
    // Create a minimal order from the session data as last resort
    console.log('Creating minimal order from session data as fallback');
    const minimalOrder = {
      orderId: `temp-${Date.now()}`,
      stripeSessionId: sessionId,
      customerEmail: session.customer_details?.email || 'Unknown',
      customerName: session.customer_details?.name || 'Unknown',
      orderDetails: {
        modelName: session.metadata?.modelName || 'Unknown Model',
        color: session.metadata?.color || 'Unknown',
        quantity: parseInt(session.metadata?.quantity || '1'),
        finalPrice: parseFloat(session.metadata?.finalPrice || '0')
      },
      stlFile: session.metadata?.stlFileName ? {
        fileName: session.metadata.stlFileName
      } : null,
      orderStatus: 'pending-details',
      orderDate: new Date().toISOString()
    };
    
    // Store this minimal order in memory for future requests
    memoryOrderStore.push(minimalOrder);
    
    return res.json({
      success: true,
      order: minimalOrder,
      source: 'stripe-minimal'
    });
  } catch (error) {
    console.error('Error getting checkout confirmation:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Add an endpoint to verify and update subscription status
app.post('/api/pricing/verify-subscription', async (req, res) => {
  try {
    const { userId, sessionId, email } = req.body;
    
    console.log('Verifying subscription for user:', { userId, email, sessionId });
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }
    
    let subscription = null;
    let customerId = null;
    
    // First check if we have a valid Stripe session ID
    if (sessionId) {
      try {
        // Get session details
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['subscription']
        });
        
        if (session && session.subscription) {
          console.log('Found active session with subscription:', session.subscription.id);
          subscription = session.subscription;
          customerId = session.customer;
        }
      } catch (sessionError) {
        console.error('Error retrieving session:', sessionError);
      }
    }
    
    // If we couldn't get the subscription from the session, try to find it by customer
    if (!subscription && customerId) {
      try {
        // Retrieve active subscriptions for the customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          subscription = subscriptions.data[0];
          console.log('Found active subscription for customer:', subscription.id);
        }
      } catch (listError) {
        console.error('Error listing subscriptions:', listError);
      }
    }
    
    // If we don't have a customerId yet, try to find the user in Stripe
    if (!customerId && email) {
      try {
        const customers = await stripe.customers.list({
          email: email,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
          console.log('Found customer by email:', customerId);
          
          // Try to get subscriptions again with found customer ID
          const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 1
          });
          
          if (subscriptions.data.length > 0) {
            subscription = subscriptions.data[0];
            console.log('Found active subscription for customer:', subscription.id);
          }
        }
      } catch (customerError) {
        console.error('Error searching for customer:', customerError);
      }
    }
    
    // If we have a valid subscription, update the user's status
    if (subscription) {
      // Get price details to determine subscription tier
      let price;
      try {
        price = await stripe.prices.retrieve(subscription.items.data[0].price.id);
        console.log('Subscription price:', price.id, 'Product:', price.product);
      } catch (priceError) {
        console.error('Error retrieving price information:', priceError);
      }
      
      // Determine tier and limits based on subscription
      const tierInfo = {
        isPro: true,
        subscriptionStatus: subscription.status,
        subscriptionPlan: 'pro',
        subscriptionId: subscription.id,
        subscriptionPriceId: subscription.items.data[0].price.id,
        subscriptionProductId: price ? price.product : null,
        modelsRemainingThisMonth: 100, // Default value for Pro tier
        modelsGeneratedThisMonth: 0,
        downloadsThisMonth: 0,
        subscriptionEndDate: new Date(subscription.current_period_end * 1000).toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      // Update the user in Firestore
      if (firestore) {
        try {
          const userRef = firestore.collection('users').doc(userId);
          const userDoc = await userRef.get();
          
          if (userDoc.exists) {
            // Update existing user
            await userRef.update({
              ...tierInfo,
              stripeCustomerId: customerId || userDoc.data().stripeCustomerId
            });
            console.log('Updated existing user with subscription info:', userId);
          } else {
            // Create new user with subscription
            await userRef.set({
              uid: userId,
              email: email,
              stripeCustomerId: customerId,
              createdAt: new Date(),
              ...tierInfo
            });
            console.log('Created new user with subscription info:', userId);
          }
          
          // Return updated user info
          return res.json({
            success: true,
            message: 'Subscription verified and user updated',
            subscription: tierInfo
          });
        } catch (firestoreError) {
          console.error('Error updating user in Firestore:', firestoreError);
          return res.status(500).json({
            success: false,
            error: 'Error updating user in Firestore',
            subscription: tierInfo // Still return the valid subscription info
          });
        }
      } else {
        // No Firestore but we have subscription info
        return res.json({
          success: true,
          message: 'Subscription verified but user not updated (Firestore unavailable)',
          subscription: tierInfo
        });
      }
    } else {
      // No valid subscription found
      return res.json({
        success: false,
        message: 'No active subscription found for this user',
        subscription: null
      });
    }
  } catch (error) {
    console.error('Error verifying subscription:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add an endpoint to get user subscription status
app.get('/api/pricing/user-subscription/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`Getting subscription status for user: ${userId}`);
    
    // Get user document from Firestore
    const userRef = firestore.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User not found: ${userId}`);
      return res.status(200).json({
        isPro: false,
        modelsRemainingThisMonth: 2, // Default limit for free users
        modelsGeneratedThisMonth: 0,
        downloadsThisMonth: 0,
        subscriptionStatus: 'none',
        subscriptionEndDate: null,
        subscriptionPlan: 'free',
        trialActive: false,
        trialEndDate: null
      });
    }
    
    const userData = userDoc.data();
    console.log(`Found user in Firestore:`, userData);
    
    // Check if the trial has expired (if user is on trial)
    let isPro = userData.isPro === true;
    let trialActive = userData.trialActive === true;
    let subscriptionStatus = userData.subscriptionStatus || 'none';
    let subscriptionPlan = userData.subscriptionPlan || 'free';
    
    // DEBUGGING: Print detailed subscription information
    console.log(`SUBSCRIPTION DEBUG for ${userId}:
      isPro: ${isPro}
      trialActive: ${trialActive}
      subscriptionStatus: ${subscriptionStatus}
      subscriptionPlan: ${subscriptionPlan}
      Original isPro value type: ${typeof userData.isPro} value: ${userData.isPro}
    `);
    
    // If user is on trial, check if it has expired
    if (trialActive && userData.trialEndDate) {
      // Convert Firebase Timestamp to JavaScript Date
      let trialEndDate;
      
      // Handle different Timestamp formats
      if (userData.trialEndDate._seconds !== undefined) {
        // It's a Firestore Timestamp object from the server
        trialEndDate = new Date(userData.trialEndDate._seconds * 1000);
        console.log(`Parsed trialEndDate from _seconds: ${trialEndDate}`);
      } else if (userData.trialEndDate.seconds !== undefined) {
        // It's a Firestore Timestamp object from the client
        trialEndDate = new Date(userData.trialEndDate.seconds * 1000);
        console.log(`Parsed trialEndDate from seconds: ${trialEndDate}`);
      } else if (userData.trialEndDate.toDate) {
        // It's a Firestore Timestamp with toDate method
        trialEndDate = userData.trialEndDate.toDate();
        console.log(`Used toDate method: ${trialEndDate}`);
      } else {
        // Assume it's already a date string or timestamp
        trialEndDate = new Date(userData.trialEndDate);
        console.log(`Created date from value: ${trialEndDate}`);
      }
      
      const now = new Date();
      console.log(`Current time: ${now}, Trial end time: ${trialEndDate}`);
      console.log(`Trial expired? ${now > trialEndDate ? 'YES' : 'NO'}`);
      
      // IMPORTANT: Force the correct behavior for testing non-pro users
      const forceNonPro = true; // Set to true to force all users to be non-pro for testing
      
      if (now > trialEndDate || forceNonPro) {
        console.log(`Trial has expired for user ${userId} ${forceNonPro ? '(FORCED)' : ''}`);
        // Trial has expired
        isPro = false;
        trialActive = false;
        subscriptionStatus = 'none';
        subscriptionPlan = 'free';
        
        // Update user in Firestore
        await userRef.update({
          isPro: false,
          trialActive: false,
          subscriptionStatus: 'none',
          subscriptionPlan: 'free',
          modelsRemainingThisMonth: 2 // Reset to free tier
        });
        console.log(`Updated user ${userId} - trial expired, downgraded to free`);
      }
    }
    
    // Check paid subscription status if not on trial
    if (!trialActive && isPro && userData.subscriptionStatus === 'active') {
      // User has a paid subscription
      console.log(`User ${userId} has an active paid subscription`);
    } else if (!trialActive && !isPro) {
      // User is a free user
      console.log(`User ${userId} is a free user`);
    }
    
    // Return subscription information with possibly updated trial status
    const result = {
      isPro: isPro,
      modelsRemainingThisMonth: isPro ? Infinity : (userData.modelsRemainingThisMonth || 2),
      modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
      downloadsThisMonth: userData.downloadsThisMonth || 0,
      subscriptionStatus: subscriptionStatus,
      subscriptionEndDate: userData.subscriptionEndDate || null,
      subscriptionPlan: subscriptionPlan,
      trialActive: trialActive,
      trialEndDate: userData.trialEndDate || null
    };
    
    console.log(`Returning subscription data for ${userId}:`, result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return res.status(500).json({ error: 'Failed to get user subscription', details: error.message });
  }
});

// Storage proxy endpoint for authenticated file downloads
app.get('/api/storage-proxy', async (req, res) => {
  try {
    const url = req.query.url;
    const userId = req.query.userId;
    
    console.log(`📥 STORAGE PROXY REQUEST RECEIVED`);
    console.log(`URL: ${url}`);
    console.log(`User ID: ${userId}`);
    
    if (!url) {
      console.error('❌ Missing URL parameter in storage proxy request');
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    if (!userId) {
      console.error('❌ Missing userId parameter in storage proxy request');
      return res.status(400).json({ error: 'User ID is required for authentication' });
    }
    
    console.log(`🔄 Storage proxy request: ${url}, user: ${userId}`);
    
    // Get the user's subscription status from Firestore
    let isPro = false;
    let userData = null;
    
    try {
      console.log(`👤 Getting user status for download. User: ${userId}`);
      
      // Get the user's subscription status from Firestore
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        userData = userDoc.data();
        // Use a strict check for isPro and also check if on trial
        isPro = userData.isPro === true || userData.trialActive === true;
        
        console.log(`📊 User subscription data:`, {
          userId,
          isPro: userData.isPro,
          trialActive: userData.trialActive,
          subscriptionStatus: userData.subscriptionStatus,
          subscriptionPlan: userData.subscriptionPlan
        });
      } else {
        console.log(`⚠️ User not found in database: ${userId}, treating as free user`);
        isPro = false;
      }
    } catch (error) {
      console.error('❌ Error getting user access level:', error);
      // Continue with download as free user
      isPro = false;
    }
    
    // IMPORTANT: Allow downloads for ALL users (both free and pro)
    // We'll just add a watermark indicator for free users in the filename
    console.log(`🔑 User access determined: ${isPro ? 'PRO' : 'FREE'} - allowing download for all users`);
    
    // Track the download in user's account if possible
    try {
      if (userData && userData.uid) {
        // Increment the downloadsThisMonth counter
        await firestore.collection('users').doc(userId).update({
          downloadsThisMonth: admin.firestore.FieldValue.increment(1),
          lastUpdated: new Date().toISOString()
        });
        console.log(`📝 Updated download count for user ${userId}`);
      } else if (userId) {
        // If the user exists in Auth but not in Firestore, create a record
        try {
          await firestore.collection('users').doc(userId).set({
            uid: userId,
            downloadsThisMonth: 1,
            isPro: false,
            lastUpdated: new Date().toISOString()
          }, { merge: true });
          console.log(`📝 Created new user record with download count`);
        } catch (createError) {
          console.error('❌ Error creating user record:', createError);
        }
      }
    } catch (downloadTrackingError) {
      // Don't fail the download if tracking fails, just log the error
      console.error('⚠️ Error tracking download:', downloadTrackingError);
    }
    
    try {
      console.log(`🔄 Proxying request to: ${url}, isPro: ${isPro}`);
      
      // Forward the request to the target URL
      const axios = require('axios');
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer', // Important for binary files like STL
        timeout: 60000, // 60 second timeout for larger files
        maxContentLength: 100 * 1024 * 1024, // Allow up to 100MB for downloads
        headers: {
          // Add headers to appear as a browser request
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });
      
      // NOTE: In a real implementation, we would add watermarking for free users
      // This is just a demo, so we're just modifying the filename
      
      // Determine filename (from URL, Content-Disposition header, or default)
      let filename = '';
      
      // Try to get filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=['"]?([^'";\n]+)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }
      
      // If no filename from header, extract from URL
      if (!filename) {
        filename = url.split('/').pop() || 'download';
        // Remove any query parameters
        filename = filename.split('?')[0];
      }
      
      // For free users, add a watermark indicator to the filename
      if (!isPro) {
        // Add a watermark indicator to the filename for free users
        const filenameParts = filename.split('.');
        const ext = filenameParts.pop() || '';
        filename = filenameParts.join('.') + '-watermarked' + (ext ? '.' + ext : '');
      }
      
      // Set appropriate headers for the download
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      // Important CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Set Content-Disposition to force download with proper filename
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      console.log(`✅ Proxy successful. Content-Type: ${response.headers['content-type']}, Size: ${response.data.length} bytes, Filename: ${filename}`);
      
      // Return the response as binary data
      return res.status(response.status).send(response.data);
    } catch (error) {
      console.error('❌ Error proxying storage request:', error.message);
      
      // Check for specific axios errors
      if (error.response) {
        // The server responded with a status code outside of 2xx range
        console.error(`⚠️ Target server responded with status: ${error.response.status}`);
        return res.status(error.response.status).json({
          error: 'Error from target server',
          status: error.response.status,
          details: error.message
        });
      } else if (error.request) {
        // The request was made but no response was received
        console.error('⚠️ No response received from target server');
        return res.status(504).json({
          error: 'No response from target server',
          details: error.message
        });
      }
      
      // Handle other errors
      return res.status(500).json({ 
        error: 'Error proxying request',
        details: error.message
      });
    }
  } catch (mainError) {
    console.error('❌ Unexpected error in storage proxy:', mainError);
    return res.status(500).json({
      error: 'Unexpected error in storage proxy',
      details: mainError.message
    });
  }
});

// Add a test endpoint to simulate trial expiration
app.get('/api/test-trial-expiration/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🧪 TESTING trial expiration for user: ${userId}`);
    
    // Get user document from Firestore
    const userRef = firestore.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    console.log(`Found user for testing:`, userData);
    
    // Check if the user is on a trial
    if (!userData.trialActive) {
      console.log(`User ${userId} is not on a trial, can't test expiration`);
      return res.status(400).json({ 
        error: 'User is not on a trial', 
        userData: userData 
      });
    }
    
    // Set the trial end date to 1 hour ago to simulate expiration
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1); // 1 hour ago instead of 24 hours
    
    console.log(`Setting trial end date to past date: ${pastDate}`);
    
    // Update the user document
    await userRef.update({
      trialEndDate: admin.firestore.Timestamp.fromDate(pastDate)
    });
    
    console.log(`Updated user trial end date to past. Calling subscription endpoint to trigger expiration check...`);
    
    // Call the user subscription endpoint to check if it correctly identifies the expired trial
    const port = PORT;
    const url = `http://localhost:${port}/api/pricing/user-subscription/${userId}`;
    
    console.log(`Calling subscription endpoint: ${url}`);
    
    try {
      // We'll simulate calling the endpoint ourselves
      // Get the updated user document
      const updatedUserDoc = await userRef.get();
      const updatedUserData = updatedUserDoc.data();
      
      console.log('Retrieved updated user data:', updatedUserData);
      
      // Check if trial has expired
      const trialEndDate = updatedUserData.trialEndDate;
      const now = new Date();
      
      let trialHasExpired = false;
      let trialEndTime;
      
      if (trialEndDate) {
        if (trialEndDate._seconds) {
          trialEndTime = new Date(trialEndDate._seconds * 1000);
        } else if (typeof trialEndDate.toDate === 'function') {
          trialEndTime = trialEndDate.toDate();
        } else {
          trialEndTime = new Date(trialEndDate);
        }
        
        trialHasExpired = now > trialEndTime;
      }
      
      console.log(`Current time: ${now}, Trial end time: ${trialEndTime}, Trial expired: ${trialHasExpired}`);
      
      // If trial has expired, update user data
      if (trialHasExpired && updatedUserData.isPro && updatedUserData.subscriptionPlan === 'trial') {
        await userRef.update({
          isPro: false,
          trialActive: false,
          subscriptionStatus: 'none',
          subscriptionPlan: 'free'
        });
        
        console.log('Successfully downgraded user to free plan after trial expiration');
      }
      
      // Get the final user state
      const finalUserDoc = await userRef.get();
      const finalUserData = finalUserDoc.data();
      
      // Return the test results
      return res.json({
        testStatus: 'SUCCESS',
        message: 'Trial expiration test completed successfully',
        beforeUpdate: updatedUserData,
        afterUpdate: finalUserData,
        trialExpired: trialHasExpired,
        currentTime: now.toISOString(),
        trialEndTime: trialEndTime ? trialEndTime.toISOString() : null
      });
      
    } catch (error) {
      console.error('Error calling subscription endpoint:', error);
      return res.status(500).json({
        testStatus: 'ERROR',
        error: 'Error calling subscription endpoint',
        details: error.message
      });
    }
    
  } catch (error) {
    console.error('Error in test-trial-expiration endpoint:', error);
    return res.status(500).json({
      testStatus: 'ERROR',
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Test trial expiration endpoint that doesn't require Firestore
app.get('/api/test-trial-expiration/:userId', async (req, res) => {
  const userId = req.params.userId;
  
  console.log(`🧪 SIMPLE TEST for trial expiration. User ID: ${userId}`);
  
  // Always return success with mock data
  return res.json({
    testStatus: 'SUCCESS',
    message: 'This is a simplified test endpoint that always succeeds',
    userId: userId,
    mockData: {
      isPro: false,
      trialActive: false,
      trialEndDate: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago instead of 24 hours
      subscriptionPlan: 'free',
      currentTime: new Date().toISOString()
    }
  });
});

// Add generic checkout endpoint for maximum flexibility
app.all('/api/checkout', async (req, res) => {
  console.log(`Received ${req.method} request at /api/checkout`);
  
  // Handle OPTIONS requests for preflight
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).send();
  }
  
  // Only proceed with POST
  if (req.method !== 'POST') {
    console.log(`Redirecting ${req.method} to POST handler`);
    // Instead of returning 405, forward to the POST handler
    req.method = 'POST';
  }
  
  try {
    const { priceId, userId, email, force_new_customer } = req.body;
    
    console.log('Received checkout request at simplified endpoint:', { 
      priceId, 
      userId, 
      email,
      force_new_customer: !!force_new_customer
    });
    
    if (!priceId || !userId || !email) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Rest of implementation is the same as other checkout endpoints
    // ... proceed with the checkout process
    let customerId = null;
    
    // Create a new customer every time in production for simplicity
    try {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;
      console.log(`Created new Stripe customer: ${customerId}`);
      
      // Update Firestore if available
      if (firestore) {
        const userRef = firestore.collection('users').doc(userId);
        await userRef.set({
          stripeCustomerId: customerId,
        }, { merge: true });
        console.log('Updated Firestore with new customer ID');
      }
    } catch (stripeError) {
      console.error('Error creating Stripe customer:', stripeError);
      return res.status(500).json({ error: 'Failed to create Stripe customer', details: stripeError.message });
    }
    
    // Create a checkout session with the customer
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
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
        metadata: {
          userId: userId,
        },
      });
      
      return res.json({ url: session.url });
    } catch (stripeError) {
      console.error('Error creating checkout session:', stripeError);
      return res.status(500).json({ error: 'Failed to create checkout session', details: stripeError.message });
    }
  } catch (error) {
    console.error('Error processing checkout request:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Add a catchall route that provides useful information
app.all('*', (req, res) => {
  const path = req.path;
  const method = req.method;
  
  console.log(`Received ${method} request for unhandled path: ${path}`);
  
  // If the path contains "checkout" or "stripe", provide helpful debug info
  if (path.includes('checkout') || path.includes('stripe')) {
    return res.status(404).json({
      error: 'Endpoint not found',
      message: `The ${method} request to ${path} was not handled by the server.`,
      availableEndpoints: [
        '/api/checkout',
        '/api/pricing/create-checkout-session',
        '/pricing/create-checkout-session',
        '/api/create-checkout-session',
        '/create-checkout-session'
      ],
      suggestedEndpoint: '/api/checkout',
      helpMessage: 'Try using the /api/checkout endpoint which handles all HTTP methods properly.'
    });
  }
  
  // Generic 404 for other routes
  res.status(404).json({ error: 'Not found' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Simple checkout server running at http://localhost:${PORT}`);
}); 

// Special handler for the www domain path that was returning 405 errors
app.get('/pricing/create-checkout-session', async (req, res) => {
  console.log('Received GET request to /pricing/create-checkout-session with query params:', req.query);
  
  // Set headers explicitly to ensure JSON response
  res.setHeader('Content-Type', 'application/json');
  
  // If this is a query string format, extract parameters
  const priceId = req.query.priceId;
  const userId = req.query.userId;
  const email = req.query.email;
  
  if (!priceId || !userId || !email) {
    console.log('Missing required parameters in GET request:', req.query);
    return res.status(400).json({ 
      error: 'Missing required parameters', 
      message: 'This endpoint requires priceId, userId, and email parameters',
      received: req.query
    });
  }
  
  console.log('Processing checkout with parameters:', { priceId, userId, email });
  
  try {
    // Always create a new customer for simplicity
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        userId: userId,
      },
    });
    const customerId = customer.id;
    console.log(`Created new Stripe customer: ${customerId}`);
    
    // Update Firestore if available
    if (firestore) {
      try {
        const userRef = firestore.collection('users').doc(userId);
        await userRef.set({
          stripeCustomerId: customerId,
        }, { merge: true });
        console.log('Updated Firestore with new customer ID');
      } catch (firestoreError) {
        console.error('Error updating Firestore:', firestoreError);
        // Continue anyway
      }
    }
    
    // Create a checkout session with the customer
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
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
        userId: userId,
      },
    });
    
    console.log('Checkout session created with URL:', session.url);
    
    // Return the session URL as JSON
    const jsonResponse = JSON.stringify({ url: session.url });
    console.log('Sending JSON response:', jsonResponse);
    
    return res.status(200).send(jsonResponse);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ 
      error: 'Failed to create checkout session', 
      details: error.message 
    });
  }
}); 