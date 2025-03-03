import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { AxiosError } from 'axios';

const router = express.Router();

// prefix all routes with /api
const API_BASE_URL = 'https://www.slant3dapi.com/api';
const API_KEY = 'sl-9e3378f7080cdc2b0246ccfe65cda93e7e744b6856e854ceacba523113a40358';

// Proxy endpoint for Slant 3D API
router.all('/api/slant3d/*', async (req, res) => {
  try {
    // Extract the target path after /api/slant3d/
    const targetPath = req.path.replace('/api/slant3d/', '');
    const url = `${API_BASE_URL}/${targetPath}`;
    
    // Prepare headers
    const headers = {
      'api-key': API_KEY,
      'Content-Type': 'application/json'
    };
    
    // Forward the request to the Slant 3D API
    const response = await axios({
      method: req.method,
      url,
      headers,
      data: req.method !== 'GET' ? req.body : undefined,
      params: req.method === 'GET' ? req.query : undefined
    });
    
    // Return the response from the API
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error proxying to Slant 3D API:', error);
    
    // Handle axios errors
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      // The request was made and the server responded with a status code outside of 2xx
      return res.status(axiosError.response.status).json(axiosError.response.data);
    }
    
    // Something else went wrong
    return res.status(500).json({ error: 'Failed to proxy request to Slant 3D API' });
  }
});

export default router;

export async function registerRoutes(app: Express): Promise<Server> {
  // Proxy endpoint for Slant 3D API
  app.all('/api/slant3d/*', async (req, res) => {
    try {
      // Extract the target path after /api/slant3d/
      const targetPath = req.path.replace('/api/slant3d/', '');
      const url = `${API_BASE_URL}/${targetPath}`;
      
      console.log(`Proxying request to: ${url}`);
      
      // Prepare headers
      const headers = {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      };
      
      // Forward the request to the Slant 3D API
      const response = await axios({
        method: req.method,
        url,
        headers,
        data: req.method !== 'GET' ? req.body : undefined,
        params: req.method === 'GET' ? req.query : undefined
      });
      
      // Return the response from the API
      return res.status(response.status).json(response.data);
    } catch (error) {
      console.error('Error proxying to Slant 3D API:', error);
      
      // Handle axios errors
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // The request was made and the server responded with a status code outside of 2xx
        return res.status(axiosError.response.status).json(axiosError.response.data);
      }
      
      // Something else went wrong
      return res.status(500).json({ error: 'Failed to proxy request to Slant 3D API' });
    }
  });

  // The rest of your routes can go here

  const httpServer = createServer(app);
  return httpServer;
}
