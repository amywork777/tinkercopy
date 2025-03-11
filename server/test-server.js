const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3002; // Use a different port

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Root endpoint for testing
app.get('/', (req, res) => {
  res.json({ message: 'Test server is running!' });
});

// Test endpoint
app.get('/api/test-endpoint', (req, res) => {
  res.json({ message: 'Test endpoint works!' });
});

// Test trial expiration endpoint
app.get('/api/test-trial-expiration/:userId', (req, res) => {
  const userId = req.params.userId;
  res.json({ 
    message: 'Test trial expiration endpoint works!',
    userId: userId,
    testStatus: 'SUCCESS',
    mockData: {
      isPro: false,
      trialActive: false,
      trialEndDate: new Date(Date.now() - 86400000).toISOString(), // yesterday
      subscriptionPlan: 'free'
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
}); 