const express = require('express');
const cors = require('cors');
const { Stripe } = require('stripe');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK if not already initialized
try {
  if (!admin.apps.length) {
    // If you have a service account file
    const serviceAccount = require('./firebase-service-account.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'model-fusion-studio.appspot.com'
    });
    
    console.log('Firebase Admin SDK initialized successfully');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  // Continue without Firebase - will fallback to memory storage
}

// Create Firestore references if available
let firestore;
try {
  firestore = admin.firestore();
  console.log('Firestore connection established');
} catch (error) {
  console.error('Failed to connect to Firestore:', error);
}

// Initialize email service
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Special case for Stripe webhook to handle raw body
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// Create a directory for temporary STL files
const stlFilesDir = path.join(__dirname, 'temp-stl-files');
if (!fs.existsSync(stlFilesDir)) {
  fs.mkdirSync(stlFilesDir, { recursive: true });
  console.log(`Created STL files directory: ${stlFilesDir}`);
}

// In-memory storage for quick lookups
const stlFileStorage = new Map();
const orderStorage = new Map();

// Endpoint to store an STL file temporarily
app.post('/api/stl-files', (req, res) => {
  try {
    const { stlData, fileName } = req.body;
    
    if (!stlData) {
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
    if (typeof stlData === 'string' && stlData.startsWith('data:')) {
      const matches = stlData.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length >= 3) {
        fileContent = Buffer.from(matches[2], 'base64');
      } else {
        fileContent = Buffer.from(stlData);
      }
    } else {
      fileContent = Buffer.from(stlData);
    }
    
    // Write the file
    fs.writeFileSync(filePath, fileContent);
    console.log(`Stored STL file at: ${filePath}`);
    
    // Store the metadata in memory
    stlFileStorage.set(fileId, {
      filePath,
      fileName: safeName,
      createdAt: new Date().toISOString()
    });
    
    // Generate the public URL
    const publicUrl = `http://localhost:${process.env.PORT || 3001}/api/stl-files/${fileId}`;
    
    return res.status(200).json({
      success: true,
      fileId,
      url: publicUrl
    });
  } catch (error) {
    console.error('Error storing STL file:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to store STL file'
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

// Handle successful payment and store order
async function handleSuccessfulPayment(session) {
  try {
    console.log('Processing successful payment for session:', session.id);
    
    // Extract metadata from the session
    const { 
      modelName, 
      color, 
      quantity, 
      finalPrice, 
      stlFileName, 
      stlDownloadUrl
    } = session.metadata || {};
    
    // Create order ID
    const orderId = `order-${Date.now()}-${session.id.substring(0, 6)}`;
    
    // Get customer information
    let customerName = 'Customer';
    let customerEmail = '';
    
    if (session.customer_details) {
      customerName = session.customer_details.name || 'Customer';
      customerEmail = session.customer_details.email || '';
    }
    
    // Create order document
    const orderData = {
      orderId,
      sessionId: session.id,
      customerId: session.customer || null,
      customerName,
      customerEmail,
      modelName: modelName || 'Unknown Model',
      color: color || 'Unknown Color',
      quantity: parseInt(quantity || '1', 10),
      finalPrice: parseFloat(finalPrice || '0'),
      paymentId: session.payment_intent || session.id,
      paymentStatus: session.payment_status || 'paid',
      stlFileName: stlFileName || 'model.stl',
      stlFileUrl: stlDownloadUrl || '',
      orderDate: new Date().toISOString(),
      shippingAddress: session.shipping_details?.address || null,
      billingAddress: session.customer_details?.address || null,
      fulfillmentStatus: 'pending',
      notes: ''
    };
    
    // Store the order in Firestore if available, otherwise in memory
    if (firestore) {
      try {
        await firestore.collection('orders').doc(orderId).set(orderData);
        console.log(`Order ${orderId} stored in Firestore`);
      } catch (firestoreError) {
        console.error('Error storing order in Firestore:', firestoreError);
        // Fallback to memory storage
        orderStorage.set(orderId, orderData);
        console.log(`Order ${orderId} stored in memory (Firestore failed)`);
      }
    } else {
      // Store in memory if Firestore is not available
      orderStorage.set(orderId, orderData);
      console.log(`Order ${orderId} stored in memory`);
    }
    
    // Send email notification
    if (process.env.EMAIL_USER) {
      try {
        await sendOrderNotificationEmail(orderData);
        console.log(`Order notification email sent for order ${orderId}`);
        
        if (customerEmail) {
          await sendCustomerConfirmationEmail(orderData);
          console.log(`Customer confirmation email sent to ${customerEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }
    }
    
    console.log(`Order ${orderId} processing completed successfully`);
    return orderData;
  } catch (error) {
    console.error('Error processing successful payment:', error);
    return null;
  }
}

// Send order notification email to the business
async function sendOrderNotificationEmail(orderDetails) {
  const businessEmail = process.env.BUSINESS_EMAIL || process.env.EMAIL_USER;
  
  if (!businessEmail) {
    console.error('No business email configured for order notifications');
    return false;
  }
  
  // Format address for display
  const formatAddress = (address) => {
    if (!address) return 'No address provided';
    
    return [
      address.line1,
      address.line2,
      `${address.city}, ${address.state} ${address.postal_code}`,
      address.country
    ].filter(Boolean).join('\n');
  };
  
  // Prepare email content
  const subject = `New 3D Print Order: ${orderDetails.orderId}`;
  
  const htmlContent = `
    <h1>New 3D Print Order</h1>
    <p>A new order has been placed:</p>
    
    <h2>Order Details</h2>
    <ul>
      <li><strong>Order ID:</strong> ${orderDetails.orderId}</li>
      <li><strong>Model:</strong> ${orderDetails.modelName}</li>
      <li><strong>Color:</strong> ${orderDetails.color}</li>
      <li><strong>Quantity:</strong> ${orderDetails.quantity}</li>
      <li><strong>Price:</strong> $${orderDetails.finalPrice.toFixed(2)}</li>
    </ul>
    
    <h2>Customer Information</h2>
    <ul>
      <li><strong>Name:</strong> ${orderDetails.customerName}</li>
      <li><strong>Email:</strong> ${orderDetails.customerEmail}</li>
    </ul>
    
    <h2>Payment Information</h2>
    <ul>
      <li><strong>Payment ID:</strong> ${orderDetails.paymentId}</li>
      <li><strong>Amount:</strong> $${orderDetails.finalPrice.toFixed(2)}</li>
    </ul>
    
    <h2>Shipping Address</h2>
    <pre>${formatAddress(orderDetails.shippingAddress)}</pre>
    
    ${orderDetails.stlFileUrl ? `
    <h2>STL File</h2>
    <p><strong>Filename:</strong> ${orderDetails.stlFileName}</p>
    <p><strong>Download Link:</strong> <a href="${orderDetails.stlFileUrl}">${orderDetails.stlFileUrl}</a></p>
    ` : ''}
  `;
  
  try {
    // Send email
    const info = await transporter.sendMail({
      from: `"3D Print Orders" <${process.env.EMAIL_USER}>`,
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
      <li><strong>Model:</strong> ${orderDetails.modelName}</li>
      <li><strong>Color:</strong> ${orderDetails.color}</li>
      <li><strong>Quantity:</strong> ${orderDetails.quantity}</li>
      <li><strong>Total:</strong> $${orderDetails.finalPrice.toFixed(2)}</li>
    </ul>
    
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

// Create checkout session endpoint
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { modelName, color, quantity, finalPrice, stlFileData, stlFileName, stlDownloadUrl } = req.body;
    
    if (!modelName || !color || !quantity || !finalPrice) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required checkout information' 
      });
    }

    // Format STL information for the description
    let stlInfo = stlFileName ? ` - File: ${stlFileName}` : '';
    
    // Add a download link if available
    if (stlDownloadUrl) {
      stlInfo += `\n\nSTL FILE DOWNLOAD LINK: ${stlDownloadUrl}`;
    }

    // Create a product for this specific order
    const product = await stripe.products.create({
      name: `3D Print: ${modelName}`,
      description: `Custom 3D print - ${modelName} in ${color} (Qty: ${quantity})${stlInfo}`,
      metadata: {
        stlFileName: stlFileName || 'unknown.stl',
        hasStlData: stlFileData ? 'true' : 'false',
        stlDownloadUrl: stlDownloadUrl || ''
      }
    });

    // Create a price for the product
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(finalPrice * 100), // Convert to cents
      currency: 'usd',
    });

    // Update the success_url to use a dynamic host
    const host = req.headers.origin || 'http://localhost:5174';
    
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
        stlFileName: stlFileName || 'unknown.stl',
        stlDownloadUrl: stlDownloadUrl || '',
      },
      // Enable billing address collection to get email and address for shipping
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
        }
      } catch (firestoreError) {
        console.error('Error querying Firestore:', firestoreError);
      }
    }
    
    // If not found in Firestore, check memory storage
    if (!orderDoc) {
      // Check memory storage
      for (const [_, order] of orderStorage.entries()) {
        if (order.sessionId === session_id) {
          orderDoc = order;
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
    
    // Create a temporary order object
    const orderDetails = {
      orderId: `temp-${session.id.substring(0, 8)}`,
      sessionId: session.id,
      modelName: metadata.modelName || 'Custom 3D Print',
      color: metadata.color || 'Unknown',
      quantity: parseInt(metadata.quantity || '1', 10),
      finalPrice: amount_total / 100, // Convert from cents to dollars
      paymentStatus: payment_status,
      stlFileUrl: metadata.stlDownloadUrl || '',
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

// Start the server
app.listen(PORT, () => {
  console.log(`Simple checkout server running at http://localhost:${PORT}`);
}); 