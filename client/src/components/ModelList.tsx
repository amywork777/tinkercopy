import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScene } from "@/hooks/use-scene";
import { TrashIcon, ImportIcon, Layers, Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function ModelList() {
  const { 
    models, 
    loadSTL, 
    removeModel, 
    selectModel, 
    selectedModelIndex,
    secondaryModelIndex,
    selectSecondaryModel
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
    
    // If already selected as primary, select as secondary instead
    if (index === selectedModelIndex) {
      selectSecondaryModel(index);
      selectModel(null);
      return;
    }
    
    // If no primary model is selected, select as primary
    if (selectedModelIndex === null) {
      selectModel(index);
      return;
    }
    
    // If there's already a primary model selected, select this as secondary
    selectSecondaryModel(index);
    
    const modelName = models[index]?.name || 'Model';
    toast.info(
      `Selected ${modelName}`,
      {
        description: "Now you can transform or combine models"
      }
    );
  };

  const handleDeleteModel = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const modelName = models[index]?.name || 'Model';
    
    // Ensure we deselect this model first
    if (selectedModelIndex === index) {
      selectModel(null);
    }
    if (secondaryModelIndex === index) {
      selectSecondaryModel(null);
    }
    
    removeModel(index);
    toast.info(`Deleted ${modelName}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Model Library</h3>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => document.getElementById('file-input')?.click()}
          className="flex gap-2 h-8"
        >
          <ImportIcon className="h-4 w-4" />
          <span className="text-xs">Import STL</span>
          <input
            id="file-input"
            type="file"
            accept=".stl"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </Button>
      </div>
      
      {models.length === 0 ? (
        <Card className="p-3 bg-muted/40 text-xs text-center">
          <p>No models imported yet</p>
          <p className="text-muted-foreground mt-1">Import an STL file to get started</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <ScrollArea className="h-[250px] rounded-md border">
            <div className="p-2 space-y-1">
              {models.map((model, index) => {
                const isPrimary = selectedModelIndex === index;
                const isSecondary = secondaryModelIndex === index;
                
                let className = "flex items-center justify-between p-2 rounded-md ";
                if (isPrimary) {
                  className += "bg-blue-600/20 border border-blue-600/40";
                } else if (isSecondary) {
                  className += "bg-green-600/20 border border-green-600/40";
                } else {
                  className += "hover:bg-accent";
                }
                
                return (
                  <div
                    key={model.id}
                    className={className}
                    onClick={() => handleSelectModel(index)}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="text-sm truncate flex-1">{model.name}</span>
                    <div className="flex items-center">
                      {isPrimary && (
                        <Badge variant="outline" className="mr-1 bg-blue-600/20 text-blue-600 text-[10px] h-5">
                          Primary
                        </Badge>
                      )}
                      {isSecondary && (
                        <Badge variant="outline" className="mr-1 bg-green-600/20 text-green-600 text-[10px] h-5">
                          Secondary
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-1 hover:bg-destructive/10"
                        onClick={(e) => handleDeleteModel(index, e)}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          
          {/* Delete All Models Button */}
          {models.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                models.forEach((_, index) => removeModel(0));
                selectModel(null);
                selectSecondaryModel(null);
                toast.info("All models deleted");
              }}
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete All Models
            </Button>
          )}
        </div>
      )}
    </div>
  );
}