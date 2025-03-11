import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './firebase-admin.js';

// Directory for temporary STL files
const tempStlDir = path.join(os.tmpdir(), 'model-fusion-stl-temp');

// Ensure the temporary directory exists
if (!fs.existsSync(tempStlDir)) {
  fs.mkdirSync(tempStlDir, { recursive: true });
}

/**
 * Store an STL file temporarily before checkout
 * @param stlData - The STL file data, can be a string or Buffer
 * @param fileName - The original file name
 * @returns Object with file ID and local path
 */
export async function storeTempSTLFile(
  stlData: string | Buffer, 
  fileName: string
): Promise<{ fileId: string; filePath: string }> {
  try {
    // Generate a unique ID for the file
    const fileId = `temp-${uuidv4()}`;
    const safeName = fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'model.stl';
    const filePath = path.join(tempStlDir, `${fileId}-${safeName}`);
    
    // Process the data if it's a data URL
    let fileContent: Buffer;
    if (typeof stlData === 'string') {
      if (stlData.startsWith('data:')) {
        // Extract the base64 data after the comma
        const base64Data = stlData.split(',')[1];
        fileContent = Buffer.from(base64Data, 'base64');
      } else {
        // Assume it's a regular string or already base64 encoded
        fileContent = Buffer.from(stlData);
      }
    } else {
      // Already a buffer
      fileContent = stlData;
    }
    
    // Write the file to the temporary directory
    fs.writeFileSync(filePath, fileContent);
    
    return { fileId, filePath };
  } catch (error) {
    console.error('Error storing temporary STL file:', error);
    throw new Error('Failed to store temporary STL file');
  }
}

/**
 * Store an STL file permanently in Firebase Storage
 * @param filePath - Path to the local file
 * @param fileName - Name to use when storing in Firebase
 * @returns Promise with download URL
 */
export async function storeSTLInFirebase(
  filePath: string,
  fileName: string
): Promise<{ downloadUrl: string; firebasePath: string }> {
  try {
    // Create a unique path in Firebase Storage
    const safeName = fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'model.stl';
    const firebasePath = `stl-files/${Date.now()}-${safeName}`;
    
    // Upload the file to Firebase Storage
    await storage.upload(filePath, {
      destination: firebasePath,
      metadata: {
        contentType: 'model/stl', // Proper MIME type for STL files
        metadata: {
          originalName: fileName
        }
      }
    });
    
    // Get a signed URL for the file
    const [url] = await storage.file(firebasePath).getSignedUrl({
      action: 'read',
      expires: '01-01-2099' // Far future expiration
    });
    
    return { downloadUrl: url, firebasePath };
  } catch (error) {
    console.error('Error storing STL in Firebase:', error);
    throw new Error('Failed to store STL file in Firebase');
  }
}

/**
 * Clean up a temporary STL file
 * @param filePath - Path to the local file
 */
export function cleanupTempSTLFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up temporary STL file:', error);
  }
}

/**
 * Process a base64 data URL to extract the STL file content
 * @param dataUrl - The data URL string
 * @returns Buffer with the file content
 */
export function processSTLDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith('data:')) {
    // Not a data URL, try to process as is
    return Buffer.from(dataUrl);
  }
  
  // Extract the base64 data after the comma
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) {
    throw new Error('Invalid data URL format');
  }
  
  return Buffer.from(base64Data, 'base64');
}

/**
 * Decode a base64 string to binary data
 * @param base64String - Base64 encoded string
 * @returns Buffer with decoded data
 */
export function decodeBase64(base64String: string): Buffer {
  return Buffer.from(base64String, 'base64');
} 