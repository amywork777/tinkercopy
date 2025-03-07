import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useScene } from '@/hooks/use-scene';
import { Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';

interface PendingImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
}

export function PendingImportDialog({ isOpen, onClose, fileName }: PendingImportDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { loadSTL, selectModel, models } = useScene();
  
  // Function to handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check if the selected file has the same name as expected
    if (file.name !== fileName) {
      // Ask for confirmation if names don't match
      const confirmed = window.confirm(
        `The selected file name (${file.name}) doesn't match the expected file (${fileName}). Are you sure this is the correct file?`
      );
      
      if (!confirmed) {
        // Clear the file input
        event.target.value = '';
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      // Import the STL file
      await loadSTL(file);
      
      // Select the newly added model
      selectModel(models.length - 1);
      
      // Show success message
      toast.success(`Successfully imported ${file.name}`);
      
      // Close the dialog
      onClose();
    } catch (error) {
      console.error('Error importing STL file:', error);
      toast.error(`Failed to import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      
      // Clear the file input
      event.target.value = '';
    }
  };
  
  // Create a hidden file input element
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Function to trigger file browser
  const browseFiles = () => {
    fileInputRef.current?.click();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import your downloaded STL file</DialogTitle>
          <DialogDescription>
            Please select <strong>{fileName}</strong> from your downloads folder
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
            <Download className="h-10 w-10 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 mb-4">
              Select the STL file from your downloads folder
            </p>
            <Button 
              onClick={browseFiles} 
              disabled={isLoading}
              className="flex items-center"
            >
              <FileUp className="mr-2 h-4 w-4" />
              Browse...
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".stl"
              onChange={handleFileSelect}
              disabled={isLoading}
            />
          </div>
        </div>
        
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={browseFiles} disabled={isLoading}>
            Browse...
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PendingImportDialog; 