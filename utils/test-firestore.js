// Test script for verifying Firestore connectivity
import * as dotenv from 'dotenv';
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current directory for ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize Firebase Admin SDK
let firebaseApp;
try {
  // Get environment variables required for Firebase
  const privateKey = process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;
  
  if (!process.env.FIREBASE_PROJECT_ID || !privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('Missing required Firebase environment variables');
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
  });
  
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

// Get Firestore database
const db = admin.firestore();

// Test function to verify Firestore connectivity
async function testFirestore() {
  console.log('Testing Firestore connectivity...');
  
  try {
    // Create a test document
    const testData = {
      message: 'Firestore test successful',
      timestamp: admin.firestore.Timestamp.fromDate(new Date()),
      testId: `test-${Date.now()}`
    };
    
    // Add document to a test collection
    console.log('Creating test document...');
    const docRef = await db.collection('firestore-cli-tests').add(testData);
    console.log(`Document created with ID: ${docRef.id}`);
    
    // Read the document back
    console.log('Reading test document...');
    const docSnapshot = await docRef.get();
    
    if (docSnapshot.exists) {
      console.log('Document read successfully:');
      console.log(docSnapshot.data());
      
      // Delete the document
      console.log('Deleting test document...');
      await docRef.delete();
      console.log('Document deleted successfully');
      
      console.log('\n✅ FIRESTORE TEST SUCCESSFUL! Your Firestore database is working correctly.');
    } else {
      console.error('❌ ERROR: Document does not exist after creation.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ ERROR testing Firestore:', error);
    process.exit(1);
  }
}

// Run the test
testFirestore().then(() => {
  // Close Firebase connection and exit
  console.log('Test complete, exiting...');
  process.exit(0);
}); 