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
      newPosition.y = value;
      setYPosition(value);
    } else {
      newPosition.z = value;
      setZPosition(value);
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
      newRotation.y = value;
      setYRotation(value);
    } else {
      newRotation.z = value;
      setZRotation(value);
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
      newScale.y = value;
      setYScale(value);
    } else {
      newScale.z = value;
      setZScale(value);
    }
    
    setScaleValues(newScale);
    setModelScale(newScale.x, newScale.y, newScale.z);

    // Update dimensions after scale change
    if (selectedModelIndex !== null && models[selectedModelIndex]) {
      const model = models[selectedModelIndex];
      if (model.mesh.geometry && model.mesh.geometry.boundingBox) {
        const size = new Vector3();
        model.mesh.geometry.boundingBox.getSize(size);
        
        const width = parseFloat((size.x * newScale.x).toFixed(2));
        const height = parseFloat((size.y * newScale.y).toFixed(2));
        const depth = parseFloat((size.z * newScale.z).toFixed(2));
        
        setDimensions({ width, height, depth });
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
      if (model.mesh.geometry && model.mesh.geometry.boundingBox) {
        const size = new Vector3();
        model.mesh.geometry.boundingBox.getSize(size);
        
        const width = parseFloat((size.x * value).toFixed(2));
        const height = parseFloat((size.y * value).toFixed(2));
        const depth = parseFloat((size.z * value).toFixed(2));
        
        setDimensions({ width, height, depth });
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
  
  // Add a function to format dimension values based on current unit
  const formatDimension = (value: number) => {
    const currentUnit = unit;
    // Show fewer decimal places for inches
    return currentUnit === 'mm' 
      ? value.toFixed(2) 
      : convertValue(value, 'mm', 'in').toFixed(3);
  };
  
  // Add a function to toggle between units
  const toggleUnit = () => {
    setUnit(unit === 'mm' ? 'in' : 'mm');
  };
  
  // Add a function to format position values based on current unit
  const formatPosition = (value: number) => {
    return unit === 'mm' 
      ? value.toFixed(2) 
      : convertValue(value, 'mm', 'in').toFixed(3);
  };
  
  return (
    <div className={cn("p-4", className)}>
      <h3 className="text-lg font-semibold mb-4">Transform Controls</h3>
      
      <div className="space-y-4">
        {/* Add unit toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm">Units</span>
          <Button 
            variant="outline"
            size="sm"
            onClick={toggleUnit}
            className="text-xs"
          >
            {unit.toUpperCase()}
          </Button>
        </div>
        
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

        {/* Dimensions Display */}
        {dimensions && (
          <Card className="p-3 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Box className="h-4 w-4" />
              <h3 className="text-sm font-medium">Model Dimensions</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Width</p>
                <p className="text-sm font-medium text-red-500">
                  {formatDimension(dimensions.width)} {getDimensionUnit()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Height</p>
                <p className="text-sm font-medium text-green-500">
                  {formatDimension(dimensions.height)} {getDimensionUnit()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Depth</p>
                <p className="text-sm font-medium text-blue-500">
                  {formatDimension(dimensions.depth)} {getDimensionUnit()}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Separator />

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
                    <span className="text-xs text-muted-foreground">
                      {formatPosition(xPosition)} {getDimensionUnit()}
                    </span>
                  </div>
                  <Slider 
                    id="x-position"
                    min={-10} 
                    max={10} 
                    step={0.1} 
                    value={[xPosition]} 
                    onValueChange={(values) => handlePositionSliderChange('x', values[0])}
                    className="slider-red"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="y-position" className="text-green-500">Y Position</Label>
                    <span className="text-xs text-muted-foreground">
                      {formatPosition(yPosition)} {getDimensionUnit()}
                    </span>
                  </div>
                  <Slider 
                    id="y-position"
                    min={-10} 
                    max={10} 
                    step={0.1} 
                    value={[yPosition]} 
                    onValueChange={(values) => handlePositionSliderChange('y', values[0])}
                    className="slider-green"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="z-position" className="text-blue-500">Z Position</Label>
                    <span className="text-xs text-muted-foreground">
                      {formatPosition(zPosition)} {getDimensionUnit()}
                    </span>
                  </div>
                  <Slider 
                    id="z-position"
                    min={-10} 
                    max={10} 
                    step={0.1} 
                    value={[zPosition]} 
                    onValueChange={(values) => handlePositionSliderChange('z', values[0])}
                    className="slider-blue"
                  />
                </div>
              </div>
            )}
            
            {transformMode === "rotate" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="x-rotation" className="text-red-500">X Rotation</Label>
                    <span className="text-xs text-muted-foreground">{(xRotation * 180 / Math.PI).toFixed(0)}{ROTATION_UNIT}</span>
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
                    <Label htmlFor="y-rotation" className="text-green-500">Y Rotation</Label>
                    <span className="text-xs text-muted-foreground">{(yRotation * 180 / Math.PI).toFixed(0)}{ROTATION_UNIT}</span>
                  </div>
                  <Slider 
                    id="y-rotation"
                    min={-Math.PI} 
                    max={Math.PI} 
                    step={Math.PI / 180} 
                    value={[yRotation]} 
                    onValueChange={(values) => handleRotationSliderChange('y', values[0])}
                    className="slider-green"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="z-rotation" className="text-blue-500">Z Rotation</Label>
                    <span className="text-xs text-muted-foreground">{(zRotation * 180 / Math.PI).toFixed(0)}{ROTATION_UNIT}</span>
                  </div>
                  <Slider 
                    id="z-rotation"
                    min={-Math.PI} 
                    max={Math.PI} 
                    step={Math.PI / 180} 
                    value={[zRotation]} 
                    onValueChange={(values) => handleRotationSliderChange('z', values[0])}
                    className="slider-blue"
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
                  // Uniform scaling slider
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="uniform-scale" className="text-purple-500">Uniform Scale</Label>
                      <span className="text-xs text-muted-foreground">{uniformScale.toFixed(2)}{SCALE_UNIT}</span>
                    </div>
                    <Slider 
                      id="uniform-scale"
                      min={0.1} 
                      max={5} 
                      step={0.1} 
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
                        <span className="text-xs text-muted-foreground">{xScale.toFixed(2)}{SCALE_UNIT}</span>
                      </div>
                      <Slider 
                        id="x-scale"
                        min={0.1} 
                        max={5} 
                        step={0.1} 
                        value={[xScale]} 
                        onValueChange={(values) => handleScaleSliderChange('x', values[0])}
                        className="slider-red"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="y-scale" className="text-green-500">Y Scale</Label>
                        <span className="text-xs text-muted-foreground">{yScale.toFixed(2)}{SCALE_UNIT}</span>
                      </div>
                      <Slider 
                        id="y-scale"
                        min={0.1} 
                        max={5} 
                        step={0.1} 
                        value={[yScale]} 
                        onValueChange={(values) => handleScaleSliderChange('y', values[0])}
                        className="slider-green"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="z-scale" className="text-blue-500">Z Scale</Label>
                        <span className="text-xs text-muted-foreground">{zScale.toFixed(2)}{SCALE_UNIT}</span>
                      </div>
                      <Slider 
                        id="z-scale"
                        min={0.1} 
                        max={5} 
                        step={0.1} 
                        value={[zScale]} 
                        onValueChange={(values) => handleScaleSliderChange('z', values[0])}
                        className="slider-blue"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
        
        <Button
          variant="outline"
          className="w-full mt-2"
          onClick={resetTransform}
          disabled={selectedModelIndex === null}
        >
          Reset Transform
        </Button>
      </div>
    </div>
  );
}
