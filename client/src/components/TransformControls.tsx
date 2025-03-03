import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { 
  MoveIcon, 
  RotateCcwIcon, 
  BoxIcon, 
  ArrowUpIcon, 
  ArrowDownIcon, 
  ArrowLeftIcon, 
  ArrowRightIcon,
  GridIcon, 
  MagnetIcon,
  RotateCw,
  RefreshCw,
  MaximizeIcon,
  MinimizeIcon,
  Move,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  MousePointer,
  Ruler,
  Box
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Box3, Vector3 } from "three";
import { cn } from "@/lib/utils";

const TRANSFORM_MODES = [
  { id: "translate", label: "Move", icon: MoveIcon },
  { id: "rotate", label: "Rotate", icon: RotateCcwIcon },
  { id: "scale", label: "Scale", icon: BoxIcon },
] as const;

// Units constants
const POSITION_UNIT = "mm";
const ROTATION_UNIT = "°";
const SCALE_UNIT = "";
const DIMENSION_UNIT = "mm";

// Maximum scale is now more conservative to prevent exceeding 10 inches
const MAX_SCALE = 42; // This allows scaling up to 10 inches for models that start at 6mm
const MM_PER_INCH = 25.4;

// Helper function to format scale display
const formatScale = (scale: number) => {
  return `${scale.toFixed(2)}${SCALE_UNIT}`;
};

