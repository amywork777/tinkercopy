import * as admin from 'firebase-admin';

// Track if Firebase has been initialized
let firebaseInitialized = false;

/**
 * Get the Firebase Admin instance, initializing it if necessary
 * This ensures we only initialize Firebase once across all API routes
 */
export function getFirebaseAdmin() {
  if (!firebaseInitialized && !admin.apps.length) {
    try {
      // Try to load service account from environment variable
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      // Add validation for required environment variables
      if (!privateKey) {
        console.error('Firebase private key is missing or invalid');
      }
      
      if (!process.env.FIREBASE_PROJECT_ID) {
        console.error('Firebase project ID is missing');
      }
      
      if (!process.env.FIREBASE_CLIENT_EMAIL) {
        console.error('Firebase client email is missing');
      }
      
      const credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey || '',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      });
      
      admin.initializeApp({
        credential: credential,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
      });
      
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      throw error; // Re-throw to allow calling code to handle
    }
  } else if (firebaseInitialized) {
    console.log('Using existing Firebase Admin SDK instance');
  } else if (admin.apps.length) {
    firebaseInitialized = true;
    console.log('Using existing Firebase Admin app');
  }
  
  return admin;
}

/**
 * Get the Firestore instance, initializing Firebase if necessary
 */
export function getFirestore() {
  const adminInstance = getFirebaseAdmin();
  return adminInstance.firestore();
}

/**
 * Get the Firebase Auth instance, initializing Firebase if necessary
 */
export function getAuth() {
  const adminInstance = getFirebaseAdmin();
  return adminInstance.auth();
}

/**
 * Get the Firebase Storage instance, initializing Firebase if necessary
 */
export function getStorage() {
  const adminInstance = getFirebaseAdmin();
  return adminInstance.storage();
}

export default {
  getFirebaseAdmin,
  getFirestore,
  getAuth,
  getStorage
}; 