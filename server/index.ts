import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { configureGoogleAuth, authRoutes, isAuthenticated } from './auth/google';
import session from 'express-session';
import passport from 'passport';
import path from 'path';
import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import pgSessionStore from 'connect-pg-simple';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
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
(async () => {
  // Initialize routes first
  server = await registerRoutes(app);

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // Development mode with Vite middleware
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    // Production mode with static files
    serveStatic(app);
  }

  // Use port from environment variable or default to 4000
  const PORT = process.env.PORT || 4000;

  server.listen(PORT, () => {
    log(`Server running at http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
})();

// Configure database connection
neonConfig.fetchConnectionCache = true;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Export db for use in other files
export const db = drizzle(pool);

// Configure session store
const PgStore = pgSessionStore(session);
const sessionStore = new PgStore({
  pool,
  tableName: 'session', // Custom session table name
});

// Configure sessions
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fishcad-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Configure Google authentication
configureGoogleAuth();

// API routes
app.get('/api/auth/login/google', authRoutes.login);
app.get('/api/auth/callback/google', authRoutes.callback);
app.post('/api/auth/logout', authRoutes.logout);
app.get('/api/auth/session', authRoutes.session);

// Protected API routes example
app.get('/api/protected-data', isAuthenticated, (req, res) => {
  res.json({ message: 'This is protected data!', user: req.user });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  
  // For any request that doesn't match an API route, serve the React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Export the Express app for Vercel
export default app;
