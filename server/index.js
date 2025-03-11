const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

// Import routes
const pricingRoutes = require('./api/pricing');

// Initialize Firebase Admin SDK
let firebaseApp;
let db;

// Initialize Firebase with service account credentials
try {
  const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  };

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
  });
  
  console.log('Firebase initialized with service account credentials');
  
  // Initialize Firestore
  db = getFirestore();
  console.log('Firestore initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
}

// Create Express app
const app = express();

// Middleware
app.use(morgan('dev'));
app.use(cors());

// Special case for Stripe webhook to handle raw body
app.use('/api/pricing/webhook', express.raw({ type: 'application/json' }));

// Body parser for all other routes
app.use(bodyParser.json());

// API routes
app.use('/api/pricing', pricingRoutes);

// Add endpoint to track downloads
app.post('/api/track-download', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get user from database
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Update the download count in the database
    const currentDownloads = userData.downloadsThisMonth || 0;
    const updatedData = {
      downloadsThisMonth: currentDownloads + 1,
      lastDownloadDate: new Date().toISOString()
    };
    
    await userRef.update(updatedData);
    
    // Return the updated count
    res.json({
      downloadsThisMonth: currentDownloads + 1
    });
  } catch (error) {
    console.error('Error tracking download:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a monthly reset function for model generations
const resetMonthlyLimits = async () => {
  if (!db) {
    console.error('Firestore not initialized, cannot reset monthly limits');
    return;
  }
  
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    console.log(`Resetting monthly limits for ${currentMonth}`);
    
    // Get all users
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    if (snapshot.empty) {
      console.log('No users found to reset limits');
      return;
    }
    
    const batch = db.batch();
    let updateCount = 0;
    
    snapshot.forEach(doc => {
      const userData = doc.data();
      
      // Skip if already reset this month
      if (userData.lastResetDate === currentMonth) {
        return;
      }
      
      // Set appropriate limits based on subscription
      const modelLimit = userData.isPro ? Infinity : 0;
      
      batch.update(doc.ref, {
        modelsGeneratedThisMonth: 0,
        modelsRemainingThisMonth: modelLimit,
        downloadsThisMonth: 0, // Reset downloads count too
        lastResetDate: currentMonth,
      });
      
      updateCount++;
    });
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`Reset limits for ${updateCount} users`);
    } else {
      console.log('No users needed limit resets');
    }
  } catch (error) {
    console.error('Error resetting monthly limits:', error);
  }
};

// Check if one day has passed and reset is needed (daily check for new month)
setInterval(async () => {
  const now = new Date();
  if (now.getDate() === 1 && now.getHours() === 0) {
    console.log('First day of month detected, resetting limits');
    await resetMonthlyLimits();
  }
}, 60 * 60 * 1000); // Check every hour

// Add endpoint to decrement model count
app.post('/api/decrement-model-count', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get user from database
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Pro users don't need to decrement
    if (userData.isPro) {
      return res.json({
        modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 0,
        modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
      });
    }
    
    // Check if user has remaining models
    if (userData.modelsRemainingThisMonth <= 0) {
      return res.status(403).json({ 
        error: 'No remaining models',
        modelsRemainingThisMonth: 0,
        modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
      });
    }
    
    // Update the counts in the database
    const updatedData = {
      modelsRemainingThisMonth: Math.max(0, (userData.modelsRemainingThisMonth || 0) - 1),
      modelsGeneratedThisMonth: (userData.modelsGeneratedThisMonth || 0) + 1,
    };
    
    await userRef.update(updatedData);
    
    // Return the updated counts
    res.json(updatedData);
  } catch (error) {
    console.error('Error decrementing model count:', error);
    res.status(500).json({ error: error.message });
  }
});

// Static files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Firebase initialized: ${!!firebaseApp}`);
  console.log(`Firestore available: ${!!db}`);
}); 