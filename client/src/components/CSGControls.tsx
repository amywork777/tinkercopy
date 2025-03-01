import { useScene } from "@/hooks/use-scene";
import { Button } from "@/components/ui/button";
import { 
  Combine, 
  Scissors, 
  GitMerge,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type CSGOperationType = 'union' | 'subtract' | 'intersect';

export function CSGControls() {
  const { 
    models, 
    selectedModelIndex, 
    secondaryModelIndex,
    selectModel,
    selectSecondaryModel,
    performCSGOperation, 
    isCSGOperationLoading,
  } = useScene();
  const [currentOperation, setCurrentOperation] = useState<CSGOperationType | null>(null);
  
  const handleCSGOperation = async (operationType: CSGOperationType) => {
    if (models.length < 2) {
      toast.error("You need at least two models to perform CSG operations");
      return;
    }
    
    if (selectedModelIndex === null) {
      toast.error("No primary model selected");
      return;
    }
    
    if (secondaryModelIndex === null) {
      toast.error("No secondary model selected");
      return;
    }
    
    try {
      // Set current operation for loading UI
      setCurrentOperation(operationType);
      
      await performCSGOperation(operationType);
      
      toast.success(`Successfully performed ${operationType} operation`);
    } catch (error) {
      console.error("CSG operation failed:", error);
      toast.error("There was an error performing the operation");
    } finally {
      setCurrentOperation(null);
    }
  };

  const handlePrimaryModelChange = (value: string) => {
    const index = parseInt(value);
    if (!isNaN(index)) {
      selectModel(index);
      // If both models are the same, deselect the secondary
      if (index === secondaryModelIndex) {
        selectSecondaryModel(null);
      }
    }
  };

  const handleSecondaryModelChange = (value: string) => {
    const index = parseInt(value);
    if (!isNaN(index)) {
      selectSecondaryModel(index);
    }
  };

  return (
    <div className="p-4 border-b">
      <h3 className="text-lg font-semibold mb-4">CSG Operations</h3>
      
      {models.length < 2 ? (
        <div className="text-center p-3">
          <p className="text-sm">
            You need at least two models to perform CSG operations.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="primary-model">Primary Model</Label>
              <Select 
                value={selectedModelIndex !== null ? selectedModelIndex.toString() : undefined} 
                onValueChange={handlePrimaryModelChange}
              >
                <SelectTrigger id="primary-model" className="w-full">
                  <SelectValue placeholder="Select primary model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model, index) => (
                    <SelectItem key={model.id} value={index.toString()}>
                      {model.name || `Model ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="secondary-model">Secondary Model</Label>
              <Select 
                value={secondaryModelIndex !== null ? secondaryModelIndex.toString() : undefined}
                onValueChange={handleSecondaryModelChange}
              >
                <SelectTrigger id="secondary-model" className="w-full">
                  <SelectValue placeholder="Select secondary model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model, index) => (
                    <SelectItem 
                      key={model.id} 
                      value={index.toString()}
                      disabled={index === selectedModelIndex}
                    >
                      {model.name || `Model ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCSGOperation('union')}
              disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
            >
              {currentOperation === 'union' && isCSGOperationLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Union
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCSGOperation('subtract')}
              disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
            >
              {currentOperation === 'subtract' && isCSGOperationLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Subtract
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCSGOperation('intersect')}
              disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
            >
              {currentOperation === 'intersect' && isCSGOperationLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Intersect
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCSGOperation('subtract')}
              disabled={isCSGOperationLoading || selectedModelIndex === null || secondaryModelIndex === null}
            >
              {currentOperation === 'subtract' && isCSGOperationLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Difference
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 