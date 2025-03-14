import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize Firebase Admin
const admin = getFirebaseAdmin();
const db = getFirestore();

console.log('Firebase Admin initialized in API server');

// Create Express app with a different port
const app = express();
const PORT = process.env.API_PORT || 4001; // Use a different port to avoid conflicts

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Helper function to recursively find API files
function findApiFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      // If it's a directory but not 'node_modules' or '.next'
      if (file !== 'node_modules' && file !== '.next' && file !== 'dist') {
        results = results.concat(findApiFiles(filePath));
      }
    } else {
      // Check if it's a TypeScript API file
      if (file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.test.ts')) {
        results.push(filePath);
      }
    }
  });
  
  return results;
}

// Function to load API routes
async function loadApiRoutes() {
  try {
    const apiDir = path.join(process.cwd(), 'api');
    const apiFiles = findApiFiles(apiDir);
    
    // Register each API route as Express route handlers
    for (const file of apiFiles) {
      try {
        // Convert the file path to a route path
        let routePath = file
          .replace(apiDir, '')
          .replace(/\.ts$/, '')
          .replace(/\\/g, '/');
        
        // Skip index files and create proper route paths
        if (routePath.endsWith('/index')) {
          routePath = routePath.replace('/index', '');
        }
        
        // Handle dynamic routes
        routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
        
        // Create the full route path
        const fullRoutePath = `/api${routePath}`;
        console.log(`Registering route: ${fullRoutePath}`);

        // Register route handlers based on the route path
        if (fullRoutePath === '/api/webhook') {
          app.post(fullRoutePath, async (req: Request, res: Response) => {
            try {
              // Add admin to the req object so handlers can use it
              (req as any).firebaseAdmin = admin;
              (req as any).firestore = db;
              
              const module = await import('../api/webhook.js');
              await module.default(req as any, res as any);
            } catch (error: any) {
              console.error(`Error in webhook handler: ${error.message}`);
              res.status(500).json({ error: 'Internal server error' });
            }
          });
        } 
        // Special handling for user-subscription route
        else if (fullRoutePath.includes('/api/pricing/user-subscription/:userId')) {
          app.get(fullRoutePath, async (req: Request, res: Response) => {
            try {
              // Add Firebase to the req object
              (req as any).firebaseAdmin = admin;
              (req as any).firestore = db;
              
              // Add userId to req.query to match expected format in the handler
              req.query.userId = req.params.userId;
              
              const module = await import('../api/pricing/user-subscription/[userId].js');
              await module.default(req as any, res as any);
            } catch (error: any) {
              console.error(`Error in user-subscription handler: ${error.message}`);
              res.status(500).json({ error: 'Internal server error' });
            }
          });
        }
        // Special handling for setup-trial route
        else if (fullRoutePath === '/api/auth/setup-trial') {
          app.post(fullRoutePath, async (req: Request, res: Response) => {
            try {
              // Add Firebase to the req object
              (req as any).firebaseAdmin = admin;
              (req as any).firestore = db;
              
              const module = await import('../api/auth/setup-trial.js');
              await module.default(req as any, res as any);
            } catch (error: any) {
              console.error(`Error in setup-trial handler: ${error.message}`);
              res.status(500).json({ error: 'Internal server error' });
            }
          });
        }
        // Special handling for fix-subscription route
        else if (fullRoutePath === '/api/fix-subscription') {
          app.post(fullRoutePath, async (req: Request, res: Response) => {
            try {
              // Add Firebase to the req object
              (req as any).firebaseAdmin = admin;
              (req as any).firestore = db;
              
              const module = await import('../api/fix-subscription.js');
              await module.default(req as any, res as any);
            } catch (error: any) {
              console.error(`Error in fix-subscription handler: ${error.message}`);
              res.status(500).json({ error: 'Internal server error' });
            }
          });
        }
      } catch (error: any) {
        console.error(`Failed to register route for ${file}: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.error(`Error loading API routes: ${error.message}`);
  }
}

// Serve static files from the public directory
app.use(express.static('public'));

// Add error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

// Load API routes and start the server
loadApiRoutes().then(() => {
  // Start the server
  app.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
    console.log(`Access the fix subscription tool at http://localhost:${PORT}/fix-subscription.html`);
  });
});

export default app; 