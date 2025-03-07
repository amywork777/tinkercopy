/**
 * Script to help set up Google OAuth credentials for accessing Google Sheets API
 * 
 * Instructions:
 * 1. Create a project in Google Cloud Console (https://console.cloud.google.com/)
 * 2. Enable the Google Sheets API
 * 3. Create OAuth 2.0 credentials (Web application type)
 * 4. Set the authorized redirect URI to http://localhost:3001/oauth2callback
 * 5. Put your client ID and client secret in the .env file
 * 6. Run this script with: node setup-google-auth.cjs
 * 7. Follow the authorization URL it provides
 * 8. After authorization, you'll get a code - paste it when prompted
 * 9. The script will display a refresh token - add this to your .env file
 */

const { google } = require('googleapis');
const readline = require('readline');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Get credentials from .env or prompt for them
const clientId = process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file');
  process.exit(1);
}

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// Generate a URL for users to visit to authorize access
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/spreadsheets']
});

console.log('Authorize this app by visiting this URL:', authUrl);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for the code
rl.question('Enter the code from that page: ', async (code) => {
  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\nSuccessfully authenticated!');
    console.log('\nRefresh Token (add to .env file):');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    
    if (tokens.refresh_token) {
      // Update .env file if it exists
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Check if GOOGLE_REFRESH_TOKEN already exists
        if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
          // Replace existing value
          envContent = envContent.replace(
            /GOOGLE_REFRESH_TOKEN=.*/,
            `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
          );
        } else {
          // Add new value
          envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
        }
        
        // Write updated content back to .env
        fs.writeFileSync(envPath, envContent);
        console.log('\nAutomatically updated .env file with refresh token.');
      }
    } else {
      console.warn('\nNo refresh token received! Make sure access_type is set to "offline".');
    }
  } catch (error) {
    console.error('Error getting tokens:', error);
  } finally {
    rl.close();
  }
}); 