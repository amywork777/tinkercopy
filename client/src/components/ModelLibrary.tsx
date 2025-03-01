import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useScene } from "@/hooks/use-scene";
import { TrashIcon, UploadIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function ModelLibrary() {
  const { 
    models, 
    loadSTL, 
    removeModel, 
    selectModel, 
    selectedModelIndex,
    secondaryModelIndex,
    selectSecondaryModel,
    exportSelectedModelAsSTL
  } = useScene();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      
      // Check if it's an STL file
      if (!file.name.toLowerCase().endsWith('.stl')) {
        toast.error("Please select an STL file");
        return;
      }
      
      await loadSTL(file);
      toast.success(`Loaded ${file.name}`);
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to load model");
    } finally {
      // Reset the input
      event.target.value = '';
    }
  };

  const handleSelectModel = (index: number) => {
    // If selecting the secondary model again, deselect it
    if (index === secondaryModelIndex) {
      selectSecondaryModel(null);
      return;
    }
    
    // If ctrl/cmd key is pressed, select as secondary model instead of primary
    if (window.event && (window.event as any).ctrlKey) {
      // Don't allow selecting the same model as both primary and secondary
      if (index === selectedModelIndex) {
        toast.error("Cannot select the same model as both primary and secondary");
        return;
      }
      
      selectSecondaryModel(index);
      const modelName = models[index]?.name || 'Model';
      toast.info(`Selected ${modelName} as secondary model`);
      return;
    }
    
    selectModel(index);
    
    const modelName = models[index]?.name || 'Model';
    toast.info(`Selected ${modelName}`);
  };

  const handleExportSTL = () => {
    if (selectedModelIndex === null) {
      toast.error("No model selected to export");
      return;
    }
    
    try {
      exportSelectedModelAsSTL();
      toast.success("Model exported as STL file");
    } catch (error) {
      console.error("Error exporting STL:", error);
      toast.error("Failed to export model");
    }
  };

  return (
    <div className="p-4 border-b">
      <h3 className="text-lg font-semibold mb-4">Model Library</h3>
      
      <div className="flex flex-col space-y-4">
        <Button 
          variant="outline" 
          className="w-full py-6 border-dashed flex flex-col space-y-2"
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="flex items-center justify-center">
            <UploadIcon className="h-6 w-6 mr-2" />
            <span>Import STL</span>
          </div>
          {models.length === 0 && (
            <div className="text-xs text-muted-foreground">
              Drag and drop STL files here<br/>or click to browse
            </div>
          )}
          <input
            id="file-input"
            type="file"
            accept=".stl"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </Button>
        
        {models.length > 0 && (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleExportSTL}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Export as STL
          </Button>
        )}
      </div>
    </div>
  );
} 