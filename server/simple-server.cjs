const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Manually load environment variables if .env file exists
try {
  const envPath = path.join(__dirname, '.env');
  console.log('Looking for .env file at:', envPath);
  
  if (fs.existsSync(envPath)) {
    console.log('.env file exists, loading it');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Simple parser for the .env file
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    
    console.log('Environment variables loaded from .env file');
  } else {
    console.log('No .env file found at', envPath);
  }
} catch (error) {
  console.error('Error loading .env file:', error);
}

// Create express app
const app = express();

// Configure middleware with more permissive CORS settings
app.use(cors({
  origin: true, // Allow any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Parse JSON and URL-encoded bodies
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Request received`);
  next();
});

// Explicit handling for OPTIONS requests (CORS preflight)
app.options('*', cors());

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  return res.status(200).json({ success: true, message: 'Simple server is running' });
});

// Test email config endpoint
app.get('/api/test-email-config', (req, res) => {
  console.log('Email config test endpoint hit');
  
  // Always use taiyaki.orders@gmail.com
  const emailUser = 'taiyaki.orders@gmail.com';
  const emailPass = process.env.EMAIL_PASSWORD;
  
  console.log('Email configuration:');
  console.log('- EMAIL_USER:', emailUser);
  console.log('- EMAIL_PASSWORD:', emailPass ? 'is set' : 'not set');
  
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
      EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'is set' : 'not set'
    }
  });
});

// Feedback submission endpoint
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
    
    // Determine the source domain from request headers
    let sourceDomain = 'Unknown Source';
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    
    if (origin) {
      try {
        sourceDomain = new URL(origin).hostname;
      } catch (e) {
        console.error('Error parsing origin URL:', e);
      }
    } else if (referer) {
      try {
        sourceDomain = new URL(referer).hostname;
      } catch (e) {
        console.error('Error parsing referer URL:', e);
      }
    }
    
    // Always use taiyaki.orders@gmail.com for sending and receiving emails
    const emailUser = 'taiyaki.orders@gmail.com';
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
      subject: `User Feedback Submission from ${sourceDomain}`,
      text: `
Source: ${sourceDomain}
Name: ${name || 'Not provided'}
Email: ${email || 'Not provided'}

Feedback:
${feedback}
      `,
      html: `
<p><strong>Source:</strong> ${sourceDomain}</p>
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

// Start the server
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const DEBUG = process.env.DEBUG || false;

console.log(`Running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
if (DEBUG) {
  console.log(`DEBUG mode enabled - will log extra information for troubleshooting`);
}

// Add DEBUG middleware to log request headers and CORS details
if (DEBUG) {
  app.use((req, res, next) => {
    console.log('DEBUG - Request headers:', req.headers);
    console.log('DEBUG - Origin:', req.headers.origin);
    console.log('DEBUG - Host:', req.headers.host);
    
    // Log CORS headers in the response
    const originalSend = res.send;
    res.send = function() {
      console.log('DEBUG - Response headers:', res.getHeaders());
      return originalSend.apply(this, arguments);
    };
    
    next();
  });
}

const server = app.listen(PORT, () => {
  console.log(`Simple server running at http://localhost:${PORT}`);
  console.log(`Email config: taiyaki.orders@gmail.com / ${process.env.EMAIL_PASSWORD ? 'password is set' : 'password is NOT set'}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use, trying ${PORT + 1}...`);
    const newPort = PORT + 1;
    app.listen(newPort, () => {
      console.log(`Simple server running at http://localhost:${newPort}`);
      console.log(`Email config: taiyaki.orders@gmail.com / ${process.env.EMAIL_PASSWORD ? 'password is set' : 'password is NOT set'}`);
    });
  } else {
    console.error('Server error:', err);
  }
}); 