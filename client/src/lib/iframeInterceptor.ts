import { useScene } from "@/hooks/use-scene";
import { toast } from "sonner";

// The allowed origins for messages
const ALLOWED_ORIGINS = ["https://magic.taiyaki.ai", "https://library.taiyaki.ai"];

/**
 * CORS Requirements for STL loading:
 * 
 * The server hosting the STL files must include the following CORS headers:
 * - Access-Control-Allow-Origin: https://fishcad.com (or appropriate domain)
 * - Access-Control-Allow-Methods: GET
 * - Access-Control-Allow-Headers: Content-Type, Accept
 * 
 * Without these headers, the browser's security policy will prevent loading the STL files.
 */

// Interface for the message data structure
interface STLImportMessage {
  type: string;
  stlUrl?: string;
  fileName?: string;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    license?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Import statistics tracking
interface ImportStats {
  totalImports: number;
  importsByOrigin: Record<string, number>;
  lastImportTime: Date | null;
  importErrors: number;
  successfulImports: number;
}

// Initialize import statistics
const importStats: ImportStats = {
  totalImports: 0,
  importsByOrigin: {},
  lastImportTime: null,
  importErrors: 0,
  successfulImports: 0
};

/**
 * Loads an STL model from a URL
 * @param url The URL of the STL file to load
 * @param metadata Additional metadata about the model
 * @param origin The origin of the request
 * @returns A Promise that resolves when the model is loaded
 */
async function loadSTLFromUrl(url: string, metadata?: STLImportMessage['metadata'], origin?: string): Promise<void> {
  // Show loading notification
  toast.loading(`Importing model from ${origin || "external source"}...`, {
    id: "import-toast"
  });
  
  try {
    // Use the scene store's loadSTL function directly with the URL
    const { loadSTL, selectModel, models } = useScene.getState();
    
    // Fetch the STL file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Convert response to blob
    const blob = await response.blob();
    
    // Create object URL
    const objectUrl = URL.createObjectURL(blob);
    
    // Load the STL file using the object URL
    await loadSTL(objectUrl, metadata?.name);
    
    // Revoke the object URL to free memory
    URL.revokeObjectURL(objectUrl);
    
    // Select the newly added model
    selectModel(models.length - 1);
    
    // Update import statistics
    updateImportStats(origin || "unknown", true);
    
    // Show success notification
    toast.success(`Imported model from ${origin || "external source"}`, {
      id: "import-toast"
    });
    
    // Send success response back to origin
    if (origin) {
      sendResponseToOrigin(origin, {
        type: "stl-import-response",
        success: true,
        message: "Model imported successfully"
      });
    }
  } catch (error) {
    // Update error statistics
    updateImportStats(origin || "unknown", false);
    
    // Show error notification
    toast.error(`Failed to import model: ${(error as Error).message}`, {
      id: "import-toast"
    });
    
    // Send error response back to origin
    if (origin) {
      sendResponseToOrigin(origin, {
        type: "stl-import-response",
        success: false,
        error: (error as Error).message
      });
    }
    
    console.error("Error loading STL from URL:", error);
  }
}

/**
 * Update the import statistics
 * @param origin The origin of the import
 * @param success Whether the import was successful
 */
function updateImportStats(origin: string, success: boolean): void {
  // Update total imports
  importStats.totalImports++;
  
  // Update imports by origin
  importStats.importsByOrigin[origin] = (importStats.importsByOrigin[origin] || 0) + 1;
  
  // Update last import time
  importStats.lastImportTime = new Date();
  
  // Update success/error counts
  if (success) {
    importStats.successfulImports++;
  } else {
    importStats.importErrors++;
  }
  
  // Log the import statistics
  console.log("Import statistics:", importStats);
}

/**
 * Send a response message back to the origin
 * @param origin The origin to send the message to
 * @param data The data to send
 */
function sendResponseToOrigin(origin: string, data: any): void {
  // Find all iframes in the document
  const iframes = document.querySelectorAll('iframe');
  let found = false;
  
  // Check each iframe
  iframes.forEach(iframe => {
    try {
      // Try to get the iframe's origin
      const iframeOrigin = new URL(iframe.src).origin;
      
      // If the origins match, send the message
      if (iframeOrigin === origin) {
        iframe.contentWindow?.postMessage(data, origin);
        found = true;
      }
    } catch (error) {
      // Ignore errors when trying to access iframe origins
      console.warn("Could not access iframe origin", error);
    }
  });
  
  // If no matching iframe was found, log a warning
  if (!found) {
    console.warn(`No iframe found with origin ${origin} to send response to`);
  }
}

/**
 * Handle incoming messages
 * @param event The message event
 */
async function handleIncomingMessage(event: MessageEvent): Promise<void> {
  // Verify the origin
  if (!ALLOWED_ORIGINS.includes(event.origin)) {
    console.log(`Ignored message from non-allowed origin: ${event.origin}`);
    return;
  }
  
  // Check if data exists and is in the expected format
  if (!event.data || typeof event.data !== 'object') {
    console.log('Ignored message: Invalid data format');
    return;
  }
  
  // Parse the message data
  const message = event.data as STLImportMessage;
  
  // Check if this is an STL import message
  if ((message.type === 'import-stl' || message.type === 'stl-import') && message.stlUrl) {
    console.log(`Received STL import request from ${event.origin}`, message);
    
    // Log import request
    console.log("Import request:", {
      origin: event.origin,
      url: message.stlUrl,
      metadata: message.metadata
    });
    
    // Load the STL file
    await loadSTLFromUrl(message.stlUrl, message.metadata, event.origin);
  }
}

/**
 * Initialize the message listener for STL imports
 */
export function initFishCadMessageListener(): () => void {
  // Add the event listener
  window.addEventListener('message', handleIncomingMessage);
  
  // Log initialization
  console.log(`FISHCAD Integration initialized with allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  
  // Return a cleanup function
  return () => {
    window.removeEventListener('message', handleIncomingMessage);
  };
}

/**
 * Get the import statistics
 * @returns The current import statistics
 */
export function getImportStats(): ImportStats {
  return { ...importStats };
}

export default initFishCadMessageListener; 