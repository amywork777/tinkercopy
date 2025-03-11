import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK if it hasn't been initialized already
try {
  if (!admin.apps || admin.apps.length === 0) {
    // Attempt to load service account file
    try {
      // Get the directory name (for ESM)
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      
      // Attempt to load the service account file
      const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
      // Dynamic import for ESM compatibility
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const serviceAccount = require('./firebase-service-account.json');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
      });
      
      console.log('Firebase Admin SDK initialized with service account file');
    } catch (fileError) {
      console.warn('Could not load service account file, using environment variables instead:', fileError.message);
      
      // Use environment variables as fallback
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: privateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'taiyaki-test1.firebasestorage.app'
      });
      
      console.log('Firebase Admin SDK initialized with environment variables');
    }
  }
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
}

export const firestore = admin.firestore();
export const storage = admin.storage().bucket();
export default admin; 