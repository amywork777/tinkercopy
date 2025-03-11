import fetch from 'node-fetch';

console.log('Checking if server is running on port 3001...');

// Use async/await and fetch for cleaner code
async function checkServer() {
  try {
    // Check if the server is running
    console.log('Testing server connection...');
    const serverResponse = await fetch('http://localhost:3001/', {
      method: 'GET',
      timeout: 5000
    });
    console.log(`Server responded with status: ${serverResponse.status}`);
    
    // Check if the endpoint is available
    console.log('Checking if test-trial-expiration endpoint is available...');
    const endpointResponse = await fetch('http://localhost:3001/api/test-trial-expiration/test-user-id', {
      method: 'GET',
      timeout: 5000
    });
    
    console.log(`Endpoint responded with status: ${endpointResponse.status}`);
    
    // Get the response text
    const responseText = await endpointResponse.text();
    console.log('Response data:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
    
  } catch (error) {
    console.error('Error checking server or endpoint:', error.message);
    console.log('Make sure the server is running on port 3001');
  }
}

// Run the check
checkServer(); 