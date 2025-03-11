import { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

// Initialize Firebase Admin if it hasn't been initialized
let firebaseApp: admin.app.App;
try {
  firebaseApp = admin.app();
} catch (e) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '', 'base64').toString()
  );

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  
  try {
    // Get environment details
    const environment = process.env.VERCEL_ENV || 'unknown';
    const region = process.env.VERCEL_REGION || 'unknown';
    
    // Check Firestore connection
    const db = admin.firestore();
    const firestoreTest = await db.collection('healthchecks').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      environment,
      region
    });
    
    // Delete the test document
    await firestoreTest.delete();
    
    // Success response with timing information
    res.status(200).json({
      status: 'healthy',
      environment,
      region,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      message: 'API is working correctly',
      firebase: {
        status: 'connected',
        app: firebaseApp.name
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    // Error response
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    });
  }
} 