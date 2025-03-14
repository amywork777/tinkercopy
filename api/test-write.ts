import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin, getFirestore } from '../utils/firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Initialize Firebase using the utility function
    const admin = getFirebaseAdmin();
    const db = getFirestore();
    
    const testDoc = {
      message: 'Test write successful',
      timestamp: new Date().toISOString(),
      serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Attempt to write to a test collection
    const writeResult = await db.collection('test-writes').add(testDoc);
    
    console.log(`Test document written with ID: ${writeResult.id}`);
    
    return res.status(200).json({
      success: true,
      message: 'Test write successful',
      documentId: writeResult.id,
      timestamp: testDoc.timestamp
    });
  } catch (error) {
    console.error('Error in test write:', error);
    return res.status(500).json({
      success: false,
      message: 'Test write failed',
      error: error.message
    });
  }
} 