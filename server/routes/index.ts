import { Express } from "express";
import { Server, createServer } from "http";

export async function registerRoutes(app: Express): Promise<Server> {
  // Test endpoint
  app.get("/api/test", (req, res) => {
    res.json({ message: "API is working!" });
  });

  return createServer(app);
} 