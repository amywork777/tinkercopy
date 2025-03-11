const admin = require('firebase-admin');
const express = require('express');
const router = express.Router();

// Lightweight subscription endpoint that returns minimal data
// This is designed to be efficient and avoid ERR_INSUFFICIENT_RESOURCES errors
router.get('/optimize-subscription/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }
    
    console.log(`Optimized endpoint: Getting subscription for user: ${userId}`);
    
    // Get user data directly from Firestore
    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Return only essential subscription data to minimize response size
    const essentialData = {
      isPro: userData.isPro === true,
      subscriptionPlan: userData.subscriptionPlan || 'free',
      subscriptionStatus: userData.subscriptionStatus || 'none',
      modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 0,
      // Include minimal timestamp to help with caching issues
      timestamp: Date.now()
    };
    
    // Set cache headers to prevent caching issues
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    return res.status(200).json(essentialData);
  } catch (error) {
    console.error('Error in optimize-subscription endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 