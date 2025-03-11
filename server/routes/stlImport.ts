import express, { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import { fileURLToPath } from 'url';

// For ES modules compatibility - replicate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type for import job status
type ImportJobStatus = 'pending' | 'downloading' | 'processing' | 'completed' | 'failed';

// Type for import job data
interface ImportJob {
  id: string;
  status: ImportJobStatus;
  source: string;
  fileName: string;
  metadata: Record<string, any>;
  error?: string;
  filePath?: string;
  importedAt: Date;
  updatedAt: Date;
}

// In-memory storage for import jobs
// In a production app, use a database instead
const importJobs: Record<string, ImportJob> = {};

// Create the router
const router = Router();
let io: SocketIOServer;

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueId = uuidv4();
    cb(null, `${uniqueId}-${file.originalname}`);
  }
});

// Create multer upload middleware with size limits
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB size limit
    files: 1 // Only one file at a time
  },
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Only accept STL files or binary files that might be STL
    if (file.mimetype === 'model/stl' || 
        file.mimetype === 'application/octet-stream' || 
        file.originalname.toLowerCase().endsWith('.stl')) {
      cb(null, true);
    } else {
      cb(new Error('Only STL files are allowed'));
    }
  }
});

// Initialize the router with Socket.IO instance
export function initializeSTLImportRoutes(socketIo: SocketIOServer): Router {
  io = socketIo;
  return router;
}

// Middleware to validate import IDs
const validateImportId = (req: Request, res: Response, next: Function) => {
  const { importId } = req.params;
  if (!importId || !importJobs[importId]) {
    return res.status(404).json({ 
      success: false, 
      error: 'Import job not found' 
    });
  }
  next();
};

// POST /api/import-stl - Initiate an STL import from a URL
router.post('/import-stl', async (req: Request, res: Response) => {
  try {
    // Extract request data
    const { stlUrl, fileName, source, metadata } = req.body;
    
    if (!stlUrl) {
      return res.status(400).json({
        success: false,
        error: 'STL URL is required'
      });
    }
    
    // Generate a unique import ID
    const importId = uuidv4();
    
    // Create new import job
    const importJob: ImportJob = {
      id: importId,
      status: 'pending',
      source: source || 'unknown',
      fileName: fileName || `model-${importId}.stl`,
      metadata: metadata || {},
      importedAt: new Date(),
      updatedAt: new Date()
    };
    
    // Store the import job
    importJobs[importId] = importJob;
    
    // Log the new import job
    console.log(`New STL import job created: ${importId}`);
    
    // Start the import process in the background
    processSTLImport(importId, stlUrl);
    
    // Return success with the import ID
    return res.status(200).json({
      success: true,
      importId,
      job: importJob
    });
  } catch (error) {
    console.error('Error creating import job:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create import job'
    });
  }
});

// POST /api/upload - Direct STL file upload endpoint
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No STL file uploaded'
      });
    }

    // Extract metadata from the request
    const { source, fileName, metadata: metadataStr } = req.body;
    let metadata: Record<string, any> = {};
    
    // Parse metadata if provided as a string
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.warn('Failed to parse metadata JSON:', e);
      }
    }
    
    // Generate a unique import ID
    const importId = uuidv4();
    
    // Create new import job
    const importJob: ImportJob = {
      id: importId,
      status: 'processing', // Start at processing since we already have the file
      source: source || 'direct-upload',
      fileName: fileName || file.originalname || `model-${importId}.stl`,
      metadata: metadata,
      filePath: file.path,
      importedAt: new Date(),
      updatedAt: new Date()
    };
    
    // Store the import job
    importJobs[importId] = importJob;
    
    // Log the new import job
    console.log(`New direct STL upload job created: ${importId}`);
    
    // Process the uploaded file (validate, transform if needed)
    try {
      // Update to completed status
      updateJobStatus(importId, 'completed');
      
      // Return success with the import ID
      return res.status(200).json({
        success: true,
        importId,
        job: importJob
      });
    } catch (processError) {
      // Update job with error and 'failed' status
      const errorMessage = processError instanceof Error ? processError.message : 'Unknown error';
      updateJobStatus(importId, 'failed', { error: errorMessage });
      
      throw processError; // Re-throw for the outer catch block
    }
  } catch (error) {
    console.error('Error handling direct upload:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process uploaded file'
    });
  }
});

