/**
 * Test script to verify Google Sheets integration
 * 
 * This script will attempt to append a test row to the configured Google Sheet
 * Run with: node test-sheets.cjs
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Google Sheets setup
const SPREADSHEET_ID = '19DdZtMAoL8U70HllroNii5r_OgZmbZNdUHBjWJ3R7_0';

// Verify credentials
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

console.log('Checking Google Sheets API credentials:');
console.log('- Client ID:', clientId ? 'is set' : 'NOT SET');
console.log('- Client Secret:', clientSecret ? 'is set' : 'NOT SET');
console.log('- Redirect URI:', redirectUri || 'NOT SET');
console.log('- Refresh Token:', refreshToken ? 'is set' : 'NOT SET');

if (!clientId || !clientSecret || !refreshToken) {
  console.error('\nMissing required credentials. Please complete the OAuth setup first:');
  console.error('1. Create a project in Google Cloud Console');
  console.error('2. Enable the Google Sheets API');
  console.error('3. Create OAuth credentials');
  console.error('4. Run setup-google-auth.cjs to get your refresh token');
  process.exit(1);
}

// Function to append test data to the sheet
async function testSheetAppend() {
  try {
    // Create a new OAuth client
    const auth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    auth.setCredentials({
      refresh_token: refreshToken
    });

    // Create Google Sheets instance
    const sheets = google.sheets({ version: 'v4', auth });

    // Format current date and time
    const now = new Date();
    const timestamp = now.toISOString();

    // Prepare test values to append
    const testValues = [
      [
        timestamp,
        'Test Source',
        'Test Name',
        'test@example.com',
        'This is a test feedback entry from the test script.'
      ]
    ];

    console.log('\nAttempting to append test data to Google Sheet...');

    // Append to the spreadsheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: testValues
      }
    });

    console.log('\nTest successful!');
    console.log('Updates:', response.data.updates);
    console.log('\nYou should now see a test entry in your Google Sheet.');
    
  } catch (error) {
    console.error('\nError accessing Google Sheets:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.error('\nYour refresh token may have expired or been revoked.');
      console.error('Please run setup-google-auth.cjs again to get a new token.');
    }
    
    if (error.message.includes('not found')) {
      console.error('\nSpreadsheet not found. Please check your spreadsheet ID.');
      console.error('Current spreadsheet ID:', SPREADSHEET_ID);
    }
  }
}

// Run the test
testSheetAppend(); 