/**
 * FISHCAD Import Helper
 * 
 * This script provides a simple way for external sites to initiate STL imports into FISHCAD.
 * It supports both direct imports via URL and download + file selection approaches.
 * 
 * Usage:
 * 1. Include this script in your HTML:
 *    <script src="https://fishcad.com/fishcad-import.js"></script>
 * 
 * 2. Call one of the import functions:
 *    
 *    // Method 1: Direct URL import (preferred)
 *    window.FishCAD.importSTLFromUrl('model.stl', 'https://example.com/model.stl');
 *    
 *    // Method 2: Base64 data import
 *    window.FishCAD.importSTLFromData('model.stl', base64Data);
 *    
 *    // Method 3: Download + file selection
 *    window.FishCAD.importSTLWithDownload('model.stl', 'https://example.com/model.stl');
 */

(function() {
  // Create the FishCAD namespace if it doesn't exist
  window.FishCAD = window.FishCAD || {};
  
  /**
   * DIRECT URL IMPORT (Preferred Method)
   * 
   * Redirects to FISHCAD with the STL URL, so FISHCAD can import directly
   * This is the preferred method as it doesn't require user to download + select the file
   * 
   * @param {string} fileName - Name for the imported model
   * @param {string} fileUrl - URL of the STL file to import
   * @param {Object} options - Additional options
   */
  window.FishCAD.importSTLFromUrl = function(fileName, fileUrl, options = {}) {
    const opts = {
      openInNewTab: false,
      fishcadUrl: 'https://fishcad.com',
      metadata: {},
      ...options
    };
    
    // Validate parameters
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('fileName parameter is required and must be a string');
    }
    
    if (!fileUrl || typeof fileUrl !== 'string') {
      throw new Error('fileUrl parameter is required and must be a string');
    }
    
    try {
      // Construct the FISHCAD import URL
      const importUrl = new URL(`${opts.fishcadUrl}/import`);
      
      // Add parameters
      importUrl.searchParams.append('url', fileUrl);
      importUrl.searchParams.append('name', fileName);
      importUrl.searchParams.append('source', window.location.origin);
      
      // Add metadata if provided
      if (Object.keys(opts.metadata).length > 0) {
        importUrl.searchParams.append('metadata', JSON.stringify(opts.metadata));
      }
      
      console.log(`Redirecting to FISHCAD import: ${importUrl.toString()}`);
      
      // Redirect to FISHCAD
      if (opts.openInNewTab) {
        window.open(importUrl.toString(), '_blank');
      } else {
        window.location.href = importUrl.toString();
      }
    } catch (error) {
      console.error('Error initiating FISHCAD import:', error);
      alert('Failed to initiate import to FISHCAD. Please try again or contact support.');
    }
  };
  
  /**
   * BASE64 DATA IMPORT
   * 
   * Sends base64-encoded STL data to FISHCAD
   * Use this if you already have the STL data in memory
   * 
   * @param {string} fileName - Name for the imported model
   * @param {string} base64Data - Base64-encoded STL data
   * @param {Object} options - Additional options
   */
  window.FishCAD.importSTLFromData = function(fileName, base64Data, options = {}) {
    const opts = {
      openInNewTab: false,
      fishcadUrl: 'https://fishcad.com',
      metadata: {},
      ...options
    };
    
    // Validate parameters
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('fileName parameter is required and must be a string');
    }
    
    if (!base64Data || typeof base64Data !== 'string') {
      throw new Error('base64Data parameter is required and must be a string');
    }
    
    try {
      // For very large data, use POST request approach instead of URL
      if (base64Data.length > 20000) {
        // Create a form to submit the data
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${opts.fishcadUrl}/import`;
        form.target = opts.openInNewTab ? '_blank' : '_self';
        
        // Add the data as form fields
        const addField = (name, value) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.appendChild(input);
        };
        
        addField('name', fileName);
        addField('data', base64Data);
        addField('source', window.location.origin);
        
        if (Object.keys(opts.metadata).length > 0) {
          addField('metadata', JSON.stringify(opts.metadata));
        }
        
        // Add the form to the document and submit it
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      } else {
        // For smaller data, use URL parameters
        const importUrl = new URL(`${opts.fishcadUrl}/import`);
        importUrl.searchParams.append('data', base64Data);
        importUrl.searchParams.append('name', fileName);
        importUrl.searchParams.append('source', window.location.origin);
        
        // Add metadata if provided
        if (Object.keys(opts.metadata).length > 0) {
          importUrl.searchParams.append('metadata', JSON.stringify(opts.metadata));
        }
        
        // Redirect to FISHCAD
        if (opts.openInNewTab) {
          window.open(importUrl.toString(), '_blank');
        } else {
          window.location.href = importUrl.toString();
        }
      }
    } catch (error) {
      console.error('Error initiating FISHCAD import:', error);
      alert('Failed to initiate import to FISHCAD. Please try again or contact support.');
    }
  };
  
  /**
   * DOWNLOAD + FILE SELECTION (Backward compatibility)
   * 
   * Downloads the file and opens FISHCAD with a file selection dialog
   * This is the original method and provides a fallback
   * 
   * @param {string} fileName - The name of the STL file
   * @param {string} fileUrl - The URL of the STL file to download
   * @param {Object} options - Additional options
   */
  window.FishCAD.importSTLWithDownload = function(fileName, fileUrl, options = {}) {
    const opts = {
      openInNewTab: false,
      fishcadUrl: 'https://fishcad.com',
      metadata: {},
      ...options
    };
    
    // Validate parameters
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('fileName parameter is required and must be a string');
    }
    
    if (!fileUrl || typeof fileUrl !== 'string') {
      throw new Error('fileUrl parameter is required and must be a string');
    }
    
    try {
      console.log('Initiating download...');
      
      // Create a download link and click it
      const downloadLink = document.createElement('a');
      downloadLink.href = fileUrl;
      downloadLink.download = fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      
      // Start the download
      downloadLink.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(downloadLink);
        
        console.log('Download initiated, redirecting to FISHCAD...');
        
        // Construct the FISHCAD import URL
        const importUrl = new URL(`${opts.fishcadUrl}/import`);
        importUrl.searchParams.append('name', fileName);
        importUrl.searchParams.append('source', window.location.origin);
        
        // Add metadata if provided
        if (Object.keys(opts.metadata).length > 0) {
          importUrl.searchParams.append('metadata', JSON.stringify(opts.metadata));
        }
        
        // Redirect to FISHCAD
        if (opts.openInNewTab) {
          window.open(importUrl.toString(), '_blank');
        } else {
          window.location.href = importUrl.toString();
        }
      }, 500); // Small delay to ensure download starts
    } catch (error) {
      console.error('Error initiating FISHCAD import:', error);
      alert('Failed to initiate import to FISHCAD. Please try again or contact support.');
    }
  };
  
  // For backward compatibility, map the original importSTL function to the new version
  window.FishCAD.importSTL = window.FishCAD.importSTLWithDownload;
  
  /**
   * Check if FISHCAD is available
   * @returns {boolean} - Whether FISHCAD is available
   */
  window.FishCAD.isAvailable = function() {
    return true; // The new approach works in all browsers with basic JS support
  };
  
  // Log that the script was loaded
  console.log('FISHCAD Import Helper loaded successfully');
})(); 