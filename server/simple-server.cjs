const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Manually load environment variables if .env file exists
try {
  const envPath = path.join(__dirname, '.env');
  console.log('Looking for .env file at:', envPath);
  
  if (fs.existsSync(envPath)) {
    console.log('.env file exists, loading it');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Simple parser for the .env file
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    
    console.log('Environment variables loaded from .env file');
  } else {
    console.log('No .env file found at', envPath);
  }
} catch (error) {
  console.error('Error loading .env file:', error);
}

// Set email credentials directly if not already in environment
if (!process.env.EMAIL_USER) {
  process.env.EMAIL_USER = 'taiyaki.orders@gmail.com';
  console.log('Set EMAIL_USER directly in code');
}

if (!process.env.EMAIL_PASSWORD) {
  process.env.EMAIL_PASSWORD = 'lfrq katt exfz jzoh';
  console.log('Set EMAIL_PASSWORD directly in code');
}

// Firebase configuration
let firebaseApp;
let db;

try {
  // If using service account credentials directly
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : null;
  
  // Check if we have the required service account info
  if (serviceAccount) {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: 'taiyaki-test1' // Your project ID
    });
    console.log('Firebase initialized with service account credentials');
  } else {
    // Try to read from service account file if it exists
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      firebaseApp = initializeApp({
        credential: cert(require(serviceAccountPath)),
        projectId: 'taiyaki-test1' // Your project ID
      });
      console.log('Firebase initialized with service account file');
    } else {
      console.warn('No Firebase service account found. Feedback storage will not work.');
    }
  }
  
  // Initialize Firestore if Firebase initialized successfully
  if (firebaseApp) {
    db = getFirestore();
    console.log('Firestore initialized successfully');
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
}

// Create express app
const app = express();

// Configure middleware with more permissive CORS settings
app.use(cors({
  origin: true, // Allow any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Parse JSON and URL-encoded bodies
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Request received`);
  next();
});

// Explicit handling for OPTIONS requests (CORS preflight)
app.options('*', cors());

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  return res.status(200).json({ success: true, message: 'Simple server is running' });
});

// Test Firebase config endpoint
app.get('/api/test-firebase-config', (req, res) => {
  console.log('Firebase config test endpoint hit');
  
  return res.status(200).json({ 
    success: true, 
    firebaseConfig: {
      initialized: !!firebaseApp,
      firestoreAvailable: !!db
    },
    envVarsLoaded: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || 'not set'
    }
  });
});

// Function to save feedback to Firebase Firestore
async function saveToFirestore(data) {
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  
  // Create a reference to the feedback collection
  const feedbackRef = db.collection('user-feedback'); // Changed to use a dedicated collection for feedback
  
  // Add a timestamp if not provided
  const feedbackData = {
    ...data,
    timestamp: data.timestamp || new Date().toISOString()
  };
  
  // Add the document to Firestore
  const docRef = await feedbackRef.add(feedbackData);
  console.log('Feedback saved to Firestore with ID:', docRef.id);
  
  return {
    id: docRef.id,
    ...feedbackData
  };
}

// Function to send email as fallback
async function sendEmailFallback(data) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'taiyaki.orders@gmail.com',
      pass: process.env.EMAIL_PASSWORD || 'lfrq katt exfz jzoh'
    }
  });
  
  const mailOptions = {
    from: 'taiyaki.orders@gmail.com',
    to: 'taiyaki.orders@gmail.com',
    subject: `Feedback from ${data.sourceDomain}`,
    text: `
Source: ${data.sourceDomain}
Name: ${data.name}
Email: ${data.email}

Feedback:
${data.feedback}
    `,
    html: `
<p><strong>Source:</strong> ${data.sourceDomain}</p>
<p><strong>Name:</strong> ${data.name}</p>
<p><strong>Email:</strong> ${data.email}</p>
<p><strong>Feedback:</strong></p>
<p>${data.feedback.replace(/\n/g, '<br>')}</p>
    `
  };
  
  return transporter.sendMail(mailOptions);
}

// Feedback submission endpoint
app.post('/api/submit-feedback', async (req, res) => {
  try {
    console.log('Received feedback submission request');
    
    // Log the request headers - this helps debug CORS issues
    console.log('Request headers:', req.headers);
    
    // Log the request body
    console.log('Request body:', req.body);
    
    const { name, email, feedback } = req.body;
    
    // Validate all required fields
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!feedback) {
      return res.status(400).json({ error: 'Feedback is required' });
    }
    
    // Determine the source domain from request headers
    let sourceDomain = 'Unknown Source';
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    
    if (origin) {
      try {
        sourceDomain = new URL(origin).hostname;
      } catch (e) {
        console.error('Error parsing origin URL:', e);
      }
    } else if (referer) {
      try {
        sourceDomain = new URL(referer).hostname;
      } catch (e) {
        console.error('Error parsing referer URL:', e);
      }
    }
    
    const feedbackData = {
      sourceDomain,
      name,
      email,
      feedback,
      timestamp: new Date().toISOString(),
      createdAt: new Date()
    };
    
    // Try to save to Firebase
    try {
      if (!db) {
        throw new Error('Firebase Firestore not initialized');
      }
      
      const savedData = await saveToFirestore(feedbackData);
      console.log('Feedback saved to Firebase successfully');
      
      // Send success response
      return res.status(200).json({ 
        success: true, 
        message: 'Feedback submitted successfully',
        savedToFirebase: true,
        feedbackId: savedData.id
      });
    } catch (firebaseError) {
      console.error('Error saving to Firebase:', firebaseError);
      
      // Try email as fallback
      try {
        console.log('Trying email fallback...');
        const info = await sendEmailFallback(feedbackData);
        console.log('Email sent successfully as fallback:', info.response);
        
        return res.status(200).json({ 
          success: true, 
          message: 'Feedback submitted successfully via email fallback',
          savedToFirebase: false,
          emailSent: true
        });
      } catch (emailError) {
        console.error('Email fallback also failed:', emailError);
        return res.status(500).json({ 
          error: 'Failed to save feedback',
          details: 'Both Firebase and email fallback failed',
          savedToFirebase: false,
          emailSent: false
        });
      }
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ 
      error: 'Failed to submit feedback', 
      details: String(error),
      savedToFirebase: false,
      emailSent: false
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const DEBUG = process.env.DEBUG || false;

console.log(`Running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
if (DEBUG) {
  console.log(`DEBUG mode enabled - will log extra information for troubleshooting`);
}

// Add DEBUG middleware to log request headers and CORS details
if (DEBUG) {
  app.use((req, res, next) => {
    console.log('DEBUG - Request headers:', req.headers);
    console.log('DEBUG - Origin:', req.headers.origin);
    console.log('DEBUG - Host:', req.headers.host);
    
    // Log CORS headers in the response
    const originalSend = res.send;
    res.send = function() {
      console.log('DEBUG - Response headers:', res.getHeaders());
      return originalSend.apply(this, arguments);
    };
    
    next();
  });
}

const server = app.listen(PORT, () => {
  console.log(`Simple server running at http://localhost:${PORT}`);
  console.log(`Firebase initialized: ${!!firebaseApp}`);
  console.log(`Firestore available: ${!!db}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use, trying ${PORT + 1}...`);
    const newPort = PORT + 1;
    app.listen(newPort, () => {
      console.log(`Simple server running at http://localhost:${newPort}`);
      console.log(`Firebase initialized: ${!!firebaseApp}`);
      console.log(`Firestore available: ${!!db}`);
    });
  } else {
    console.error('Server error:', err);
  }
}); 