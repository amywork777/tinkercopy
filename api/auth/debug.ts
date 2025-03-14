import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    // Try to load service account from environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    
    console.log('Firebase Admin SDK initialized in debug endpoint');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Define types for the user data
interface UserDebugInfo {
  id: string;
  email: string;
  createdAt: string;
  isPro: boolean;
  trialActive: boolean;
}

/**
 * Debugging endpoint to verify Firebase configuration and auth status
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set appropriate CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Get environment info
    const envInfo = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'not set',
      hasPrivateKey: process.env.FIREBASE_PRIVATE_KEY ? 'yes (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'no',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'not set',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'not set',
      apiRunning: true
    };

    // Check if we can access Firestore
    let firestoreStatus = 'unknown';
    let userCount = 0;
    let latestUsers: UserDebugInfo[] = [];
    
    try {
      const db = admin.firestore();
      const usersRef = db.collection('users');
      
      // Try to get a list of up to 5 users
      const snapshot = await usersRef.limit(5).get();
      userCount = snapshot.size;
      
      // Get latest 5 users with creation time
      const allUsersSnapshot = await usersRef
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      
      latestUsers = allUsersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email || 'no email',
          createdAt: data.createdAt ? 
            (typeof data.createdAt.toDate === 'function' ? 
              data.createdAt.toDate().toISOString() : 
              'timestamp not convertible') : 
            'no timestamp',
          isPro: data.isPro || false,
          trialActive: data.trialActive || false
        };
      });
      
      firestoreStatus = 'connected';
    } catch (firestoreError) {
      console.error('Firestore access error:', firestoreError);
      firestoreStatus = `error: ${firestoreError.message}`;
    }
    
    // Check if we can access Authentication
    let authStatus = 'unknown';
    let authUserCount = 0;
    
    try {
      const auth = admin.auth();
      const userResult = await auth.listUsers(5);
      authUserCount = userResult.users.length;
      authStatus = 'connected';
    } catch (authError) {
      console.error('Auth access error:', authError);
      authStatus = `error: ${authError.message}`;
    }
    
    // Return debug info
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envInfo,
      firestore: {
        status: firestoreStatus,
        userCount,
        latestUsers
      },
      auth: {
        status: authStatus,
        userCount: authUserCount
      }
    });
  } catch (error: any) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error in debug endpoint',
      error: error.message,
      stack: error.stack
    });
  }
} 