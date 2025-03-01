import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { 
  MoveIcon, 
  RotateCcwIcon, 
  ZoomInIcon, 
  Info, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  RefreshCw, 
  Maximize, 
  Minimize,
  BoxIcon
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

const TRANSFORM_MODES = [
  { name: "Move", icon: MoveIcon, mode: "translate", description: "Use the arrows to move the model" },
  { name: "Rotate", icon: RotateCcwIcon, mode: "rotate", description: "Use the buttons to rotate the model" },
  { name: "Scale", icon: ZoomInIcon, mode: "scale", description: "Use the buttons to resize the model" },
] as const;

export function TransformControls() {
  const { 
    transformMode, 
    setTransformMode, 
    selectedModelIndex, 
    models,
    applyTransform,
    resetTransform,
    setModelPosition,
    setModelRotation,
    setModelScale
  } = useScene();
  
  const isModelSelected = selectedModelIndex !== null && selectedModelIndex >= 0;
  const selectedModel = isModelSelected ? models[selectedModelIndex] : null;
  
  // State for direct input values
  const [positionValues, setPositionValues] = useState({ x: "0", y: "0", z: "0" });
  const [rotationValues, setRotationValues] = useState({ x: "0", y: "0", z: "0" });
  const [scaleValues, setScaleValues] = useState({ x: "1", y: "1", z: "1" });
  
  // Update input fields when selected model changes
  useEffect(() => {
    if (selectedModel) {
      const mesh = selectedModel.mesh;
      setPositionValues({
        x: mesh.position.x.toFixed(2),
        y: mesh.position.y.toFixed(2),
        z: mesh.position.z.toFixed(2)
      });
      
      // Convert radians to degrees for UI
      setRotationValues({
        x: (mesh.rotation.x * 180 / Math.PI).toFixed(1),
        y: (mesh.rotation.y * 180 / Math.PI).toFixed(1),
        z: (mesh.rotation.z * 180 / Math.PI).toFixed(1)
      });
      
      setScaleValues({
        x: mesh.scale.x.toFixed(2),
        y: mesh.scale.y.toFixed(2),
        z: mesh.scale.z.toFixed(2)
      });
    }
  }, [selectedModel, selectedModelIndex]);
  
  const handleTransform = (operation: string, direction: 1 | -1) => {
    applyTransform(operation as any, direction);
    
    // Update values after transform is applied
    setTimeout(() => {
      if (!selectedModel) return;
      
      const mesh = selectedModel.mesh;
      
      if (operation.startsWith('translate')) {
        setPositionValues({
          x: mesh.position.x.toFixed(2),
          y: mesh.position.y.toFixed(2),
          z: mesh.position.z.toFixed(2)
        });
      } else if (operation.startsWith('rotate')) {
        setRotationValues({
          x: (mesh.rotation.x * 180 / Math.PI).toFixed(1),
          y: (mesh.rotation.y * 180 / Math.PI).toFixed(1),
          z: (mesh.rotation.z * 180 / Math.PI).toFixed(1)
        });
      } else if (operation.startsWith('scale')) {
        setScaleValues({
          x: mesh.scale.x.toFixed(2),
          y: mesh.scale.y.toFixed(2),
          z: mesh.scale.z.toFixed(2)
        });
      }
    }, 10);
  };
  
  const handlePositionInput = (axis: 'x' | 'y' | 'z', value: string) => {
    setPositionValues(prev => ({ ...prev, [axis]: value }));
  };
  
  const handleRotationInput = (axis: 'x' | 'y' | 'z', value: string) => {
    setRotationValues(prev => ({ ...prev, [axis]: value }));
  };
  
  const handleScaleInput = (axis: 'x' | 'y' | 'z', value: string) => {
    setScaleValues(prev => ({ ...prev, [axis]: value }));
  };
  
  const applyPositionInput = () => {
    if (!selectedModel) return;
    
    try {
      const x = parseFloat(positionValues.x);
      const y = parseFloat(positionValues.y);
      const z = parseFloat(positionValues.z);
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        setModelPosition(x, y, z);
      }
    } catch (e) {
      console.error("Invalid position input:", e);
    }
  };
  
  const applyRotationInput = () => {
    if (!selectedModel) return;
    
    try {
      // Convert degrees to radians for Three.js
      const x = parseFloat(rotationValues.x) * Math.PI / 180;
      const y = parseFloat(rotationValues.y) * Math.PI / 180;
      const z = parseFloat(rotationValues.z) * Math.PI / 180;
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        setModelRotation(x, y, z);
      }
    } catch (e) {
      console.error("Invalid rotation input:", e);
    }
  };
  
  const applyScaleInput = () => {
    if (!selectedModel) return;
    
    try {
      const x = parseFloat(scaleValues.x);
      const y = parseFloat(scaleValues.y);
      const z = parseFloat(scaleValues.z);
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        setModelScale(x, y, z);
      }
    } catch (e) {
      console.error("Invalid scale input:", e);
    }
  };
  
  // Handle uniform scaling (all axes together)
  const handleUniformScale = (direction: 1 | -1) => {
    if (!selectedModel) return;
    
    // Apply scale to all axes
    applyTransform('scaleX', direction);
    applyTransform('scaleY', direction);
    applyTransform('scaleZ', direction);
    
    // Update UI values
    setTimeout(() => {
      if (!selectedModel) return;
      
      const mesh = selectedModel.mesh;
      setScaleValues({
        x: mesh.scale.x.toFixed(2),
        y: mesh.scale.y.toFixed(2),
        z: mesh.scale.z.toFixed(2)
      });
    }, 10);
  };
  
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2 w-full p-2 bg-card rounded-md border shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium">Transform Tools</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[300px]">
              <p>Select a model first, then use the transform tools to modify it.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        
        <div className="flex gap-1">
          {TRANSFORM_MODES.map(({ name, icon: Icon, mode, description }) => (
            <Button
              key={mode}
              size="sm"
              variant={transformMode === mode ? "default" : "outline"}
              className={`h-8 flex-1 ${transformMode === mode ? "bg-primary/90" : ""}`}
              onClick={() => setTransformMode(mode as any)}
              disabled={!isModelSelected}
              title={name}
            >
              <Icon className="h-4 w-4 mr-1" />
              <span className="text-xs hidden sm:inline">{name}</span>
            </Button>
          ))}
        </div>
        
        {isModelSelected && (
          <Tabs defaultValue="controls" className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="controls">Controls</TabsTrigger>
              <TabsTrigger value="direct">Direct Input</TabsTrigger>
            </TabsList>
            
            <TabsContent value="controls" className="mt-2">
              {transformMode === "translate" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-xs font-medium" style={{ width: '20px' }}>X:</div>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => handleTransform('translateX', -1)}
                      className="flex-1 bg-red-500/80 hover:bg-red-600"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      <span className="text-xs">Left</span>
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => handleTransform('translateX', 1)}
                      className="flex-1 bg-red-500/80 hover:bg-red-600"
                    >
                      <span className="text-xs mr-1">Right</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-xs font-medium" style={{ width: '20px' }}>Y:</div>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => handleTransform('translateY', 1)}
                      className="flex-1 bg-green-500/80 hover:bg-green-600"
                    >
                      <ArrowUp className="h-4 w-4 mr-1" />
                      <span className="text-xs">Up</span>
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => handleTransform('translateY', -1)}
                      className="flex-1 bg-green-500/80 hover:bg-green-600"
                    >
                      <span className="text-xs mr-1">Down</span>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-xs font-medium" style={{ width: '20px' }}>Z:</div>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => handleTransform('translateZ', 1)}
                      className="flex-1 bg-blue-500/80 hover:bg-blue-600"
                    >
                      <RefreshCw className="h-4 w-4 mr-1 rotate-[-45deg]" />
                      <span className="text-xs">Forward</span>
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => handleTransform('translateZ', -1)}
                      className="flex-1 bg-blue-500/80 hover:bg-blue-600"
                    >
                      <span className="text-xs mr-1">Back</span>
                      <RefreshCw className="h-4 w-4 rotate-[135deg]" />
                    </Button>
                  </div>
                </div>
              )}
              
              {transformMode === "rotate" && (
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleTransform('rotateX', 1)}
                    className="h-8 p-0"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    <span className="text-xs">X+</span>
                  </Button>
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleTransform('rotateY', 1)}
                    className="h-8 p-0"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    <span className="text-xs">Y+</span>
                  </Button>
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleTransform('rotateZ', 1)}
                    className="h-8 p-0"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    <span className="text-xs">Z+</span>
                  </Button>
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleTransform('rotateX', -1)}
                    className="h-8 p-0"
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    <span className="text-xs">X-</span>
                  </Button>
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleTransform('rotateY', -1)}
                    className="h-8 p-0"
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    <span className="text-xs">Y-</span>
                  </Button>
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleTransform('rotateZ', -1)}
                    className="h-8 p-0"
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    <span className="text-xs">Z-</span>
                  </Button>
                </div>
              )}
              
              {transformMode === "scale" && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleTransform('scaleX', 1)}
                      className="h-8 p-0"
                    >
                      <Maximize className="h-4 w-4 mr-1" />
                      <span className="text-xs">X+</span>
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleTransform('scaleY', 1)}
                      className="h-8 p-0"
                    >
                      <Maximize className="h-4 w-4 mr-1" />
                      <span className="text-xs">Y+</span>
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleTransform('scaleZ', 1)}
                      className="h-8 p-0"
                    >
                      <Maximize className="h-4 w-4 mr-1" />
                      <span className="text-xs">Z+</span>
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleTransform('scaleX', -1)}
                      className="h-8 p-0"
                    >
                      <Minimize className="h-4 w-4 mr-1" />
                      <span className="text-xs">X-</span>
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleTransform('scaleY', -1)}
                      className="h-8 p-0"
                    >
                      <Minimize className="h-4 w-4 mr-1" />
                      <span className="text-xs">Y-</span>
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleTransform('scaleZ', -1)}
                      className="h-8 p-0"
                    >
                      <Minimize className="h-4 w-4 mr-1" />
                      <span className="text-xs">Z-</span>
                    </Button>
                  </div>
                  
                  {/* Uniform scaling controls */}
                  <div className="flex gap-2 mt-2">
                    <Button 
                      size="sm" 
                      variant="default" 
                      onClick={() => handleUniformScale(1)}
                      className="flex-1 bg-purple-500/80 hover:bg-purple-600"
                    >
                      <BoxIcon className="h-4 w-4 mr-1" />
                      <span className="text-xs">Scale All +</span>
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="default" 
                      onClick={() => handleUniformScale(-1)}
                      className="flex-1 bg-purple-500/80 hover:bg-purple-600"
                    >
                      <BoxIcon className="h-4 w-4 mr-1" />
                      <span className="text-xs">Scale All -</span>
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="direct" className="mt-2">
              {transformMode === "translate" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pos-x" className="w-10 text-xs">X:</Label>
                    <Input
                      id="pos-x"
                      type="number"
                      step="0.1"
                      value={positionValues.x}
                      onChange={(e) => handlePositionInput('x', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pos-y" className="w-10 text-xs">Y:</Label>
                    <Input
                      id="pos-y"
                      type="number"
                      step="0.1"
                      value={positionValues.y}
                      onChange={(e) => handlePositionInput('y', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pos-z" className="w-10 text-xs">Z:</Label>
                    <Input
                      id="pos-z"
                      type="number"
                      step="0.1"
                      value={positionValues.z}
                      onChange={(e) => handlePositionInput('z', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <Button 
                    size="sm"
                    onClick={applyPositionInput}
                    className="mt-1"
                  >
                    Apply Position
                  </Button>
                </div>
              )}
              
              {transformMode === "rotate" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rot-x" className="w-10 text-xs">X (°):</Label>
                    <Input
                      id="rot-x"
                      type="number"
                      step="5"
                      value={rotationValues.x}
                      onChange={(e) => handleRotationInput('x', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rot-y" className="w-10 text-xs">Y (°):</Label>
                    <Input
                      id="rot-y"
                      type="number"
                      step="5"
                      value={rotationValues.y}
                      onChange={(e) => handleRotationInput('y', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rot-z" className="w-10 text-xs">Z (°):</Label>
                    <Input
                      id="rot-z"
                      type="number"
                      step="5"
                      value={rotationValues.z}
                      onChange={(e) => handleRotationInput('z', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <Button 
                    size="sm"
                    onClick={applyRotationInput}
                    className="mt-1"
                  >
                    Apply Rotation
                  </Button>
                </div>
              )}
              
              {transformMode === "scale" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="scale-x" className="w-10 text-xs">X:</Label>
                    <Input
                      id="scale-x"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={scaleValues.x}
                      onChange={(e) => handleScaleInput('x', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="scale-y" className="w-10 text-xs">Y:</Label>
                    <Input
                      id="scale-y"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={scaleValues.y}
                      onChange={(e) => handleScaleInput('y', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="scale-z" className="w-10 text-xs">Z:</Label>
                    <Input
                      id="scale-z"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={scaleValues.z}
                      onChange={(e) => handleScaleInput('z', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm"
                      onClick={applyScaleInput}
                      className="mt-1 flex-1"
                    >
                      Apply Scale
                    </Button>
                    
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const value = scaleValues.x;
                        setScaleValues({ x: value, y: value, z: value });
                        setTimeout(applyScaleInput, 10);
                      }}
                      className="mt-1 flex-1"
                      title="Make all dimensions equal to X value"
                    >
                      <BoxIcon className="h-4 w-4 mr-1" />
                      <span className="text-xs">Uniform</span>
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
        
        {isModelSelected && (
          <Button
            size="sm"
            variant="outline"
            onClick={resetTransform}
            className="mt-1"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Transform
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
