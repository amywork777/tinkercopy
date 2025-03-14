import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Initialize Firebase Admin SDK if it hasn't been initialized already
let initialized = false;

/**
 * Get a Firebase Admin instance to use
 * This ensures we only initialize Firebase Admin once
 */
export function getFirebaseAdmin() {
  if (initialized) {
    return admin;
  }

  if (admin.apps.length > 0) {
    initialized = true;
    return admin;
  }

  try {
    // Get the Firebase configuration from environment variables
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;
    
    if (!process.env.FIREBASE_PROJECT_ID || !privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
      throw new Error('Missing required Firebase configuration environment variables');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
    });
    
    console.log('Firebase Admin SDK initialized with environment variables');
    initialized = true;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw error;
  }

  return admin;
}

export const getFirestore = () => {
  const adminInstance = getFirebaseAdmin();
  return adminInstance.firestore();
};

export const getStorage = () => {
  const adminInstance = getFirebaseAdmin();
  return adminInstance.storage().bucket();
};

export default getFirebaseAdmin; 