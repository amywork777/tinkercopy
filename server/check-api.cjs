const http = require('http');

console.log('Checking if server is running on port 3001...');

// Function to send an HTTP request
function sendRequest(options, callback) {
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      callback(null, res, data);
    });
  });
  
  req.on('error', (err) => {
    callback(err);
  });
  
  req.end();
}

// Check if server is running
sendRequest({
  method: 'GET',
  hostname: 'localhost',
  port: 3001,
  path: '/',
  timeout: 5000
}, (err, res, data) => {
  if (err) {
    console.error('Error connecting to server:', err.message);
    console.log('Make sure the server is running on port 3001');
    return;
  }
  
  console.log(`Server responded with status: ${res.statusCode}`);
  
  // Check if endpoint exists
  console.log('Checking if test-trial-expiration endpoint is available...');
  sendRequest({
    method: 'GET',
    hostname: 'localhost',
    port: 3001,
    path: '/api/test-trial-expiration/test-user-id',
    timeout: 5000
  }, (err, res, data) => {
    if (err) {
      console.error('Error checking endpoint:', err.message);
      return;
    }
    
    console.log(`Endpoint responded with status: ${res.statusCode}`);
    console.log('Response data:', data.substring(0, 200) + (data.length > 200 ? '...' : ''));
    
    // If we got a 404, let's also check without the /api prefix
    if (res.statusCode === 404) {
      console.log('Endpoint not found with /api prefix. Trying without /api prefix...');
      sendRequest({
        method: 'GET',
        hostname: 'localhost',
        port: 3001,
        path: '/test-trial-expiration/test-user-id',
        timeout: 5000
      }, (err, res, data) => {
        if (err) {
          console.error('Error checking alternative endpoint:', err.message);
          return;
        }
        
        console.log(`Alternative endpoint responded with status: ${res.statusCode}`);
        console.log('Response data:', data.substring(0, 200) + (data.length > 200 ? '...' : ''));
      });
    }
  });
}); 