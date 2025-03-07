import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { AxiosError } from 'axios';
import nodemailer from 'nodemailer';

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

// Add feedback submission endpoint
router.post('/submit-feedback', async (req, res) => {
  try {
    const { name, email, feedback } = req.body;
    
    if (!feedback) {
      return res.status(400).json({ error: 'Feedback is required' });
    }
    
    // Create a transporter with Gmail credentials
    // NOTE: These should be in environment variables in production
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'taiyaki.orders@gmail.com',
        pass: process.env.EMAIL_PASSWORD // This should be set in server environment
      }
    });
    
    // Email content
    const mailOptions = {
      from: 'taiyaki.orders@gmail.com',
      to: 'taiyaki.orders@gmail.com',
      subject: 'User Feedback Submission',
      text: `
Name: ${name || 'Not provided'}
Email: ${email || 'Not provided'}

Feedback:
${feedback}
      `,
      html: `
<p><strong>Name:</strong> ${name || 'Not provided'}</p>
<p><strong>Email:</strong> ${email || 'Not provided'}</p>
<p><strong>Feedback:</strong></p>
<p>${feedback.replace(/\n/g, '<br>')}</p>
      `
    };
    
    // Send the email
    await transporter.sendMail(mailOptions);
    
    // Send success response
    res.status(200).json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
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

  // Proxy endpoint for Firebase Storage URLs
  app.get('/api/storage-proxy', async (req, res) => {
    const url = req.query.url as string;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
      console.log(`Proxying Firebase Storage request to: ${url}`);
      
      // Forward the request to Firebase Storage
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer' // Important for binary files like STL
      });
      
      // Set appropriate headers
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      res.setHeader('Content-Length', response.headers['content-length'] || '0');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Return the response as binary data
      return res.status(response.status).send(response.data);
    } catch (error) {
      console.error('Error proxying to Firebase Storage:', error);
      
      // Handle axios errors
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return res.status(axiosError.response.status).json({ 
          error: 'Error from Firebase Storage',
          details: axiosError.message
        });
      }
      
      // Something else went wrong
      return res.status(500).json({ error: 'Failed to proxy request to Firebase Storage' });
    }
  });

  // The rest of your routes can go here

  const httpServer = createServer(app);
  return httpServer;
}
