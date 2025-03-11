const express = require('express');
const router = express.Router();

// Simple status check endpoint to verify server health
// This endpoint is designed to be extremely lightweight with minimal resource usage
router.get('/status', async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    
    // Return server status and basic resource information
    res.status(200).json({
      status: 'ok',
      version: '1.0.0',
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      stripeMode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test',
      memoryUsage: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      },
      uptime: `${Math.round(process.uptime())} seconds`
    });
  } catch (error) {
    console.error('Error in status endpoint:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

module.exports = router; 