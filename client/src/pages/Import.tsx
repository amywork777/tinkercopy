import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useScene } from '@/hooks/use-scene';
import { toast } from 'sonner';
import { PendingImportDialog } from '@/components/PendingImportDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileUp, ExternalLink, Import } from 'lucide-react';

/**
 * Import page
 * 
 * This page handles imports from external sites like Taiyaki.
 * It supports various import methods:
 * 
 * 1. URL-based direct import: /import?url=https://example.com/model.stl
 * 2. File selection dialog: /import?name=model.stl
 * 3. Base64 data import: /import?data=BASE64_STL_DATA
 */
export default function ImportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loadSTL, selectModel, models } = useScene();
  
  // Extract params
  const stlUrl = searchParams.get('url');
  const fileName = searchParams.get('name') || 'model.stl';
  const stlData = searchParams.get('data');
  const source = searchParams.get('source') || 'external';
  
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMethod, setImportMethod] = useState<'url' | 'file' | 'data' | null>(null);
  
  // Effect to determine import method based on params
  useEffect(() => {
    if (stlUrl) {
      setImportMethod('url');
    } else if (stlData) {
      setImportMethod('data');
    } else {
      setImportMethod('file');
      setShowFileDialog(true);
    }
  }, [stlUrl, stlData]);
  
  // Effect to handle direct URL imports
  useEffect(() => {
    if (importMethod !== 'url' || !stlUrl) return;
    
    const importFromUrl = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        toast.loading(`Importing model from URL...`, {
          id: "import-toast"
        });
        
        // Import the model from URL
        await loadSTL(stlUrl, fileName);
        
        // Select the newly added model
        selectModel(models.length - 1);
        
        // Show success message
        toast.success(`Successfully imported ${fileName}`, {
          id: "import-toast"
        });
        
        // Redirect to home
        navigate('/');
      } catch (error) {
        console.error('Error importing from URL:', error);
        setError(error instanceof Error ? error.message : 'Failed to import model from URL');
        
        toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          id: "import-toast"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    importFromUrl();
  }, [importMethod, stlUrl, fileName, loadSTL, selectModel, models, navigate]);
  
  // Effect to handle base64 data imports
  useEffect(() => {
    if (importMethod !== 'data' || !stlData) return;
    
    const importFromData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        toast.loading(`Processing model data...`, {
          id: "import-toast"
        });
        
        // Import the model from base64 data
        await loadSTL(stlData, fileName);
        
        // Select the newly added model
        selectModel(models.length - 1);
        
        // Show success message
        toast.success(`Successfully imported ${fileName}`, {
          id: "import-toast"
        });
        
        // Redirect to home
        navigate('/');
      } catch (error) {
        console.error('Error importing from data:', error);
        setError(error instanceof Error ? error.message : 'Failed to import model data');
        
        toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          id: "import-toast"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    importFromData();
  }, [importMethod, stlData, fileName, loadSTL, selectModel, models, navigate]);
  
  // Close the file dialog and navigate home
  const handleClose = () => {
    setShowFileDialog(false);
    navigate('/');
  };
  
  // After successful import from file dialog
  const handleImportSuccess = () => {
    navigate('/');
  };
  
  // Render the import page
  return (
    <div className="container mx-auto py-8 px-4">
      {/* File selection dialog */}
      {importMethod === 'file' && (
        <PendingImportDialog
          isOpen={showFileDialog}
          onClose={handleClose}
          fileName={fileName}
          onSuccess={handleImportSuccess}
        />
      )}
      
      {/* Main content */}
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            <span>Import 3D Model</span>
          </CardTitle>
          <CardDescription>
            {importMethod === 'url' && 'Importing model from URL...'}
            {importMethod === 'data' && 'Processing model data...'}
            {importMethod === 'file' && 'Please select your file...'}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Importing your model...</p>
            </div>
          ) : error ? (
            <div className="py-8">
              <div className="text-red-500 mb-4">
                <h3 className="font-semibold">Import Failed</h3>
                <p>{error}</p>
              </div>
              
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                <Button onClick={() => navigate('/')}>
                  Return to FISHCAD
                </Button>
                
                {stlUrl && (
                  <Button variant="outline" asChild>
                    <a href={stlUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                      <Download className="h-4 w-4" />
                      <span>Download STL File</span>
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p>If import doesn't start automatically, click the button below:</p>
              <div className="mt-4">
                <Button onClick={() => navigate('/')}>
                  Return to FISHCAD
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 