import express, { type Request, Response, NextFunction } from "express";
// Import from routes.ts file explicitly, not the routes directory
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
// import { initializeAuth } from "./auth";  // Removed auth reference
import dotenv from "dotenv";
import cors from 'cors';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

// ES Module alternative to __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Log environment variables (without exposing sensitive info)
console.log('Environment variables loaded:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('- PORT:', process.env.PORT || 'not set');
console.log('- EMAIL_USER:', process.env.EMAIL_USER || 'not set');
console.log('- EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'is set' : 'not set');

// Create Express app
const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`Created uploads directory at ${uploadsDir}`);
}

// CORS configuration with more allowed origins
const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:5174', 
  'http://localhost:5175', 
  'http://localhost:5176', 
  'http://localhost:5187', 
  'http://localhost:3000', 
  'http://localhost:3001',
  'https://magic.taiyaki.ai',
  'https://library.taiyaki.ai',
  'https://fishcad.com',
  'http://localhost:3000'
];

// Configure middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Origin ${origin} not allowed by CORS`);
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Disposition', 'Content-Type'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Specific CORS response for preflight OPTIONS requests
app.options('*', (req, res) => {
  // Handle preflight request
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.setHeader('Content-Length', '0');
    res.status(204).end();
  } else {
    res.status(403).end();
  }
});

// Add middleware to explicitly set CORS headers for all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  next();
});

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' })); // Parse JSON bodies with larger size limit
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded bodies

// Initialize authentication
// initializeAuth(app);  // Removed auth initialization

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`${req.method} ${req.url} - Request received`);
  
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize routes
let server: any;
let io: SocketIOServer;

(async () => {
  // Create HTTP server
  server = createServer(app);
  
  // Initialize Socket.IO with CORS settings
  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  
  // Socket.IO connection handling
  io.on('connection', (socket: any) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Join a room for specific import job updates
    socket.on('join-import-room', (importId: string) => {
      socket.join(`import-${importId}`);
      console.log(`Socket ${socket.id} joined room import-${importId}`);
    });
    
    // Leave a room
    socket.on('leave-import-room', (importId: string) => {
      socket.leave(`import-${importId}`);
      console.log(`Socket ${socket.id} left room import-${importId}`);
    });
    
    // Disconnect handling
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
  
  // Make io available globally
  (global as any).io = io;
  
  // Initialize routes with the server and io instances
  await registerRoutes(app, server, io);

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("Server error:", err);
  });

  // Development mode with Vite middleware
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    // Production mode with static files
    serveStatic(app);
  }

  // Use port from environment variable or default to 3001
  const PORT = process.env.PORT || 3001;

  server.listen(PORT, () => {
    log(`Server running at http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
    log(`Socket.IO server initialized and listening for connections`);
  });
})();

// Export the Express app for Vercel
export default app;