export function TransformControls({ className }: { className?: string }) {
  const { 
    transformMode, 
    setTransformMode, 
    applyTransform, 
    resetTransform,
    selectedModelIndex,
    models,
    setModelPosition,
    setModelRotation,
    setModelScale,
    snapSettings,
    toggleSnap,
    updateSnapSettings,
    unit,
    setUnit,
    convertValue
  } = useScene();
  
  // State for direct input values
  const [positionValues, setPositionValues] = useState({ x: 0, y: 0, z: 0 });
  const [rotationValues, setRotationValues] = useState({ x: 0, y: 0, z: 0 });
  const [scaleValues, setScaleValues] = useState({ x: 1, y: 1, z: 1 });
  const [uniformScale, setUniformScale] = useState(1);
  const [useUniformScale, setUseUniformScale] = useState(false);
  
  // State for slider controls
  const [xPosition, setXPosition] = useState(0);
  const [yPosition, setYPosition] = useState(0);
  const [zPosition, setZPosition] = useState(0);
  const [xRotation, setXRotation] = useState(0);
  const [yRotation, setYRotation] = useState(0);
  const [zRotation, setZRotation] = useState(0);
  const [xScale, setXScale] = useState(1);
  const [yScale, setYScale] = useState(1);
  const [zScale, setZScale] = useState(1);
  
  // State for dimensions of the selected model
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, depth: 0 });
  
  // Update input fields when selected model changes
  useEffect(() => {
    if (selectedModelIndex !== null && models[selectedModelIndex]) {
      const model = models[selectedModelIndex];
      
      // Position values
      const posX = parseFloat(model.mesh.position.x.toFixed(2));
      const posY = parseFloat(model.mesh.position.y.toFixed(2));
      const posZ = parseFloat(model.mesh.position.z.toFixed(2));
      
      setPositionValues({ x: posX, y: posY, z: posZ });
      setXPosition(posX);
      setYPosition(posY);
      setZPosition(posZ);
      
      // Rotation values
      const rotX = parseFloat(model.mesh.rotation.x.toFixed(2));
      const rotY = parseFloat(model.mesh.rotation.y.toFixed(2));
      const rotZ = parseFloat(model.mesh.rotation.z.toFixed(2));
      
      setRotationValues({ x: rotX, y: rotY, z: rotZ });
      setXRotation(rotX);
      setYRotation(rotY);
      setZRotation(rotZ);
      
      // Scale values
      const sclX = parseFloat(model.mesh.scale.x.toFixed(2));
      const sclY = parseFloat(model.mesh.scale.y.toFixed(2));
      const sclZ = parseFloat(model.mesh.scale.z.toFixed(2));
      
      setScaleValues({ x: sclX, y: sclY, z: sclZ });
      setXScale(sclX);
      setYScale(sclY);
      setZScale(sclZ);
      
      // Use the average of all scales for uniform scale
      setUniformScale(
        parseFloat(((sclX + sclY + sclZ) / 3).toFixed(2))
      );

      // Calculate and update dimensions
      if (model.mesh.geometry) {
        model.mesh.geometry.computeBoundingBox();
        const bbox = model.mesh.geometry.boundingBox || new Box3();
        const size = new Vector3();
        bbox.getSize(size);
        
        // Apply scale to get actual dimensions
        const width = parseFloat((size.x * sclX).toFixed(2));
        const height = parseFloat((size.y * sclY).toFixed(2));
        const depth = parseFloat((size.z * sclZ).toFixed(2));
        
        setDimensions({ width, height, depth });
      }
    }
  }, [selectedModelIndex, models]);
  
  // Handle transform operations
  const handleTransform = (operation: string, direction: number) => {
    applyTransform(operation as any, direction as any);
  };
  
  // Handle slider position change
  const handlePositionSliderChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (selectedModelIndex === null) return;
    
    let newPosition = { ...positionValues };
    
    if (axis === 'x') {
      newPosition.x = value;
      setXPosition(value);
    } else if (axis === 'y') {
      // Y input controls Z (height)
      newPosition.z = value;
      setZPosition(value);
    } else {
      // Z input controls Y (depth)
      newPosition.y = value;
      setYPosition(value);
    }
    
    setPositionValues(newPosition);
    setModelPosition(newPosition.x, newPosition.y, newPosition.z);
  };
  
  // Handle slider rotation change
  const handleRotationSliderChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (selectedModelIndex === null) return;
    
    let newRotation = { ...rotationValues };
    
    if (axis === 'x') {
      newRotation.x = value;
      setXRotation(value);
    } else if (axis === 'y') {
      // Y input controls Z rotation
      newRotation.z = value;
      setZRotation(value);
    } else {
      // Z input controls Y rotation
      newRotation.y = value;
      setYRotation(value);
    }
    
    setRotationValues(newRotation);
    setModelRotation(newRotation.x, newRotation.y, newRotation.z);
  };
  
  // Handle slider scale change
  const handleScaleSliderChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (selectedModelIndex === null) return;
    
    let newScale = { ...scaleValues };
    
    if (axis === 'x') {
      newScale.x = value;
      setXScale(value);
    } else if (axis === 'y') {
      // Y input controls Z scale
      newScale.z = value;
      setZScale(value);
    } else {
      // Z input controls Y scale
      newScale.y = value;
      setYScale(value);
    }
    
    setScaleValues(newScale);
    setModelScale(newScale.x, newScale.y, newScale.z);

    // Update dimensions after scale change
    if (selectedModelIndex !== null && models[selectedModelIndex]) {
      const model = models[selectedModelIndex];
      if (model.mesh.geometry) {
        model.mesh.geometry.computeBoundingBox();
        if (model.mesh.geometry.boundingBox) {
          const size = new Vector3();
          model.mesh.geometry.boundingBox.getSize(size);
          
          // Apply the current scale to get actual dimensions
          const width = parseFloat((size.x * newScale.x).toFixed(2));
          const height = parseFloat((size.y * newScale.y).toFixed(2));
          const depth = parseFloat((size.z * newScale.z).toFixed(2));
          
          console.log(`Updated dimensions: ${width.toFixed(2)}mm × ${height.toFixed(2)}mm × ${depth.toFixed(2)}mm`);
          console.log(`Updated dimensions: ${(width/25.4).toFixed(2)}in × ${(height/25.4).toFixed(2)}in × ${(depth/25.4).toFixed(2)}in`);
          
          setDimensions({ width, height, depth });
        }
      }
    }
  };
  
  // Handle uniform scale slider change
  const handleUniformScaleSliderChange = (value: number) => {
    if (selectedModelIndex === null) return;
    
    setUniformScale(value);
    setScaleValues({ x: value, y: value, z: value });
    setXScale(value);
    setYScale(value);
    setZScale(value);
    setModelScale(value, value, value);

    // Update dimensions after uniform scale change
    if (selectedModelIndex !== null && models[selectedModelIndex]) {
      const model = models[selectedModelIndex];
      if (model.mesh.geometry) {
        // Ensure we compute the current bounding box for accurate dimensions
        model.mesh.geometry.computeBoundingBox();
        if (model.mesh.geometry.boundingBox) {
          const size = new Vector3();
          model.mesh.geometry.boundingBox.getSize(size);
          
          // Apply the uniform scale to get actual dimensions
          const width = parseFloat((size.x * value).toFixed(2));
          const height = parseFloat((size.y * value).toFixed(2));
          const depth = parseFloat((size.z * value).toFixed(2));
          
          console.log(`Updated dimensions (uniform): ${width.toFixed(2)}mm × ${height.toFixed(2)}mm × ${depth.toFixed(2)}mm`);
          console.log(`Updated dimensions (uniform): ${(width/25.4).toFixed(2)}in × ${(height/25.4).toFixed(2)}in × ${(depth/25.4).toFixed(2)}in`);
          
          setDimensions({ width, height, depth });
        }
      }
    }
  };
  
  const getAxisColor = (axis: 'x' | 'y' | 'z') => {
    return axis === 'x' ? "bg-red-500" : axis === 'y' ? "bg-green-500" : "bg-blue-500";
  };
  
  // Add a function to get the dimension unit
  const getDimensionUnit = () => {
    return unit === 'mm' ? 'mm' : 'in';
  };
  
  // Format a value with the appropriate unit
  const formatDimension = (value: number) => {
    if (unit === 'in') {
      return `${(value / 25.4).toFixed(3)} in`;
    }
    return `${value.toFixed(1)} mm`;
  };
  
  // Toggle between mm and in
  const toggleUnit = () => {
    setUnit(unit === 'mm' ? 'in' : 'mm');
  };
  
  // Add a function to format position values based on current unit
  const formatPosition = (value: number) => {
    return unit === 'mm' 
      ? value.toFixed(2) 
      : convertValue(value, 'mm', 'in').toFixed(3);
  };

  // Add new handlers for number inputs
  const handlePositionInputChange = (axis: 'x' | 'y' | 'z', value: string) => {
    if (selectedModelIndex === null) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    handlePositionSliderChange(axis, numValue);
  };

  const handleRotationInputChange = (axis: 'x' | 'y' | 'z', value: string) => {
    if (selectedModelIndex === null) return;
    
    const numValue = parseFloat(value) * Math.PI / 180; // Convert degrees to radians
    if (isNaN(numValue)) return;
    
    handleRotationSliderChange(axis, numValue);
  };

  const handleScaleInputChange = (axis: 'x' | 'y' | 'z', value: string) => {
    if (selectedModelIndex === null) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    handleScaleSliderChange(axis, numValue);
  };

  const handleUniformScaleInputChange = (value: string) => {
    if (selectedModelIndex === null) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    handleUniformScaleSliderChange(numValue);
  };

  return (
    <div className={cn("p-4", className)}>
      <h3 className="text-lg font-semibold mb-4">Transform Controls</h3>
      
      <div className="space-y-4">
      <div className="flex space-x-2">
        <Button
          variant={transformMode === "translate" ? "default" : "outline"}
            className="flex-1"
          onClick={() => setTransformMode("translate")}
        >
          Move
        </Button>
        <Button
          variant={transformMode === "rotate" ? "default" : "outline"}
            className="flex-1"
          onClick={() => setTransformMode("rotate")}
        >
          Rotate
        </Button>
        <Button
          variant={transformMode === "scale" ? "default" : "outline"}
            className="flex-1"
          onClick={() => setTransformMode("scale")}
        >
          Scale
        </Button>
        </div>

        {/* Model Info and Utilities */}
        <div className="flex flex-wrap justify-between items-center pt-2 mt-2 border-t border-border gap-2">
          {/* Model dimensions */}
          <div className="flex flex-col">
            <div className="flex flex-wrap gap-2 text-xs">
              <Button 
                variant="outline" 
                size="sm"
                onClick={toggleUnit}
                className="h-6 text-xs font-normal"
              >
                {unit.toUpperCase()}
              </Button>
              <div className="flex items-center gap-1">
                <Box className="h-3 w-3 text-red-500" />
                <span>W: {formatDimension(dimensions.width)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Box className="h-3 w-3 text-blue-500" />
                <span>H: {formatDimension(dimensions.height)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Box className="h-3 w-3 text-green-500" />
                <span>D: {formatDimension(dimensions.depth)}</span>
              </div>
            </div>
          </div>

          {/* Reset transform button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetTransform()}
            className="h-7"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </div>

        {selectedModelIndex === null ? (
          <div className="text-center p-4 text-sm text-muted-foreground">
            Select a model to transform it
          </div>
        ) : (
          <>
            {transformMode === "translate" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-position" className="text-red-500">X Position</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={formatPosition(xPosition)}
                        onChange={(e) => handlePositionInputChange('x', e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">
                        {getDimensionUnit()}
                      </span>
                    </div>
                  </div>
                  <Slider 
                    id="x-position"
                    min={-200} 
                    max={200} 
                    step={1} 
                    value={[xPosition]} 
                    onValueChange={(values) => handlePositionSliderChange('x', values[0])}
                    className="slider-red"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="y-position" className="text-blue-500">Y Position</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={formatPosition(zPosition)}
                        onChange={(e) => handlePositionInputChange('y', e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">
                        {getDimensionUnit()}
                      </span>
                    </div>
                  </div>
                  <Slider 
                    id="y-position"
                    min={-200} 
                    max={200} 
                    step={1} 
                    value={[zPosition]} 
                    onValueChange={(values) => handlePositionSliderChange('y', values[0])}
                    className="slider-blue"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="z-position" className="text-green-500">Z Position</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={formatPosition(yPosition)}
                        onChange={(e) => handlePositionInputChange('z', e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">
                        {getDimensionUnit()}
                      </span>
                    </div>
                  </div>
                  <Slider 
                    id="z-position"
                    min={-200} 
                    max={200} 
                    step={1} 
                    value={[yPosition]} 
                    onValueChange={(values) => handlePositionSliderChange('z', values[0])}
                    className="slider-green"
                  />
                </div>
              </div>
            )}
            
            {transformMode === "rotate" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-rotation" className="text-red-500">X Rotation</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={(xRotation * 180 / Math.PI).toFixed(0)}
                        onChange={(e) => handleRotationInputChange('x', e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">{ROTATION_UNIT}</span>
                    </div>
                  </div>
                  <Slider 
                    id="x-rotation"
                    min={-Math.PI} 
                    max={Math.PI} 
                    step={Math.PI / 180} 
                    value={[xRotation]} 
                    onValueChange={(values) => handleRotationSliderChange('x', values[0])}
                    className="slider-red"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="y-rotation" className="text-blue-500">Y Rotation</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={(zRotation * 180 / Math.PI).toFixed(0)}
                        onChange={(e) => handleRotationInputChange('y', e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">{ROTATION_UNIT}</span>
                    </div>
                  </div>
                  <Slider 
                    id="y-rotation"
                    min={-Math.PI} 
                    max={Math.PI} 
                    step={Math.PI / 180} 
                    value={[zRotation]} 
                    onValueChange={(values) => handleRotationSliderChange('y', values[0])}
                    className="slider-blue"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="z-rotation" className="text-green-500">Z Rotation</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={(yRotation * 180 / Math.PI).toFixed(0)}
                        onChange={(e) => handleRotationInputChange('z', e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">{ROTATION_UNIT}</span>
                    </div>
                  </div>
                  <Slider 
                    id="z-rotation"
                    min={-Math.PI} 
                    max={Math.PI} 
                    step={Math.PI / 180} 
                    value={[yRotation]} 
                    onValueChange={(values) => handleRotationSliderChange('z', values[0])}
                    className="slider-green"
                  />
                </div>
              </div>
            )}
            
            {transformMode === "scale" && (
              <div className="space-y-4">
                {/* Uniform scale toggle */}
                <div className="flex items-center space-x-2 mb-2">
                  <Checkbox 
                    id="uniform-scale" 
                    checked={useUniformScale}
                    onCheckedChange={(checked) => setUseUniformScale(!!checked)}
                  />
                  <Label htmlFor="uniform-scale">Use uniform scale</Label>
                </div>

                {useUniformScale ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="uniform-scale" className="text-purple-500">Uniform Scale</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={uniformScale.toFixed(2)}
                          onChange={(e) => handleUniformScaleInputChange(e.target.value)}
                          min={0.01}
                          max={MAX_SCALE}
                          step={0.01}
                          className="w-20 h-8"
                        />
                        <span className="text-xs text-muted-foreground">{SCALE_UNIT}</span>
                      </div>
                    </div>
                    <Slider 
                      id="uniform-scale"
                      min={0.01} 
                      max={MAX_SCALE} 
                      step={0.01} 
                      value={[uniformScale]} 
                      onValueChange={(values) => handleUniformScaleSliderChange(values[0])}
                      className="slider-purple"
                    />
                  </div>
                ) : (
                  // Per-axis scale sliders
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="x-scale" className="text-red-500">X Scale</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={xScale.toFixed(2)}
                            onChange={(e) => handleScaleInputChange('x', e.target.value)}
                            min={0.01}
                            max={MAX_SCALE}
                            step={0.01}
                            className="w-20 h-8"
                          />
                          <span className="text-xs text-muted-foreground">{SCALE_UNIT}</span>
                        </div>
                      </div>
                      <Slider 
                        id="x-scale"
                        min={0.01} 
                        max={MAX_SCALE} 
                        step={0.01} 
                        value={[xScale]} 
                        onValueChange={(values) => handleScaleSliderChange('x', values[0])}
                        className="slider-red"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="y-scale" className="text-blue-500">Y Scale</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={zScale.toFixed(2)}
                            onChange={(e) => handleScaleInputChange('y', e.target.value)}
                            min={0.01}
                            max={MAX_SCALE}
                            step={0.01}
                            className="w-20 h-8"
                          />
                          <span className="text-xs text-muted-foreground">{SCALE_UNIT}</span>
                        </div>
                      </div>
                      <Slider 
                        id="y-scale"
                        min={0.01} 
                        max={MAX_SCALE} 
                        step={0.01} 
                        value={[zScale]} 
                        onValueChange={(values) => handleScaleSliderChange('y', values[0])}
                        className="slider-blue"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="z-scale" className="text-green-500">Z Scale</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={yScale.toFixed(2)}
                            onChange={(e) => handleScaleInputChange('z', e.target.value)}
                            min={0.01}
                            max={MAX_SCALE}
                            step={0.01}
                            className="w-20 h-8"
                          />
                          <span className="text-xs text-muted-foreground">{SCALE_UNIT}</span>
                        </div>
                      </div>
                      <Slider 
                        id="z-scale"
                        min={0.01} 
                        max={MAX_SCALE} 
                        step={0.01} 
                        value={[yScale]} 
                        onValueChange={(values) => handleScaleSliderChange('z', values[0])}
                        className="slider-green"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
