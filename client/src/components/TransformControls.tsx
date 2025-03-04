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
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Box3, Vector3 } from "three";
import { cn } from "@/lib/utils";
import { useDevice } from "@/lib/hooks/use-device";

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

// Maximum scale is now based on allowing models to reach reasonable size
const MAX_SCALE = 10; // Reduced from 100 to 10 for more intuitive scaling
const MAX_SCALE_FINE = 2; // For fine-tuning at lower scales
const MM_PER_INCH = 25.4;
const MAX_SIZE_MM = 254; // 10 inches in mm

// Helper function to format scale display
const formatScale = (scale: number) => {
  return scale >= 1 ? scale.toFixed(2) : scale.toFixed(3);
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
  
  const { isMobile, isTablet } = useDevice();
  const isSmallScreen = isMobile || isTablet;
  
  // State for direct input values
  const [positionValues, setPositionValues] = useState({ x: 0, y: 0, z: 0 });
  const [rotationValues, setRotationValues] = useState({ x: 0, y: 0, z: 0 });
  const [scaleValues, setScaleValues] = useState({ x: 1, y: 1, z: 1 });
  const [uniformScale, setUniformScale] = useState(1);
  const [useUniformScale, setUseUniformScale] = useState(false);
  const [scaleMode, setScaleMode] = useState('normal');
  
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
      newScale.z = value;
      setZScale(value);
    } else {
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
    <Card className={`shadow-md w-full backdrop-blur-sm ${isSmallScreen ? 'p-2' : 'p-3'}`}>
      <CardContent className="p-0">
        <div className="flex flex-col gap-2">
          {/* Transform tools */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {isSmallScreen ? (
                // More compact version for mobile
                <Tabs value={transformMode} onValueChange={setTransformMode} className="w-full">
                  <TabsList className="grid grid-cols-3 h-8">
                    {TRANSFORM_MODES.map((mode) => {
                      const Icon = mode.icon;
                      return (
                        <TabsTrigger
                          key={mode.id}
                          value={mode.id}
                          className="h-7 px-2"
                        >
                          <Icon className="h-4 w-4" />
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              ) : (
                // Full version for desktop
                <Tabs value={transformMode} onValueChange={setTransformMode} className="w-full">
                  <TabsList className="grid grid-cols-3">
                    {TRANSFORM_MODES.map((mode) => {
                      const Icon = mode.icon;
                      return (
                        <TabsTrigger
                          key={mode.id}
                          value={mode.id}
                          className="flex items-center gap-2"
                        >
                          <Icon className="h-4 w-4" />
                          <span>{mode.label}</span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              )}
            </div>
            
            {/* Space grid toggle - hide on very small screens */}
            {!isMobile && (
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Switch
                        id="grid-toggle"
                        checked={showGrid}
                        onCheckedChange={setShowGrid}
                        className="ml-auto"
                      />
                      <Label htmlFor="grid-toggle" className="ml-2">
                        <GridIcon className="h-4 w-4" />
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle Grid</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {/* Transform actions - simplify for mobile */}
          <TabsContent value="translate" className="mt-2 space-y-2">
            {isSmallScreen ? (
              // Simplified layout for mobile
              <CompactPositionControls 
                selectedModel={selectedModelIndex !== null ? models[selectedModelIndex] : null} 
                applyTransform={applyTransform} 
                formatSize={formatSize}
                precision={precisionValues}
              />
            ) : (
              // Full layout for desktop
              <FullPositionControls 
                selectedModel={selectedModelIndex !== null ? models[selectedModelIndex] : null} 
                applyTransform={applyTransform} 
                formatSize={formatSize}
                precision={precisionValues}
              />
            )}
          </TabsContent>
          
          {/* Other tabs content can be similarly adapted */}
          {/* ... existing code for other tabs ... */}
        </div>
      </CardContent>
    </Card>
  );
}

// Add these new components for mobile layout
function CompactPositionControls({ selectedModel, applyTransform, formatSize, precision }) {
  if (!selectedModel) return <div className="text-sm text-muted-foreground">No model selected</div>;
  
  return (
    <div className="grid grid-cols-3 gap-2">
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 w-full flex justify-center items-center" 
        onClick={() => applyTransform("position", { x: selectedModel.position.x - precision.position, y: selectedModel.position.y, z: selectedModel.position.z })}
      >
        <ArrowLeft className="h-3 w-3" />
        <span className="sr-only">Left</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 w-full flex justify-center items-center"
        onClick={() => applyTransform("position", { x: selectedModel.position.x, y: selectedModel.position.y + precision.position, z: selectedModel.position.z })}
      >
        <ArrowUp className="h-3 w-3" />
        <span className="sr-only">Up</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 w-full flex justify-center items-center"
        onClick={() => applyTransform("position", { x: selectedModel.position.x + precision.position, y: selectedModel.position.y, z: selectedModel.position.z })}
      >
        <ArrowRight className="h-3 w-3" />
        <span className="sr-only">Right</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 w-full flex justify-center items-center"
        onClick={() => applyTransform("position", { x: selectedModel.position.x, y: selectedModel.position.y - precision.position, z: selectedModel.position.z })}
      >
        <ArrowDown className="h-3 w-3" />
        <span className="sr-only">Down</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 w-full flex justify-center items-center"
        onClick={() => applyTransform("position", { x: selectedModel.position.x, y: selectedModel.position.y, z: selectedModel.position.z - precision.position })}
      >
        Z-
      </Button>
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 w-full flex justify-center items-center"
        onClick={() => applyTransform("position", { x: selectedModel.position.x, y: selectedModel.position.y, z: selectedModel.position.z + precision.position })}
      >
        Z+
      </Button>
    </div>
  );
}

function FullPositionControls({ selectedModel, applyTransform, formatSize, precision }) {
  // Implementation of the existing desktop controls
  // ... existing position controls code ...
}
