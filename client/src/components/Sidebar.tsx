import { ModelList } from "./ModelList";
import { TransformControls } from "./TransformControls";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { 
  Download,
  Plus, 
  List, 
  Settings, 
  Layers
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ViewOptions } from "./ViewOptions";
import { CSGControls } from "./CSGControls";

export function Sidebar() {
  const { 
    selectedModelIndex, 
    exportSelectedModelAsSTL,
    loadSTL
  } = useScene();
  const { toast } = useToast();
  
  const handleAddCube = () => {
    // This would need to be properly implemented
    toast({
      title: "Feature not available",
      description: "Adding primitive shapes is not yet implemented",
      variant: "destructive"
    });
  };

  const handleExportModel = () => {
    if (selectedModelIndex === null) {
      toast({
        title: "No model selected",
        description: "Please select a model to export",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the blob from the export function
      const blob = exportSelectedModelAsSTL();
      if (!blob) {
        throw new Error("Failed to generate STL file");
      }
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `model-export-${Date.now()}.stl`;
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Your model has been exported as STL"
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting your model",
        variant: "destructive",
      });
    }
  };

  const handleImportModel = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        await loadSTL(file);
        toast({
          title: "Import Successful",
          description: `Imported ${file.name}`
        });
      } catch (error) {
        console.error("Import error:", error);
        toast({
          title: "Import Failed",
          description: "There was an error importing your STL file",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold">3D Model Fusion</h2>
        
        <div className="flex flex-col space-y-2 mt-4">
          <Button
            variant="default"
            size="sm"
            className="justify-start"
            onClick={handleAddCube}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Cube
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={handleImportModel}
          >
            <Download className="mr-1 h-4 w-4" />
            Import STL
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={handleExportModel}
            disabled={selectedModelIndex === null}
          >
            <Download className="mr-1 h-4 w-4" />
            Export STL
          </Button>
        </div>
      </div>
      
      <Separator />
      
      <ViewOptions />
      
      <Separator />
      
      <div className="p-4 border-b">
        <ModelList />
      </div>
      
      <Separator />
      
      <TransformControls />
      
      <Separator />
      
      <CSGControls />
    </div>
  );
}
