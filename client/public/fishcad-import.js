/**
 * FISHCAD Import Helper
 * 
 * This script provides a simple way for external sites to initiate STL imports into FISHCAD.
 * It uses a redirect + localStorage approach that doesn't require complex cross-origin communication.
 * 
 * Usage:
 * 1. Include this script in your HTML:
 *    <script src="https://fishcad.com/fishcad-import.js"></script>
 * 
 * 2. Call the importToFishCAD function:
 *    <button onclick="window.FishCAD.importSTL('model.stl', 'https://example.com/model.stl')">
 *      Import to FISHCAD
 *    </button>
 * 
 * 3. The function will initiate a file download and redirect to FISHCAD
 */

(function() {
  // Create the FishCAD namespace if it doesn't exist
  window.FishCAD = window.FishCAD || {};
  
  /**
   * Initiates an STL import into FISHCAD
   * @param {string} fileName - The name of the STL file
   * @param {string} fileUrl - The URL of the STL file to download
   * @param {Object} options - Additional options
   * @param {boolean} options.openInNewTab - Whether to open FISHCAD in a new tab
   * @param {string} options.fishcadUrl - Override the FISHCAD URL (default: https://fishcad.com)
   * @param {Object} options.metadata - Additional metadata about the model
   */
  window.FishCAD.importSTL = function(fileName, fileUrl, options = {}) {
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
      // Store the pending import data in localStorage (with timestamp)
      const pendingImportData = {
        fileName: fileName,
        timestamp: Date.now(),
        metadata: opts.metadata
      };
      
      localStorage.setItem('fishcad_pending_import', JSON.stringify(pendingImportData));
      
      console.log('Stored pending import data, initiating download...');
      
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
        
        // Construct the FISHCAD URL with pending parameter
        const fishcadUrl = `${opts.fishcadUrl}?pending=true`;
        
        // Redirect to FISHCAD
        if (opts.openInNewTab) {
          window.open(fishcadUrl, '_blank');
        } else {
          window.location.href = fishcadUrl;
        }
      }, 500); // Small delay to ensure download starts
    } catch (error) {
      console.error('Error initiating FISHCAD import:', error);
      alert('Failed to initiate import to FISHCAD. Please try again or contact support.');
    }
  };
  
  /**
   * Check if FISHCAD is available
   * @returns {boolean} - Whether FISHCAD is available
   */
  window.FishCAD.isAvailable = function() {
    try {
      // Check if localStorage is available
      if (!window.localStorage) return false;
      
      // Try to write and read from localStorage as a test
      localStorage.setItem('fishcad_test', '1');
      const test = localStorage.getItem('fishcad_test');
      localStorage.removeItem('fishcad_test');
      
      return test === '1';
    } catch (e) {
      return false;
    }
  };
  
  // Log that the script was loaded
  console.log('FISHCAD Import Helper loaded successfully');
})(); 