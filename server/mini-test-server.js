// Simple HTTP server without Express
const http = require('http');

const PORT = 3003; // Use a port that's definitely not in use

// Create a server that always returns a successful response
const server = http.createServer((req, res) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  
  // Set CORS headers to allow requests from anywhere
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  
  // Parse the URL
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // Test endpoint that returns a successful response for any path
  if (url.pathname.startsWith('/api/test-trial-expiration/')) {
    // Extract the user ID from the URL
    const userId = url.pathname.split('/').pop();
    
    // Set the content type to JSON
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    
    // Create a simple response object
    const response = {
      testStatus: 'SUCCESS',
      message: 'This is a simplified test server that always succeeds',
      userId: userId,
      mockData: {
        isPro: false,
        trialActive: false,
        trialEndDate: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago instead of 24 hours
        subscriptionPlan: 'free',
        currentTime: new Date().toISOString()
      }
    };
    
    // Send the response
    res.end(JSON.stringify(response));
    return;
  }
  
  // For any other path, send a simple message
  if (url.pathname === '/') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ message: 'Mini test server is running' }));
    return;
  }
  
  // Default 404 response
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Mini test server running at http://localhost:${PORT}`);
}); 