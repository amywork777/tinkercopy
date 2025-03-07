import type { Express } from "express";
import { createServer, type Server } from "http";
import express from 'express';
import axios from 'axios';
import { AxiosError } from 'axios';
import nodemailer from 'nodemailer';

const API_BASE_URL = 'https://www.slant3dapi.com/api';
const API_KEY = 'sl-9e3378f7080cdc2b0246ccfe65cda93e7e744b6856e854ceacba523113a40358';

export default express.Router();

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

  // Add a test endpoint to verify the server is working
  app.get('/api/test', (req, res) => {
    console.log('Test endpoint hit');
    return res.status(200).json({ success: true, message: 'API server is running' });
  });

  // Add feedback submission endpoint
  app.post('/api/submit-feedback', async (req, res) => {
    try {
      console.log('Received feedback submission request');
      
      // Log the request headers - this helps debug CORS issues
      console.log('Request headers:', req.headers);
      
      // Log the request body
      console.log('Request body:', req.body);
      
      const { name, email, feedback } = req.body;
      
      if (!feedback) {
        return res.status(400).json({ error: 'Feedback is required' });
      }
      
      console.log('Creating nodemailer transporter with credentials...');
      
      // Create a transporter with Gmail credentials
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'taiyaki.orders@gmail.com', 
          pass: process.env.EMAIL_PASSWORD
        }
      });
      
      console.log('Email transporter created, sending email...');
      
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
      
      // Send the email and await result
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.response);
      
      // Set explicit CORS headers for this response
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Send success response
      return res.status(200).json({ success: true, message: 'Feedback submitted successfully' });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      return res.status(500).json({ error: 'Failed to submit feedback', details: String(error) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
