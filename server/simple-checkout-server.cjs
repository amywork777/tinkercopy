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

// Configure middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Special case for Stripe webhook to handle raw body
app.use('/api/webhook', express.raw({ type: 'application/json' }));

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
          firestoreOrder.stlFile.downloadLink = `${host}/api/download-stl/${orderId}`;
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

// Start the server
app.listen(PORT, () => {
  console.log(`Simple checkout server running at http://localhost:${PORT}`);
}); 