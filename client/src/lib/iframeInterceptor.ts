import { useScene } from "@/hooks/use-scene";
import { toast } from "sonner";

// The allowed origin for messages
const ALLOWED_ORIGIN = "https://library.taiyaki.ai";

/**
 * CORS Requirements for STL loading:
 * 
 * The server hosting the STL files at library.taiyaki.ai must include the following CORS headers:
 * - Access-Control-Allow-Origin: https://fishcad.com (or appropriate domain)
 * - Access-Control-Allow-Methods: GET
 * - Access-Control-Allow-Headers: Content-Type, Accept
 * 
 * Without these headers, the browser's security policy will prevent loading the STL files.
 */

// Interface for the message data structure
interface TaiyakiMessage {
  type: string;
  stlUrl?: string;
  [key: string]: any;
}

/**
 * Loads an STL model from a URL
 * @param url The URL of the STL file to load
 * @returns A Promise that resolves when the model is loaded
 */
async function loadSTLFromUrl(url: string): Promise<void> {
  try {
    // Show loading toast
    toast.info(`Importing model from ${ALLOWED_ORIGIN}...`);
    
    // Use the scene store's loadSTL function directly with the URL
    const { loadSTL, selectModel, models } = useScene.getState();
    
    // Load the STL file using the URL directly
    await loadSTL(url);
    
    // Select the newly added model
    selectModel(models.length - 1);
    
    // Show success toast
    toast.success(`Imported model from ${ALLOWED_ORIGIN}`);
  } catch (error) {
    console.error("Error loading STL from URL:", error);
    toast.error(`Failed to import model: ${(error as Error).message}`);
  }
}

/**
 * Initialize the message listener for Taiyaki Library STL imports
 */
export function initTaiyakiMessageListener(): () => void {
  // Handler function for message events
  const handleMessage = async (event: MessageEvent) => {
    // Verify the origin
    if (event.origin !== ALLOWED_ORIGIN) {
      console.log(`Ignored message from non-allowed origin: ${event.origin}`);
      return;
    }
    
    // Check if data exists and is in the expected format
    if (!event.data || typeof event.data !== 'object') {
      console.log('Ignored message: Invalid data format');
      return;
    }
    
    // Parse the message data
    const message = event.data as TaiyakiMessage;
    
    // Check if this is an STL import message
    if (message.type === 'import-stl' && message.stlUrl) {
      console.log(`Received STL import request from ${ALLOWED_ORIGIN}`, message);
      
      // Show loading toast
      toast.info(`Importing model from ${ALLOWED_ORIGIN}...`);
      
      // Load the STL file
      await loadSTLFromUrl(message.stlUrl);
    }
  };
  
  // Add the event listener
  window.addEventListener('message', handleMessage);
  
  // Return a cleanup function
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}

export default initTaiyakiMessageListener; 