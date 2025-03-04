import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import * as THREE from "three";
import { Box3, Vector3 } from "three";

const MM_PER_INCH = 25.4;
const MAX_SIZE_INCHES = 10;
const MAX_SIZE_MM = MAX_SIZE_INCHES * MM_PER_INCH;

type ScaleMode = "fit-to-size" | "custom-scale";
type Unit = "in" | "mm";

interface ImportScaleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  geometry: THREE.BufferGeometry;
  onScale: (scale: Vector3) => void;
}

export function ImportScaleDialog({ isOpen, onClose, geometry, onScale }: ImportScaleDialogProps) {
  const [scaleMode, setScaleMode] = useState<ScaleMode>("fit-to-size");
  const [size, setSize] = useState("2");
  const [scaleFactor, setScaleFactor] = useState("1");
  const [unit, setUnit] = useState<Unit>("in");
  
  // Calculate current model dimensions
  const bbox = new Box3();
  const position = geometry.getAttribute("position");
  if (position instanceof THREE.BufferAttribute) {
    bbox.setFromBufferAttribute(position);
  } else {
    // For InterleavedBufferAttribute, we need to create a temporary BufferAttribute
    const tempPositions = new Float32Array(position.array);
    const tempAttribute = new THREE.BufferAttribute(tempPositions, 3);
    bbox.setFromBufferAttribute(tempAttribute);
  }
  
  const modelSize = new Vector3();
  bbox.getSize(modelSize);
  
  // Convert to display units
  const currentSize = {
    width: unit === "in" ? (modelSize.x / MM_PER_INCH).toFixed(2) : modelSize.x.toFixed(1),
    height: unit === "in" ? (modelSize.y / MM_PER_INCH).toFixed(2) : modelSize.y.toFixed(1),
    depth: unit === "in" ? (modelSize.z / MM_PER_INCH).toFixed(2) : modelSize.z.toFixed(1)
  };

  // Handle unit change
  const handleUnitChange = (newUnit: Unit) => {
    if (scaleMode === "fit-to-size") {
      // Convert the target size value when changing units
      const currentValue = parseFloat(size);
      if (!isNaN(currentValue)) {
        const newValue = newUnit === "in" 
          ? (currentValue / MM_PER_INCH).toFixed(2)
          : (currentValue * MM_PER_INCH).toFixed(1);
        setSize(newValue);
      }
    }
    setUnit(newUnit);
  };

  // Calculate preview dimensions
  const previewDimensions = useMemo(() => {
    let scale = new Vector3(1, 1, 1);
    
    if (scaleMode === "fit-to-size") {
      const targetSize = parseFloat(size);
      if (isNaN(targetSize)) return null;
      
      // Convert target size to mm for calculations
      const targetSizeMM = unit === "in" ? targetSize * MM_PER_INCH : targetSize;
      const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
      const scaleFactor = targetSizeMM / maxDim;
      scale.set(scaleFactor, scaleFactor, scaleFactor);
    } else {
      const factor = parseFloat(scaleFactor);
      if (isNaN(factor)) return null;
      scale.set(factor, factor, factor);
    }
    
    // Check max size limit
    const finalSize = new Vector3(
      modelSize.x * scale.x,
      modelSize.y * scale.y,
      modelSize.z * scale.z
    );
    
    const maxDim = Math.max(finalSize.x, finalSize.y, finalSize.z);
    if (maxDim > MAX_SIZE_MM) {
      const reduction = MAX_SIZE_MM / maxDim;
      scale.multiplyScalar(reduction);
      finalSize.multiplyScalar(reduction);
    }
    
    return {
      width: unit === "in" ? (finalSize.x / MM_PER_INCH).toFixed(2) : finalSize.x.toFixed(1),
      height: unit === "in" ? (finalSize.y / MM_PER_INCH).toFixed(2) : finalSize.y.toFixed(1),
      depth: unit === "in" ? (finalSize.z / MM_PER_INCH).toFixed(2) : finalSize.z.toFixed(1)
    };
  }, [modelSize, scaleMode, size, scaleFactor, unit]);

  const handleScale = () => {
    let scale = new Vector3(1, 1, 1);
    
    if (scaleMode === "fit-to-size") {
      const targetSize = parseFloat(size);
      if (isNaN(targetSize)) return;
      
      // Convert target size to mm for calculations
      const targetSizeMM = unit === "in" ? targetSize * MM_PER_INCH : targetSize;
      
      // Scale based on the largest dimension
      const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
      const scaleFactor = targetSizeMM / maxDim;
      scale.set(scaleFactor, scaleFactor, scaleFactor);
    } 
    else if (scaleMode === "custom-scale") {
      const factor = parseFloat(scaleFactor);
      if (isNaN(factor)) return;
      scale.set(factor, factor, factor);
    }
    
    // Ensure no dimension exceeds 10 inches
    const finalSize = new Vector3(
      modelSize.x * scale.x,
      modelSize.y * scale.y,
      modelSize.z * scale.z
    );
    
    const maxDim = Math.max(finalSize.x, finalSize.y, finalSize.z);
    if (maxDim > MAX_SIZE_MM) {
      const reduction = MAX_SIZE_MM / maxDim;
      scale.multiplyScalar(reduction);
    }
    
    onScale(scale);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            <span>Scale Model</span>
            <Select value={unit} onValueChange={(value: Unit) => handleUnitChange(value)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Inches</SelectItem>
                <SelectItem value="mm">Millimeters</SelectItem>
              </SelectContent>
            </Select>
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <div>Current size:</div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>Width: {currentSize.width}{unit}</div>
              <div>Height: {currentSize.height}{unit}</div>
              <div>Depth: {currentSize.depth}{unit}</div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Scaling Method</Label>
            <Select value={scaleMode} onValueChange={(value: ScaleMode) => setScaleMode(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fit-to-size">Fit to Size ({unit})</SelectItem>
                <SelectItem value="custom-scale">Custom Scale</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scaleMode === "fit-to-size" ? (
            <div className="space-y-2">
              <Label>Target Size ({unit})</Label>
              <Input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                min={0.01}
                max={unit === "in" ? MAX_SIZE_INCHES : MAX_SIZE_MM}
                step={unit === "in" ? 0.1 : 1}
              />
              <p className="text-sm text-muted-foreground">
                The model will be scaled so its largest dimension matches this size
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Scale Factor</Label>
              <Input
                type="number"
                value={scaleFactor}
                onChange={(e) => setScaleFactor(e.target.value)}
                min={0.01}
                step={0.1}
              />
              <p className="text-sm text-muted-foreground">
                Enter a number to scale the model uniformly (e.g., 2 = twice as large)
              </p>
            </div>
          )}

          {previewDimensions && (
            <div className="space-y-2 pt-4 border-t">
              <Label>Final Size Preview:</Label>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>Width: {previewDimensions.width}{unit}</div>
                <div>Height: {previewDimensions.height}{unit}</div>
                <div>Depth: {previewDimensions.depth}{unit}</div>
              </div>
              {Math.max(
                parseFloat(previewDimensions.width),
                parseFloat(previewDimensions.height),
                parseFloat(previewDimensions.depth)
              ) >= (unit === "in" ? MAX_SIZE_INCHES : MAX_SIZE_MM) && (
                <p className="text-sm text-yellow-600">
                  Note: Model will be automatically scaled down to fit within {unit === "in" ? MAX_SIZE_INCHES + '"' : MAX_SIZE_MM + "mm"}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleScale}>Apply Scale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 