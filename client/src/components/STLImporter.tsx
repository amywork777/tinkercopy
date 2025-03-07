import React, { useEffect, useState } from 'react';
import { toast } from "sonner";
import { Socket, io } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useScene } from '@/hooks/use-scene';
import { AlertCircle, CheckCircle, XCircle, ArrowUpCircle, RotateCw } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Define the allowed origins
const ALLOWED_ORIGINS = ["https://magic.taiyaki.ai", "https://library.taiyaki.ai"];

// Define the API endpoint
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://fishcad.com/api' 
  : 'http://localhost:3001/api';

// Define import job status types
type ImportJobStatus = 'pending' | 'downloading' | 'processing' | 'completed' | 'failed';

// Define import message structure
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

// Define import job structure
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

// Define active import structure
interface ActiveImport {
  id: string;
  job: ImportJob;
  source: string;
  progress: number;
}

// STL Importer component
export function STLImporter() {
  // State for socket and active imports
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeImports, setActiveImports] = useState<Record<string, ActiveImport>>({});
  const [expanded, setExpanded] = useState(false);
  
  // Get the scene functions
  const { loadSTL, selectModel, models } = useScene();
  
  // Initialize socket connection
  useEffect(() => {
    // Connect to the server socket
    const newSocket = io(API_BASE_URL.replace('/api', ''));
    
    // Set the socket to state
    setSocket(newSocket);
    
    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Socket.IO connected');
    });
    
    newSocket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });
    
    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket.IO connection error:', error);
    });
    
    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);
  
  // Set up event listeners for window messages
  useEffect(() => {
    // Message handler function
    const handleMessage = async (event: MessageEvent) => {
      // Security check for allowed origins
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
      
      // Check if this is an STL import message with a URL
      if ((message.type === 'import-stl' || message.type === 'stl-import') && message.stlUrl) {
        console.log(`Received STL import request from ${event.origin}`, message);
        
        // Show loading notification
        toast.loading(`Importing model from ${event.origin}...`, {
          id: "import-toast"
        });
        
        try {
          // Send the request to the server
          const response = await fetch(`${API_BASE_URL}/import-stl`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              stlUrl: message.stlUrl,
              fileName: message.fileName || 'model.stl',
              source: event.origin,
              metadata: message.metadata || {}
            })
          });
          
          const data = await response.json();
          
          if (data.success && data.importId) {
            // Join the socket room for this import
            if (socket) {
              socket.emit('join-import-room', data.importId);
            }
            
            // Add the import to active imports
            setActiveImports(prev => ({
              ...prev,
              [data.importId]: {
                id: data.importId,
                job: data.job,
                source: event.origin,
                progress: 0
              }
            }));
            
            // Expand the panel if it's the first import
            if (Object.keys(activeImports).length === 0) {
              setExpanded(true);
            }
            
            // Send success response back to origin
            sendResponseToOrigin(event.origin, {
              type: 'stl-import-response',
              success: true,
              importId: data.importId,
              message: 'Import started successfully'
            });
            
            // Update the toast
            toast.success(`Import started: ${message.fileName || 'model.stl'}`, {
              id: "import-toast"
            });
          } else {
            throw new Error(data.error || 'Failed to start import');
          }
        } catch (error) {
          console.error('Error starting import:', error);
          
          // Show error notification
          toast.error(`Failed to import model: ${(error as Error).message}`, {
            id: "import-toast"
          });
          
          // Send error response back to origin
          sendResponseToOrigin(event.origin, {
            type: 'stl-import-response',
            success: false,
            error: (error as Error).message
          });
        }
      }
    };
    
    // Add message event listener
    window.addEventListener('message', handleMessage);
    
    // Cleanup
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [socket, activeImports]);
  
  // Set up socket event listeners for import updates
  useEffect(() => {
    if (!socket) return;
    
    // Import status update handler
    const handleStatusUpdate = (data: any) => {
      const { importId, status, job } = data;
      
      // Update the import in state
      setActiveImports(prev => {
        if (!prev[importId]) return prev;
        
        const updatedImport = {
          ...prev[importId],
          job: job,
          progress: getProgressForStatus(status)
        };
        
        return {
          ...prev,
          [importId]: updatedImport
        };
      });
    };
    
    // Import completed handler
    const handleImportCompleted = async (data: any) => {
      const { importId, job } = data;
      
      // Get the import from state
      const activeImport = activeImports[importId];
      if (!activeImport) return;
      
      // Show success notification
      toast.success(`Model imported successfully: ${job.fileName}`, {
        id: `import-toast-${importId}`
      });
      
      try {
        // Load the model into the scene
        // In a real implementation, you would fetch the STL file from the server
        // and load it into the scene
        const modelUrl = `${API_BASE_URL}/models/${importId}`;
        await loadSTL(modelUrl, job.fileName);
        
        // Select the newly added model
        selectModel(models.length - 1);
        
        // Send success response to origin
        sendResponseToOrigin(activeImport.source, {
          type: 'stl-import-response',
          success: true,
          importId,
          message: 'Model loaded into scene'
        });
      } catch (error) {
        console.error('Error loading model into scene:', error);
        
        // Show error notification
        toast.error(`Failed to load model into scene: ${(error as Error).message}`, {
          id: `import-toast-${importId}`
        });
      }
    };
    
    // Import failed handler
    const handleImportFailed = (data: any) => {
      const { importId, error, job } = data;
      
      // Show error notification
      toast.error(`Import failed: ${error}`, {
        id: `import-toast-${importId}`
      });
      
      // Get the import from state
      const activeImport = activeImports[importId];
      if (!activeImport) return;
      
      // Send error response to origin
      sendResponseToOrigin(activeImport.source, {
        type: 'stl-import-response',
        success: false,
        importId,
        error
      });
    };
    
    // Add event listeners
    socket.on('import-status-update', handleStatusUpdate);
    socket.on('import-completed', handleImportCompleted);
    socket.on('import-failed', handleImportFailed);
    
    // Cleanup
    return () => {
      socket.off('import-status-update', handleStatusUpdate);
      socket.off('import-completed', handleImportCompleted);
      socket.off('import-failed', handleImportFailed);
    };
  }, [socket, activeImports, loadSTL, selectModel, models]);
  
  // Helper function to send a response to the origin
  const sendResponseToOrigin = (origin: string, data: any) => {
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
  };
  
  // Helper function to get progress percentage for a status
  const getProgressForStatus = (status: ImportJobStatus): number => {
    switch (status) {
      case 'pending':
        return 0;
      case 'downloading':
        return 30;
      case 'processing':
        return 70;
      case 'completed':
        return 100;
      case 'failed':
        return 100;
      default:
        return 0;
    }
  };
  
  // Helper function to get status icon
  const getStatusIcon = (status: ImportJobStatus) => {
    switch (status) {
      case 'pending':
        return <RotateCw className="animate-spin h-4 w-4 text-yellow-500" />;
      case 'downloading':
        return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
      case 'processing':
        return <RotateCw className="animate-spin h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };
  
  // If there are no active imports and the panel is not expanded, render nothing
  if (Object.keys(activeImports).length === 0 && !expanded) {
    return null;
  }
  
  // Render the importer UI
  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg border border-border max-h-[80vh] overflow-hidden flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">STL Imports</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
        {expanded && (
          <CardDescription className="text-xs">
            Manage STL models imported from external sites
          </CardDescription>
        )}
      </CardHeader>
      
      {expanded && (
        <CardContent className="overflow-y-auto">
          {Object.keys(activeImports).length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              No active imports
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {Object.values(activeImports).map((importItem) => (
                <AccordionItem key={importItem.id} value={importItem.id}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(importItem.job.status)}
                      <span className="truncate max-w-[180px]">
                        {importItem.job.fileName}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <span className="capitalize">{importItem.job.status}</span>
                      </div>
                      
                      <Progress value={importItem.progress} className="h-1" />
                      
                      <div className="flex justify-between">
                        <span>Source:</span>
                        <span className="truncate max-w-[140px]">{importItem.source}</span>
                      </div>
                      
                      {importItem.job.error && (
                        <div className="text-red-500 mt-1">
                          Error: {importItem.job.error}
                        </div>
                      )}
                      
                      {importItem.job.status === 'failed' && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full mt-2"
                          onClick={() => {
                            // Retry logic here
                            console.log('Retry import:', importItem.id);
                          }}
                        >
                          Retry Import
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default STLImporter; 