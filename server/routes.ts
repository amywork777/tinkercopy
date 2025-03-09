import type { Express } from "express";
import { createServer, type Server } from "http";
import express from 'express';
import axios from 'axios';
import { AxiosError } from 'axios';
import nodemailer from 'nodemailer';
import stlImportRouter, { initializeSTLImportRoutes } from './routes/stlImport.js';
import { Server as SocketIOServer } from 'socket.io';

const API_BASE_URL = 'https://www.slant3dapi.com/api';
const API_KEY = 'sl-9e3378f7080cdc2b0246ccfe65cda93e7e744b6856e854ceacba523113a40358';

export async function registerRoutes(app: Express, httpServer?: Server, socketIo?: SocketIOServer): Promise<Server> {
  // If httpServer is not provided, create one
  const server = httpServer || createServer(app);
  
  // If socketIo is provided, initialize STL import routes with it
  if (socketIo) {
    // Initialize STL import routes
    const stlRouter = initializeSTLImportRoutes(socketIo);
    
    // Mount the STL import routes
    app.use('/api', stlRouter);
    console.log('STL import routes initialized with Socket.IO');
  }
  
  // Proxy endpoint for Slant 3D API
  app.all('/api/slant3d/*', async (req, res) => {
    try {
      // Extract the target path after /api/slant3d/
      const targetPath = req.path.replace('/api/slant3d/', '');
      const url = `${API_BASE_URL}/${targetPath}`;
      
      console.log(`Proxying request to Slant 3D API: ${url}`);
      
      // Prepare headers
      const headers = {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      };
      
      // For larger STL model uploads, increase timeout
      const timeout = req.method !== 'GET' && (
        targetPath.includes('calculate-price') || 
        targetPath.includes('submit-job')
      ) ? 30000 : 10000; // 30 seconds for uploads, 10 seconds for other requests

      // Forward the request to the Slant 3D API
      const response = await axios({
        method: req.method,
        url,
        headers,
        data: req.method !== 'GET' ? req.body : undefined,
        params: req.method === 'GET' ? req.query : undefined,
        timeout,
        maxContentLength: 20 * 1024 * 1024, // Allow up to 20MB for uploads
        maxBodyLength: 20 * 1024 * 1024, // Allow up to 20MB for request body
      });
      
      // For job submission, log the response details
      if (targetPath.includes('submit-job') && response.data) {
        console.log('Successfully submitted print job:', {
          jobId: response.data.jobId || response.data.id,
          status: response.data.status || 'submitted'
        });
      }
      
      // Return the response from the API
      return res.status(response.status).json(response.data);
    } catch (error) {
      console.error('Error proxying to Slant 3D API:', error);
      
      // Handle axios errors
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // The request was made and the server responded with a status code outside of 2xx
        console.error('API Error Response:', axiosError.response.status, axiosError.response.data);
        return res.status(axiosError.response.status).json({
          error: 'Error from 3D printing service',
          details: axiosError.response.data
        });
      } else if (axiosError.request) {
        // The request was made but no response was received
        console.error('No response received from API', axiosError.request);
        return res.status(504).json({ 
          error: '3D printing service timeout',
          message: 'The service took too long to respond. Please try again.'
        });
      }
      
      // Something else went wrong
      return res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to communicate with 3D printing service'
      });
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

  // Add a test endpoint to verify email configuration
  app.get('/api/test-email-config', (req, res) => {
    console.log('Email config test endpoint hit');
    
    // Get email credentials from environment variables
    const emailUser = process.env.EMAIL_USER || 'taiyaki.orders@gmail.com';
    const emailPass = process.env.EMAIL_PASSWORD;
    
    // Don't expose the actual password in the response
    return res.status(200).json({ 
      success: true, 
      emailConfig: {
        user: emailUser,
        passwordConfigured: !!emailPass
      },
      envVarsLoaded: {
        NODE_ENV: process.env.NODE_ENV || 'not set',
        PORT: process.env.PORT || 'not set',
        EMAIL_USER: process.env.EMAIL_USER || 'not set',
        EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'is set' : 'not set'
      }
    });
  });

  // Add OPTIONS handler for the feedback submission preflight requests
  app.options('/api/submit-feedback', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).send();
  });

  // Add feedback submission endpoint
  app.post('/api/submit-feedback', async (req, res) => {
    try {
      // Set CORS headers first to ensure they're applied in all cases
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      console.log('Received feedback submission request');
      
      // Log the request headers - this helps debug CORS issues
      console.log('Request headers:', req.headers);
      
      // Log the request body
      console.log('Request body:', req.body);
      
      const { name, email, feedback } = req.body;
      
      if (!feedback) {
        return res.status(400).json({ error: 'Feedback is required' });
      }
      
      // Get credentials from environment variables
      const emailUser = process.env.EMAIL_USER || 'taiyaki.orders@gmail.com';
      const emailPass = process.env.EMAIL_PASSWORD;
      
      console.log('Creating nodemailer transporter with credentials...');
      console.log(`Using email configuration: user=${emailUser}, password=${emailPass ? 'is set' : 'is NOT set'}`);
      
      if (!emailPass) {
        console.error('EMAIL_PASSWORD environment variable is not set! Email will not be sent.');
        return res.status(500).json({ 
          error: 'Email configuration is incomplete',
          details: 'Server email password is not configured'
        });
      }
      
      // Create a transporter with Gmail credentials
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass
        }
      });
      
      console.log('Email transporter created, sending email...');
      
      // Email content
      const mailOptions = {
        from: emailUser,
        to: emailUser,
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
      try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.response);
        
        // Send success response
        return res.status(200).json({ 
          success: true, 
          message: 'Feedback submitted successfully',
          emailSent: true
        });
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Return detailed error for debugging
        return res.status(500).json({ 
          error: 'Failed to send email',
          details: String(emailError),
          emailSent: false
        });
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      return res.status(500).json({ 
        error: 'Failed to submit feedback', 
        details: String(error),
        emailSent: false
      });
    }
  });

  return server;
}