// GET /api/import-status/:importId - Get import job status
router.get('/import-status/:importId', validateImportId, (req: Request, res: Response) => {
  const { importId } = req.params;
  const job = importJobs[importId];
  
  return res.status(200).json({
    success: true,
    job
  });
});

// GET /api/models/:importId - Get the imported STL file
router.get('/models/:importId', validateImportId, (req: Request, res: Response) => {
  const { importId } = req.params;
  const job = importJobs[importId];
  
  // Check if the job is completed and has a file path
  if (job.status !== 'completed' || !job.filePath) {
    return res.status(400).json({
      success: false,
      error: 'Import job not completed or file not available'
    });
  }
  
  // Check if the file exists
  if (!fs.existsSync(job.filePath)) {
    return res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }
  
  // Send the file
  res.setHeader('Content-Type', 'model/stl');
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}"`);
  return res.sendFile(job.filePath);
});

// Process the STL import
async function processSTLImport(importId: string, stlUrl: string): Promise<void> {
  const job = importJobs[importId];
  
  try {
    // Update job status to 'downloading'
    updateJobStatus(importId, 'downloading');
    
    // Download the STL file
    const response = await axios({
      method: 'GET',
      url: stlUrl,
      responseType: 'arraybuffer',
      // Increase timeout for large files
      timeout: 60000 // 60 seconds
    });
    
    // Update job status to 'processing'
    updateJobStatus(importId, 'processing');
    
    // Create the uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Define the file path
    const filePath = path.join(uploadsDir, `${importId}-${job.fileName}`);
    
    // Save the file to disk
    fs.writeFileSync(filePath, Buffer.from(response.data));
    
    // Update job with file path and 'completed' status
    updateJobStatus(importId, 'completed', { filePath });
    
    console.log(`STL import job ${importId} completed successfully`);
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    console.error(`Error processing STL import job ${importId}:`, error);
    
    // Update job with error and 'failed' status
    updateJobStatus(importId, 'failed', { error: errorMessage });
  }
}

// Update job status and emit socket.io events
function updateJobStatus(importId: string, status: ImportJobStatus, additionalData: Record<string, any> = {}): void {
  const job = importJobs[importId];
  
  if (!job) {
    console.error(`Job ${importId} not found when updating status`);
    return;
  }
  
  // Update job data
  job.status = status;
  job.updatedAt = new Date();
  
  // Add any additional data
  Object.assign(job, additionalData);
  
  // Emit socket.io event to the job's room
  const roomName = `import-${importId}`;
  io.to(roomName).emit('import-status-update', {
    importId,
    status,
    job
  });
  
  // Additional events for specific statuses
  if (status === 'completed') {
    io.to(roomName).emit('import-completed', {
      importId,
      job
    });
  } else if (status === 'failed') {
    io.to(roomName).emit('import-failed', {
      importId,
      error: job.error,
      job
    });
  }
  
  // Log the status update
  console.log(`Import job ${importId} status updated to: ${status}`);
}

// Cleanup job to remove old files and job records
// In a production app, you would run this as a cron job
function cleanupOldImports(): void {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = new Date().getTime();
  
  for (const importId in importJobs) {
    const job = importJobs[importId];
    const jobAge = now - job.importedAt.getTime();
    
    // Skip jobs newer than maxAge
    if (jobAge < maxAge) continue;
    
    // Delete the file if it exists
    if (job.filePath && fs.existsSync(job.filePath)) {
      try {
        fs.unlinkSync(job.filePath);
        console.log(`Deleted file for old import job: ${importId}`);
      } catch (error) {
        console.error(`Error deleting file for import job ${importId}:`, error);
      }
    }
    
    // Delete the job record
    delete importJobs[importId];
    console.log(`Removed old import job: ${importId}`);
  }
}

// Run cleanup job every hour
setInterval(cleanupOldImports, 60 * 60 * 1000);

export default router;