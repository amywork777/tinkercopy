/**
 * Test script to verify Firebase Firestore integration
 * 
 * This script will attempt to add a test document to the Firestore database
 * Run with: node test-firebase.cjs
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('Testing Firebase Firestore connection...');

// Firebase setup
let firebaseApp;
let db;

try {
  // If using service account credentials from env variable
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : null;
  
  console.log('Checking Firebase service account credentials:');
  console.log('- From env variable:', serviceAccount ? 'is set' : 'NOT SET');
  
  // Try to find service account file
  const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
  const hasServiceAccountFile = fs.existsSync(serviceAccountPath);
  
  console.log('- Service account file:', hasServiceAccountFile ? 'EXISTS' : 'NOT FOUND');
  
  if (!serviceAccount && !hasServiceAccountFile) {
    console.error('\nNo Firebase service account found!');
    console.error('Please set up Firebase by either:');
    console.error('1. Adding a firebase-service-account.json file in the server directory');
    console.error('   (copy firebase-service-account-template.json and fill in your credentials)');
    console.error('2. Setting the FIREBASE_SERVICE_ACCOUNT environment variable in .env');
    process.exit(1);
  }
  
  // Initialize Firebase app
  if (serviceAccount) {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: 'taiyaki-test1' // Your project ID
    });
    console.log('\nFirebase initialized with service account from environment variable');
  } else {
    firebaseApp = initializeApp({
      credential: cert(require(serviceAccountPath)),
      projectId: 'taiyaki-test1' // Your project ID
    });
    console.log('\nFirebase initialized with service account file');
  }
  
  // Initialize Firestore
  db = getFirestore();
  console.log('Firestore initialized successfully');
  
  // Run test
  testFirestore();
} catch (error) {
  console.error('\nError initializing Firebase:', error.message);
  if (error.message.includes('Failed to parse')) {
    console.error('Your service account JSON is malformed.');
  }
  process.exit(1);
}

// Function to test Firestore connection
async function testFirestore() {
  try {
    // Create test data
    const testData = {
      timestamp: new Date().toISOString(),
      source: 'Test Script',
      name: 'Test User',
      email: 'test@example.com',
      feedback: 'This is a test document to verify Firebase Firestore connection.',
      testRun: true
    };
    
    console.log('\nAttempting to write test document to Firestore...');
    
    // Write to Firestore - using the user-feedback collection
    const docRef = await db.collection('user-feedback').add(testData);
    
    console.log('\nTest successful!');
    console.log('Added document with ID:', docRef.id);
    
    // Also try to read it back to verify read access
    const docSnapshot = await docRef.get();
    
    if (docSnapshot.exists) {
      console.log('Document read back successfully:', docSnapshot.data());
      
      // Clean up test data
      console.log('\nCleaning up test document...');
      await docRef.delete();
      console.log('Test document deleted.');
    }
    
    console.log('\nFirebase Firestore integration is working correctly!');
  } catch (error) {
    console.error('\nError testing Firestore:', error);
    
    if (error.code === 'permission-denied') {
      console.error('\nPermission denied! Make sure your service account has proper permissions.');
      console.error('You need to set up Firestore security rules to allow write access.');
    }
  }
} 