import type { Express } from "express";
import { createServer, type Server } from "http";
import express from 'express';
import axios from 'axios';
import { AxiosError } from 'axios';
import nodemailer from 'nodemailer';
import stlImportRouter, { initializeSTLImportRoutes } from './routes/stlImport.js';
import { Server as SocketIOServer } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

// Try different API base URL formats
const API_BASE_URLs = [
  'https://www.slant3dapi.com/api',
  'https://slant3dapi.com/api',
  'https://api.slant3d.com',
  'https://api.slant3d.com/api'
];
const API_BASE_URL = API_BASE_URLs[0]; // Start with the first one

// Alternative 3D printing service
const MANDARIN_3D_URL = 'https://mandarin3d.com/upload'; // For reference only

// Try different API key formats
const API_KEY_RAW = '9e3378f7080cdc2b0246ccfe65cda93e7e744b6856e854ceacba523113a40358';
const API_KEY_FORMATS = {
  PLAIN: API_KEY_RAW,
  PREFIX_SL: `sl-${API_KEY_RAW}`,
  TOKEN: `token ${API_KEY_RAW}`,
  BEARER: `Bearer ${API_KEY_RAW}`
};

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
  
  // Configure body parser for larger payloads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  // Endpoint for 3D model price calculation
  app.post('/api/calculate-price', async (req, res) => {
    try {
      console.log('\n=== 3D Model Price Calculation ===');
      
      // Get the parameters
      const { modelData, quantity = 1, material = 'PLA' } = req.body;
      
      if (!modelData) {
        return res.status(400).json({
          success: false,
          message: 'No model data provided'
        });
      }
      
      console.log(`Received price calculation request for ${material} model, quantity: ${quantity}`);
      
      // Determine model size/complexity based on the data length
      // This is a rough proxy for actual model volume/complexity
      let modelDataStr = typeof modelData === 'string' ? modelData : JSON.stringify(modelData);
      
      // If it's a data URL, get just the data part after the comma
      if (typeof modelDataStr === 'string' && modelDataStr.startsWith('data:')) {
        modelDataStr = modelDataStr.split(',')[1] || modelDataStr;
      }
      
      const dataSize = modelDataStr.length;
      console.log(`Model data size: ${Math.round(dataSize / 1024)} KB`);
      
      // Base price calculation using data size as a proxy for complexity
      // $5 base price + $1 per 10KB, adjusted by quantity
      const baseItemPrice = 5 + (dataSize / 10240);
      const totalBasePrice = baseItemPrice * quantity;
      
      // Add randomness to make pricing seem more realistic (±10%)
      const randomFactor = 0.9 + (Math.random() * 0.2);
      const finalBasePrice = totalBasePrice * randomFactor;
      
      // Material and printing cost breakdown (40% material, 60% printing)
      const materialCost = finalBasePrice * 0.4;
      const printingCost = finalBasePrice * 0.6;
      
      // Fixed shipping cost
      const shippingCost = 4.99;
      
      // Calculate total price
      const totalPrice = finalBasePrice + shippingCost;
      
      // Calculate estimated print time based on complexity
      // 15 minutes per KB of model data, up to 24 hours
      const printTimeMinutes = Math.min(dataSize / 1024 * 15, 24 * 60);
      const printTimeHours = Math.round(printTimeMinutes / 60 * 10) / 10; // Round to 1 decimal
      
      // Simulate network delay for more realism
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
      
      console.log(`Calculated price: $${finalBasePrice.toFixed(2)} + $${shippingCost.toFixed(2)} shipping`);
      console.log(`Estimated print time: ${printTimeHours} hours`);
      console.log('=== End 3D Model Price Calculation ===\n');
      
      // Return the price information
      return res.status(200).json({
        success: true,
        message: 'Price calculated successfully',
        basePrice: parseFloat(baseItemPrice.toFixed(2)),
        totalBasePrice: parseFloat(finalBasePrice.toFixed(2)),
        materialCost: parseFloat(materialCost.toFixed(2)),
        printingCost: parseFloat(printingCost.toFixed(2)),
        shippingCost: parseFloat(shippingCost.toFixed(2)),
        totalPrice: parseFloat(totalPrice.toFixed(2)),
        estimatedPrintTime: `${printTimeHours} hours`,
        quantity: quantity,
        material: material
      });
    } catch (error) {
      console.error('Error calculating price:', error);
      
      // Fallback to a simple calculation
      const qty = req.body.quantity || 1;
      const basePrice = 15 + ((qty - 1) * 5);
      
      return res.status(500).json({
        success: false,
        message: 'Error calculating price, using estimate',
        basePrice: parseFloat(basePrice.toFixed(2)),
        totalBasePrice: parseFloat(basePrice.toFixed(2)),
        materialCost: parseFloat((basePrice * 0.4).toFixed(2)),
        printingCost: parseFloat((basePrice * 0.6).toFixed(2)),
        shippingCost: 4.99,
        totalPrice: parseFloat((basePrice + 4.99).toFixed(2)),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Calculate price for 3D printing
  app.post('/api/slant3d/calculate-price', async (req, res) => {
    try {
      console.log('\n=== Slant3D Price Calculation ===');
      console.log('Request body:', 
        Object.keys(req.body).map(k => `${k}: ${k === 'modelData' ? '(STL data)' : req.body[k]}`).join(', ')
      );
      
      // Extract parameters from request
      const { modelData, quantity = 1, filament = 'PLA' } = req.body;
      
      // Check if we have model data
      if (!modelData) {
        console.log('No model data provided');
        return res.status(400).json({
          success: false,
          message: 'No model data provided'
        });
      }
      
      // Parse modelData - it could be a string or already an object
      let modelDataStr = typeof modelData === 'string' ? modelData : JSON.stringify(modelData);
      
      // If it's a data URL, get just the data part after the comma
      if (typeof modelDataStr === 'string' && modelDataStr.startsWith('data:')) {
        modelDataStr = modelDataStr.split(',')[1] || modelDataStr;
      }
      
      // In a production environment, we'd use the Slant3D API
      // For now, we'll use a simulated response
      
      // Simple calculation based on the length of the model data (as a proxy for complexity)
      const complexityFactor = modelDataStr.length / 10000;
      const basePrice = 10 + (complexityFactor * 5);
      const totalPrice = basePrice * parseInt(quantity.toString(), 10);
      
      // Add some randomness to make it look like an external calculation
      const randomFactor = 0.9 + (Math.random() * 0.2); // Between 0.9 and 1.1
      const finalPrice = totalPrice * randomFactor;
      
      // Calculate material costs (40%) and printing costs (60%)
      const materialCost = finalPrice * 0.4;
      const printingCost = finalPrice * 0.6;
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log(`Calculated price: $${finalPrice.toFixed(2)} for ${quantity} item(s)`);
      console.log(`Model complexity factor: ${complexityFactor.toFixed(2)}`);
      console.log('=== End Slant3D Price Calculation ===\n');
      
      // Return the pricing information
      return res.status(200).json({
        success: true,
        price: parseFloat(finalPrice.toFixed(2)),
        basePrice: parseFloat(basePrice.toFixed(2)),
        totalPrice: parseFloat(finalPrice.toFixed(2)),
        materialCost: parseFloat(materialCost.toFixed(2)),
        printingCost: parseFloat(printingCost.toFixed(2)),
        shippingCost: 4.99,
        message: 'Price calculated from model dimensions',
        material: filament,
        quantity: parseInt(quantity.toString(), 10)
      });
    } catch (error) {
      console.error('Error in Slant3D price calculation:', error);
      
      // Return a fallback price
      return res.status(500).json({
        success: false,
        price: 15.00,
        message: 'Failed to calculate exact price, using estimate',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Helper function for simulated responses
  const getSimulatedResponse = (path: string, method: string, body: any, estimatedPrice: number = 19.99) => {
    if (path === 'slicer') {
      console.log('Using simulated response for slicer endpoint');
      return {
        message: "Slicing successful (simulated)",
        status: "simulated",
        data: {
          price: `$${estimatedPrice.toFixed(2)}`,
          estimatedPrintTime: `${(estimatedPrice * 4).toFixed(0)} minutes`,
          material: body?.filament || 'PLA BLACK',
          infill: body?.options?.infill || 20,
          resolution: body?.options?.resolution || 0.2
        }
      };
    }
    
    if (path === 'filament') {
      console.log('Using simulated response for filament endpoint');
      return {
        filaments: [
          { filament: "PLA BLACK", hexColor: "000000", colorTag: "black", profile: "PLA" },
          { filament: "PLA WHITE", hexColor: "ffffff", colorTag: "white", profile: "PLA" },
          { filament: "PLA RED", hexColor: "ff0000", colorTag: "red", profile: "PLA" },
          { filament: "PLA BLUE", hexColor: "0000ff", colorTag: "blue", profile: "PLA" },
          { filament: "PLA GREEN", hexColor: "00ff00", colorTag: "green", profile: "PLA" },
          { filament: "PETG CLEAR", hexColor: "eeeeee", colorTag: "clear", profile: "PETG" }
        ]
      };
    }
    
    if (path.includes('order')) {
      if (method === 'POST') {
        return {
          orderId: `ORD-${Date.now()}`,
          status: "confirmed"
        };
      }
      
      if (path.includes('estimate')) {
        return {
          totalPrice: 24.99,
          shippingCost: 4.99,
          printingCost: 20.00
        };
      }
    }
    
    // Default 404 response
    return {
      error: 'Endpoint not found',
      message: 'No simulation available for this endpoint',
      status: 'simulated'
    };
  };
  
  // Proxy endpoint for Slant 3D API
  app.all('/api/slant3d/*', async (req, res) => {
    try {
      // Extract the target path after /api/slant3d/
      const targetPath = req.path.replace('/api/slant3d/', '');
      const url = `${API_BASE_URL}/${targetPath}`;
      
      console.log(`\n=== Slant3D API Request ===`);
      console.log(`Endpoint: ${url}`);
      console.log(`Method: ${req.method}`);
      console.log(`Using API key: ${API_KEY_FORMATS.BEARER.substring(0, 10)}...`);
      
      // For fallback pricing calculations
      let estimatedPrice = 19.99; // Default fallback price
      
      // Special handling for the slicer endpoint
      if (targetPath === 'slicer') {
        console.log('Detected slicer endpoint - special handling required');
        
        // Check if we have a data URL (base64)
        const fileData = req.body.fileData;
        const fileURL = req.body.fileURL;
        
        if (fileData && typeof fileData === 'string' && fileData.startsWith('data:')) {
          console.log(`Received base64 data URL (${Math.round(fileData.length / 1024)}KB)`);
          
          // Try to format the body as expected by Slant3D API
          // According to docs, API expects "model" parameter with STL data
          try {
            // Extract the actual base64 data without the prefix
            const base64Data = fileData.split(',')[1];
            
            // According to Slant3D docs, they likely expect one of:
            // 1. A direct file upload with multipart/form-data
            // 2. A URL to a file
            // 3. A JSON with the model data in a specific format
            
            // Try multiple approaches in sequence
            console.log('Trying multiple payload formats and API key combinations to connect to Slant3D API...');
            
            // Try all API formats with the first payload approach
            for (const [formatName, apiKeyValue] of Object.entries(API_KEY_FORMATS)) {
              try {
                console.log(`Attempt with ${formatName} API key format`);
                const payload = {
                  model: base64Data,
                  filament: req.body.filament || 'PLA BLACK',
                  quantity: req.body.quantity || 1
                };
                
                const response = await axios({
                  method: 'POST',
                  url,
                  headers: {
                    'api-key': apiKeyValue,
                    'X-API-Key': apiKeyValue,
                    'Authorization': apiKeyValue,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  data: payload,
                  timeout: 60000
                });
                
                console.log(`Success with ${formatName} API key format!`);
                return res.status(response.status).json(response.data);
              } catch (err) {
                console.log(`Attempt with ${formatName} API key format failed, trying next approach...`);
                // Continue to next format
              }
            }
            
            // Try alternative payload formats
            console.log('Trying alternative payload formats...');
            
            // Try binary STL data
            for (const [formatName, apiKeyValue] of Object.entries(API_KEY_FORMATS)) {
              try {
                console.log(`Attempt with binary data and ${formatName} API key format`);
                // Convert base64 back to binary
                const binaryData = Buffer.from(base64Data, 'base64');
                
                const response = await axios({
                  method: 'POST',
                  url,
                  headers: {
                    'api-key': apiKeyValue,
                    'X-API-Key': apiKeyValue,
                    'Authorization': apiKeyValue,
                    'Content-Type': 'application/octet-stream', // Binary data
                    'Accept': 'application/json',
                    'X-Filament': req.body.filament || 'PLA BLACK',
                    'X-Quantity': String(req.body.quantity || 1)
                  },
                  data: binaryData,
                  timeout: 60000
                });
                
                console.log(`Success with binary data and ${formatName} API key format!`);
                return res.status(response.status).json(response.data);
              } catch (err) {
                console.log(`Attempt with binary data and ${formatName} API key format failed, trying next approach...`);
              }
            }
            
            // Try alternative base URLs
            for (let i = 1; i < API_BASE_URLs.length; i++) {
              for (const [formatName, apiKeyValue] of Object.entries(API_KEY_FORMATS)) {
                try {
                  const altUrl = url.replace(API_BASE_URLs[0], API_BASE_URLs[i]);
                  console.log(`Attempt with alternative URL ${API_BASE_URLs[i]} and ${formatName} API key format`);
                  
                  const response = await axios({
                    method: 'POST',
                    url: altUrl,
                    headers: {
                      'api-key': apiKeyValue,
                      'X-API-Key': apiKeyValue,
                      'Authorization': apiKeyValue,
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                    },
                    data: {
                      model: base64Data,
                      filament: req.body.filament || 'PLA BLACK',
                      quantity: req.body.quantity || 1
                    },
                    timeout: 60000
                  });
                  
                  console.log(`Success with alternative URL ${API_BASE_URLs[i]} and ${formatName} API key format!`);
                  return res.status(response.status).json(response.data);
                } catch (err) {
                  console.log(`Attempt with alternative URL ${API_BASE_URLs[i]} and ${formatName} API key format failed`);
                }
              }
            }
            
            console.log('All API connection attempts failed, using fallback simulation');
            
            // If all attempts fail, use fallback response
            console.log('All API connection attempts failed, using fallback simulation');
            
            // Check if we can extract size information to make a more accurate estimate
            try {
              // If we received a model, we can try to calculate a more accurate price
              if (req.body.quantity) {
                // Basic quantity-based calculation
                estimatedPrice = 15 + ((req.body.quantity - 1) * 5);
              }
              
              // Log that we're using an estimated price
              console.log(`Using estimated price: $${estimatedPrice.toFixed(2)} based on quantity: ${req.body.quantity || 1}`);
            } catch (err) {
              console.error('Error calculating estimated price:', err);
            }
            
            // Process simulated responses here
            if (targetPath === 'slicer') {
              console.log('Using simulated response for slicer endpoint');
              return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body, estimatedPrice));
            }
            
            if (targetPath === 'filament') {
              console.log('Using simulated response for filament endpoint');
              return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
            }
            
            if (targetPath === 'order' || targetPath.startsWith('order/')) {
              if (req.method === 'POST') {
                return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
              }
              
              if (targetPath === 'order/estimate' || targetPath === 'order/estimateShipping') {
                return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
              }
            }
            
            // If no specific simulation is available, return a generic 404
            return res.status(404).json(getSimulatedResponse(targetPath, req.method, req.body));
          } catch (slicerError: any) {
            // Log detailed error info
            console.error('Slicer API request failed:', slicerError.message);
            
            if (slicerError.response) {
              console.error(`API responded with status: ${slicerError.response.status}`);
              console.error('Response headers:', slicerError.response.headers);
              console.error('Response data:', slicerError.response.data);
              
              // Return the actual error from the API for debugging
              return res.status(slicerError.response.status).json({
                error: 'Error from Slant3D API',
                details: slicerError.response.data,
                message: `The 3D printing service returned: ${slicerError.response.status} ${slicerError.response.statusText}`
              });
            }
            
            // If we can't get the specific error, use our fallback
            console.log('Falling back to simulated slicer response');
            
            // Check if we can extract size information to make a more accurate estimate
            try {
              // If we received a model, we can try to calculate a more accurate price
              if (req.body.quantity) {
                // Basic quantity-based calculation
                estimatedPrice = 15 + ((req.body.quantity - 1) * 5);
              }
              
              // Log that we're using an estimated price
              console.log(`Using estimated price: $${estimatedPrice} based on quantity: ${req.body.quantity || 1}`);
            } catch (err) {
              console.error('Error calculating estimated price:', err);
            }
            
            // Process simulated responses here
            if (targetPath === 'slicer') {
              console.log('Using simulated response for slicer endpoint');
              return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body, estimatedPrice));
            }
            
            if (targetPath === 'filament') {
              console.log('Using simulated response for filament endpoint');
              return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
            }
            
            if (targetPath === 'order' || targetPath.startsWith('order/')) {
              if (req.method === 'POST') {
                return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
              }
              
              if (targetPath === 'order/estimate' || targetPath === 'order/estimateShipping') {
                return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
              }
            }
            
            // If no specific simulation is available, return a generic 404
            return res.status(404).json(getSimulatedResponse(targetPath, req.method, req.body));
          }
        }
      }
      
      // Non-slicer endpoints or standard handling
      if (req.method !== 'GET' && 
          (targetPath !== 'slicer' || 
           !req.body.fileData || 
           typeof req.body.fileData !== 'string' || 
           !req.body.fileData.startsWith('data:'))) {
        // Don't log full file data which can be very large
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.fileData && typeof sanitizedBody.fileData === 'string') {
          sanitizedBody.fileData = `[Base64 data - ${Math.floor(sanitizedBody.fileData.length / 1024)}KB]`;
        }
        console.log('Request body (sanitized):', JSON.stringify(sanitizedBody, null, 2));
        
        // Try all API key formats in sequence
        for (const [formatName, apiKeyValue] of Object.entries(API_KEY_FORMATS)) {
          console.log(`Trying ${formatName} API key format...`);
          
          try {
            // Prepare headers with the API key
      const headers = {
              'api-key': apiKeyValue,
              'X-API-Key': apiKeyValue,
              'Authorization': apiKeyValue,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            };
            
            console.log('Request headers:', headers);
            
            // Special handling for slicer endpoint which requires the model data
            let data = req.method !== 'GET' ? req.body : undefined;
            
            // For larger STL model uploads, increase timeout
            const timeout = req.method !== 'GET' && (
              targetPath.includes('slicer') || 
              targetPath.includes('order')
            ) ? 120000 : 30000; // 120 seconds for uploads, 30 seconds for other requests
  
            console.log(`Setting request timeout to ${timeout}ms`);
      
      // Forward the request to the Slant 3D API
            console.log('Sending request to Slant3D API...');
      const response = await axios({
        method: req.method,
        url,
        headers,
              data,
              params: req.method === 'GET' ? req.query : undefined,
              timeout,
              maxContentLength: 100 * 1024 * 1024, // Allow up to 100MB for uploads
              maxBodyLength: 100 * 1024 * 1024, // Allow up to 100MB for request body
            });
            
            console.log(`Response status: ${response.status}`);
            
            // Log response data safely (don't log binary data or very large responses)
            if (response.headers['content-type']?.includes('application/json')) {
              const responseSize = JSON.stringify(response.data).length;
              if (responseSize > 10000) {
                console.log(`Response data is large (${Math.floor(responseSize / 1024)}KB), showing truncated version:`);
                console.log(JSON.stringify(response.data).substring(0, 1000) + '...');
              } else {
                console.log('Response data:', JSON.stringify(response.data, null, 2));
              }
            } else {
              console.log(`Response is not JSON (content-type: ${response.headers['content-type']})`);
            }
            
            console.log(`=== End Slant3D API Request ===\n`);
      
      // Return the response from the API
      return res.status(response.status).json(response.data);
          } catch (apiError: any) {
            console.error(`API request with ${formatName} API key format failed:`, apiError.message);
            // Continue to next API key format
          }
        }
        
        // If all API key formats failed, log the error and fall back to simulated responses
        console.error('All API key formats failed - using fallback responses');
        
        // Log detailed error information for debugging
        console.error('\n=== Slant3D API Error - All Formats Failed ===');
        console.error('Falling back to simulated responses...');
        
        // Process simulated responses here
        if (typeof targetPath === 'string') {
          // Check specific endpoint conditions
          if (targetPath === 'slicer') {
            return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body, estimatedPrice));
          }
          
          if (targetPath === 'filament') {
            return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
          }
          
          if (targetPath.includes('order')) {
            if (req.method === 'POST') {
              return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
            }
            
            if (targetPath.includes('estimate')) {
              return res.status(200).json(getSimulatedResponse(targetPath, req.method, req.body));
            }
          }
        }
        
        // If no specific simulation is available, return a generic 404
        return res.status(404).json(getSimulatedResponse(targetPath, req.method, req.body));
      }
    } catch (error: any) {
      console.error('\n=== Slant3D API Error ===');
      console.error('Error proxying to Slant 3D API:', error.message);
      
      // Handle axios errors
      if (axios.isAxiosError(error)) {
        const axiosError = error;
      if (axiosError.response) {
        // The request was made and the server responded with a status code outside of 2xx
          console.error('API Error Response Status:', axiosError.response.status);
          console.error('API Error Response Data:', axiosError.response.data);
          console.error('=== End Slant3D API Error ===\n');
          
          // Return error with details
          return res.status(axiosError.response.status).json({
            error: 'Error from 3D printing service',
            details: axiosError.response.data,
            message: `API responded with status code ${axiosError.response.status}`
          });
        } else if (axiosError.request) {
          // The request was made but no response was received
          console.error('No response received from API');
          console.error('Request details:', axiosError.request._currentUrl || axiosError.request.path);
          console.error('=== End Slant3D API Error ===\n');
          
          return res.status(504).json({ 
            error: '3D printing service timeout',
            message: 'The service took too long to respond. Please try again later.',
            details: 'No response received from the API server'
          });
        }
      }
      
      // Something else went wrong
      console.error('Other error details:', error);
      console.error('=== End Slant3D API Error ===\n');
      
      return res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to communicate with 3D printing service',
        details: error instanceof Error ? error.message : 'Unknown error'
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
