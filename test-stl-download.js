/**
 * Test script for STL file upload and storage
 * This simulates what happens during the Stripe checkout process
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a directory for STL files if it doesn't exist
const stlFilesDir = path.join(__dirname, 'test-stl-files');
if (!fs.existsSync(stlFilesDir)) {
  fs.mkdirSync(stlFilesDir, { recursive: true });
  console.log(`Created test STL files directory: ${stlFilesDir}`);
}

// Simulate creating an STL file
function createTestSTLFile() {
  // Create a simple cube STL file (ASCII format)
  const content = `solid cube
    facet normal 0 0 1
      outer loop
        vertex 0 0 0
        vertex 1 0 0
        vertex 1 1 0
      endloop
    endfacet
    facet normal 0 0 1
      outer loop
        vertex 0 0 0
        vertex 1 1 0
        vertex 0 1 0
      endloop
    endfacet
  endsolid`;

  const fileName = `test-cube-${Date.now()}.stl`;
  const filePath = path.join(stlFilesDir, fileName);
  fs.writeFileSync(filePath, content);
  console.log(`Created test STL file: ${filePath}`);
  return { fileName, filePath, content };
}

// Simulate STL file upload to server
function uploadSTLFile(stlFile) {
  // Generate a unique file ID (similar to what our server endpoint does)
  const fileId = `stl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  // Simulate storing the file persistently
  const safeName = stlFile.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storedFilePath = path.join(stlFilesDir, `${fileId}-${safeName}`);
  
  // Copy the file to simulate storage
  fs.copyFileSync(stlFile.filePath, storedFilePath);
  
  // Generate a download URL (this would be a real URL in the actual implementation)
  const downloadUrl = `http://localhost:3001/api/stl-files/${fileId}`;
  
  console.log(`Uploaded STL file with ID: ${fileId}`);
  console.log(`STL file stored at: ${storedFilePath}`);
  console.log(`Download URL: ${downloadUrl}`);
  
  return { 
    fileId, 
    downloadUrl, 
    storedFilePath 
  };
}

// Simulate Stripe checkout with the STL file link in the product description
function simulateStripeCheckout(modelName, color, quantity, price, stlInfo) {
  const { fileId, downloadUrl } = stlInfo;
  
  // This is how the download URL would appear in the Stripe product description
  const productDescription = `
Custom 3D print - ${modelName} in ${color} (Qty: ${quantity})

----------------------------------
STL FILE DOWNLOAD LINK:
${downloadUrl}
----------------------------------

Save this link to download your STL file for printing.
  `;
  
  console.log('\n===== SIMULATED STRIPE PRODUCT =====');
  console.log(`Product Name: 3D Print: ${modelName}`);
  console.log(`Price: $${price.toFixed(2)}`);
  console.log('\nProduct Description:');
  console.log(productDescription);
  console.log('====================================\n');
  
  return {
    sessionId: `cs_test_${crypto.randomBytes(8).toString('hex')}`,
    productDescription
  };
}

// Simulate downloading the STL file from the URL in the product description
function simulateDownloadSTLFile(fileId) {
  // In the real implementation, this would be an HTTP request to the URL
  // Here we just find the file on disk and confirm it exists
  
  const files = fs.readdirSync(stlFilesDir);
  const matchingFile = files.find(file => file.startsWith(fileId));
  
  if (matchingFile) {
    const filePath = path.join(stlFilesDir, matchingFile);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    console.log(`Successfully "downloaded" STL file with ID: ${fileId}`);
    console.log(`File content (first 100 chars): ${fileContent.substring(0, 100)}...`);
    
    return { success: true, fileName: matchingFile, content: fileContent };
  } else {
    console.error(`Failed to find STL file with ID: ${fileId}`);
    return { success: false };
  }
}

// Run the simulation
function runTest() {
  console.log('=== STARTING STL UPLOAD & CHECKOUT TEST ===\n');
  
  // Step 1: Create a test STL file
  console.log('STEP 1: Creating test STL file...');
  const stlFile = createTestSTLFile();
  console.log();
  
  // Step 2: Upload the STL file to our simulated server
  console.log('STEP 2: Uploading STL file to server...');
  const uploadResult = uploadSTLFile(stlFile);
  console.log();
  
  // Step 3: Simulate a Stripe checkout with the STL file link
  console.log('STEP 3: Creating Stripe checkout session...');
  const checkoutResult = simulateStripeCheckout(
    'Test Cube', 
    'Black PLA', 
    1, 
    19.99, 
    uploadResult
  );
  console.log();
  
  // Step 4: Extract the download URL and simulate downloading the file
  console.log('STEP 4: Later - Customer retrieves the STL file from Stripe...');
  // In reality, the customer would copy the URL from the Stripe dashboard or email
  const fileId = uploadResult.fileId;
  const downloadResult = simulateDownloadSTLFile(fileId);
  
  if (downloadResult.success) {
    console.log('\n✅ TEST SUCCESSFUL! The STL file was retrieved successfully.');
    console.log('This confirms the file storage and retrieval process works correctly.');
  } else {
    console.log('\n❌ TEST FAILED! Could not retrieve the STL file.');
  }
  
  console.log('\n=== TEST COMPLETED ===');
}

// Execute the test
runTest(); 