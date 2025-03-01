import { ModelList } from "./ModelList";
import { TransformControls } from "./TransformControls";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { 
  Combine, 
  Scissors, 
  Shapes,
  GitMerge,
  Undo2,
  Redo2,
  Download,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";

type CSGOperationType = 'union' | 'subtract' | 'intersect';

export function Sidebar() {
  const { 
    models, 
    selectedModelIndex, 
    secondaryModelIndex,
    selectSecondaryModel,
    performCSGOperation, 
    undo, 
    redo, 
    canUndo,
    canRedo,
    isCSGOperationLoading,
    exportSelectedModelAsSTL
  } = useScene();
  const { toast } = useToast();
  const [currentOperation, setCurrentOperation] = useState<CSGOperationType | null>(null);
  
  const handleCSGOperation = async (operationType: CSGOperationType) => {
    if (models.length < 2) {
      toast({
        title: "Cannot perform CSG operation",
        description: "You need at least two models to perform a CSG operation",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedModelIndex === null) {
      toast({
        title: "No primary model selected",
        description: "Please select a model first to use as the primary object",
        variant: "destructive",
      });
      return;
    }
    
    if (secondaryModelIndex === null) {
      toast({
        title: "No secondary model selected",
        description: "Please select a second model to use for the CSG operation",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Set current operation for loading UI
      setCurrentOperation(operationType);
      
      await performCSGOperation(operationType);
      
      toast({
        title: "CSG Operation Complete",
        description: `Successfully performed ${operationType} operation`,
      });
    } catch (error) {
      console.error("CSG operation failed:", error);
      toast({
        title: "CSG Operation Failed",
        description: "There was an error performing the operation",
        variant: "destructive",
      });
    } finally {
      setCurrentOperation(null);
    }
  };
  
  const handleSecondaryModelSelect = (modelIndex: string) => {
    // Convert from string to number
    const index = parseInt(modelIndex, 10);
    
    // Check if valid
    if (isNaN(index) || index < 0 || index >= models.length) {
      selectSecondaryModel(null);
      return;
    }
    
    // Don't allow selecting the same model as primary
    if (index === selectedModelIndex) {
      toast({
        title: "Invalid Selection",
        description: "You cannot select the same model as both primary and secondary",
        variant: "destructive",
      });
      return;
    }
    
    selectSecondaryModel(index);
    
    toast({
      title: `Selected ${models[index].name} as secondary model`,
      description: "Now you can perform CSG operations between the primary and secondary models"
    });
  };
  
  const handleUndo = () => {
    try {
      undo();
      toast({
        title: "Action Undone",
        description: "Successfully reverted to previous state"
      });
    } catch (error) {
      console.error("Error during undo:", error);
      toast({
        title: "Undo Failed",
        description: "There was an error undoing the last action",
        variant: "destructive",
      });
    }
  };
  
  const handleRedo = () => {
    try {
      redo();
      toast({
        title: "Action Redone",
        description: "Successfully restored the action"
      });
    } catch (error) {
      console.error("Error during redo:", error);
      toast({
        title: "Redo Failed",
        description: "There was an error redoing the action",
        variant: "destructive",
      });
    }
  };
  
  const handleExportSTL = () => {
    if (selectedModelIndex === null) {
      toast({
        title: "No Model Selected",
        description: "Please select a model to export",
        variant: "destructive",
      });
      return;
    }
    
    try {
      exportSelectedModelAsSTL();
      toast({
        title: "Export Successful",
        description: "Model exported as STL file"
      });
    } catch (error) {
      console.error("Error exporting STL:", error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the model",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Card className="w-80 border-r rounded-none">
      <div className="p-4">
        <h2 className="text-xl font-bold">3D Model Fusion</h2>
        
        <div className="flex justify-between mt-2">
          <Button 
            variant="outline" 
            size="sm"
            disabled={!canUndo}
            onClick={handleUndo}
            className="flex-1 mr-1"
          >
            <Undo2 className="mr-1 h-4 w-4" />
            Undo
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            disabled={!canRedo}
            onClick={handleRedo}
            className="flex-1 ml-1"
          >
            <Redo2 className="mr-1 h-4 w-4" />
            Redo
          </Button>
        </div>
        
        <Separator className="my-4" />
        <TransformControls />
        <Separator className="my-4" />
        <ModelList />
        
        {selectedModelIndex !== null && (
          <div className="mt-4">
            <Button 
              className="w-full" 
              variant="outline"
              onClick={handleExportSTL}
            >
              <Download className="mr-2 h-4 w-4" />
              Export as STL
            </Button>
          </div>
        )}
        
        {models.length >= 2 && (
          <>
            <Separator className="my-4" />
            <div>
              <h3 className="font-medium mb-2">CSG Operations</h3>
              
              {selectedModelIndex !== null && (
                <div className="mb-3">
                  <label className="text-sm text-muted-foreground mb-1 block">
                    Select Secondary Model:
                  </label>
                  <Select 
                    value={secondaryModelIndex !== null ? secondaryModelIndex.toString() : ""} 
                    onValueChange={handleSecondaryModelSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model, index) => {
                        // Don't allow selecting the primary model as secondary
                        if (index === selectedModelIndex) return null;
                        
                        return (
                          <SelectItem 
                            key={model.id} 
                            value={index.toString()}
                          >
                            {model.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  
                  <div className="text-xs text-muted-foreground mt-1">
                    {secondaryModelIndex !== null ? (
                      <span>Primary: {models[selectedModelIndex].name} + Secondary: {models[secondaryModelIndex].name}</span>
                    ) : (
                      <span>Select a secondary model to use in CSG operations</span>
                    )}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Button 
                  className="w-full" 
                  variant="default"
                  onClick={() => handleCSGOperation('union')}
                  disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
                >
                  {isCSGOperationLoading && currentOperation === 'union' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Combine className="mr-2 h-4 w-4" />
                  )}
                  {isCSGOperationLoading && currentOperation === 'union' ? 'Processing...' : 'Union'}
                </Button>
                
                <Button 
                  className="w-full" 
                  variant="default"
                  onClick={() => handleCSGOperation('subtract')}
                  disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
                >
                  {isCSGOperationLoading && currentOperation === 'subtract' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Scissors className="mr-2 h-4 w-4" />
                  )}
                  {isCSGOperationLoading && currentOperation === 'subtract' ? 'Processing...' : 'Subtract'}
                </Button>
                
                <Button 
                  className="w-full" 
                  variant="default"
                  onClick={() => handleCSGOperation('intersect')}
                  disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
                >
                  {isCSGOperationLoading && currentOperation === 'intersect' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <GitMerge className="mr-2 h-4 w-4" />
                  )}
                  {isCSGOperationLoading && currentOperation === 'intersect' ? 'Processing...' : 'Intersect'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
