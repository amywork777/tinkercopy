import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
// import { initializeAuth } from "./auth";  // Removed auth reference
import dotenv from "dotenv";
import cors from 'cors';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize authentication
// initializeAuth(app);  // Removed auth initialization

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

// Export the Express app for Vercel
export default app;
