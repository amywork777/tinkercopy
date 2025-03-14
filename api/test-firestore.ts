import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Testing Firestore connectivity');
    
    // Get Firebase admin and Firestore instance
    let adminInstance = (req as any).firebaseAdmin || getFirebaseAdmin();
    let db = (req as any).firestore || getFirestore();
    
    // Create a test document
    const testData = {
      message: 'Firestore is working!',
      timestamp: adminInstance.firestore.Timestamp.fromDate(new Date())
    };
    
    // Add the document to a test collection
    const docRef = await db.collection('firestore-test').add(testData);
    
    // Read the document back
    const docSnapshot = await docRef.get();
    const data = docSnapshot.data();
    
    // Clean up - delete the test document
    await docRef.delete();
    
    // Return success with retrieved data
    return res.status(200).json({
      success: true,
      message: 'Firestore connection successful',
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error testing Firestore:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to test Firestore connection'
    });
  }
} 