import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Undo, Redo, Combine, Plus, Minus, XCircle, Copy, Trash2, Move, RotateCw, Maximize2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useScene } from "@/hooks/use-scene";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ViewOptions } from "./ViewOptions";
import * as THREE from "three";
import { ShareDialog } from "./ShareDialog";

export const ToolBar = () => {
  const { 
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    renderingMode, 
    setRenderingMode,
    cameraView, 
    setCameraView, 
    showGrid, 
    setShowGrid, 
    showAxes, 
    setShowAxes,
    scene,
    models,
    selectedModelIndex,
    secondaryModelIndex,
    selectModel,
    selectSecondaryModel,
    performCSGOperation,
    isCSGOperationLoading,
    saveHistoryState,
    removeModel
  } = useScene();
  const { toast } = useToast();
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [combineOptionsOpen, setCombineOptionsOpen] = useState(false);

  const handleUndo = () => {
    if (canUndo) {
      undo();
      toast({
        title: "Action undone",
        duration: 2000,
      });
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      redo();
      toast({
        title: "Action redone",
        duration: 2000,
      });
    }
  };

  const handleRenderingModeChange = (value: string) => {
    setRenderingMode(value as 'standard' | 'wireframe' | 'realistic' | 'xray');
    toast({
      title: `Rendering mode: ${value}`,
      duration: 2000,
    });
  };

  // Handle model selection
  const handlePrimaryModelSelect = (modelIndex: string) => {
    const index = parseInt(modelIndex, 10);
    selectModel(index);
    toast({
      title: "Primary model selected",
      duration: 2000,
    });
  };

  const handleSecondaryModelSelect = (modelIndex: string) => {
    const index = parseInt(modelIndex, 10);
    selectSecondaryModel(index);
    toast({
      title: "Secondary model selected",
      duration: 2000,
    });
  };

  // Handle CSG operations from the toolbar
  const handleCSGOperation = async (operationType: 'union' | 'subtract' | 'intersect') => {
    if (models.length < 2) {
      toast({
        title: "Not enough models",
        description: "You need at least two models to combine",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedModelIndex === null) {
      toast({
        title: "No primary model",
        description: "Please select a primary model first",
        variant: "destructive",
      });
      return;
    }
    
    if (secondaryModelIndex === null) {
      toast({
        title: "No secondary model",
        description: "Please select a secondary model first",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await performCSGOperation(operationType);
      
      const operationLabels = {
        'union': 'Merged',
        'subtract': 'Subtracted',
        'intersect': 'Intersected'
      };
      
      toast({
        title: `${operationLabels[operationType]} models`,
        description: "Operation completed successfully",
      });
      
      // Close the popover after operation
      setCombineOptionsOpen(false);
    } catch (error) {
      toast({
        title: "Operation failed",
        description: "There was an error combining the models",
        variant: "destructive",
      });
    }
  };

  const handleCopyModel = () => {
    if (selectedModelIndex === null || !models[selectedModelIndex]) {
      toast({
        title: "No model selected",
        description: "Please select a model to copy",
        variant: "destructive",
      });
      return;
    }

    const modelToCopy = models[selectedModelIndex];
    
    // Clone the geometry and material
    const geometry = modelToCopy.mesh.geometry.clone();
    const material = modelToCopy.mesh.material instanceof Array
      ? modelToCopy.mesh.material.map(m => m.clone())
      : modelToCopy.mesh.material.clone();

    // Create new mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Position slightly offset from original
    mesh.position.copy(modelToCopy.mesh.position);
    mesh.position.x += 50; // Offset by 50mm
    mesh.rotation.copy(modelToCopy.mesh.rotation);
    mesh.scale.copy(modelToCopy.mesh.scale);

    // Store original transform
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();

    // Create new model object
    const newModel = {
      id: `${modelToCopy.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${modelToCopy.name} (Copy)`,
      type: modelToCopy.type,
      mesh,
      originalPosition,
      originalRotation,
      originalScale,
      ...(modelToCopy.textProps ? { textProps: { ...modelToCopy.textProps } } : {})
    };

    // Add to scene and state
    scene.add(mesh);
    const updatedModels = [...models, newModel];
    useScene.setState({ models: updatedModels });
    selectModel(updatedModels.length - 1);
    saveHistoryState();

    toast({
      title: "Model Copied",
      description: `Created copy of ${modelToCopy.name}`,
      duration: 2000,
    });
  };

  const handleDeleteModel = () => {
    if (selectedModelIndex === null) {
      toast({
        title: "No model selected",
        description: "Please select a model to delete",
        variant: "destructive",
      });
      return;
    }

    const modelName = models[selectedModelIndex].name;
    removeModel(selectedModelIndex);
    
    toast({
      title: "Model Deleted",
      description: `Removed ${modelName}`,
      duration: 2000,
    });
  };

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-background/90 backdrop-blur-sm rounded-lg shadow-lg p-2 flex items-center space-x-2 border border-border">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              <Undo className={canUndo ? "text-white" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Undo (Ctrl+Z)</p>
          </TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleRedo}
              disabled={!canRedo}
            >
              <Redo className={canRedo ? "text-white" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo (Ctrl+Y)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleCopyModel}
              disabled={selectedModelIndex === null}
            >
              <Copy className={selectedModelIndex !== null ? "text-white" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy Model (Ctrl+C)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleDeleteModel}
              disabled={selectedModelIndex === null}
            >
              <Trash2 className={selectedModelIndex !== null ? "text-white" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Delete Model (Delete)</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8 mx-1" />

        {/* View Options Popover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover open={viewOptionsOpen} onOpenChange={setViewOptionsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="px-3">
                  <span className="text-white text-sm">Views</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="center">
                <div className="p-3">
                  <h3 className="text-sm font-semibold mb-3">View Options</h3>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant={cameraView === 'top' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('top')}
                      >
                        Top
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraView === 'front' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('front')}
                      >
                        Front
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraView === 'side' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('side')}
                      >
                        Side
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraView === 'isometric' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('isometric')}
                      >
                        Isometric
                      </Button>
                    </div>
                    
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="toolbar-show-grid" 
                          checked={showGrid}
                          onCheckedChange={(checked) => setShowGrid(!!checked)}
                        />
                        <Label htmlFor="toolbar-show-grid" className="text-sm">Show Grid</Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="toolbar-show-axes" 
                          checked={showAxes}
                          onCheckedChange={(checked) => setShowAxes(!!checked)}
                        />
                        <Label htmlFor="toolbar-show-axes" className="text-sm">Show Axes</Label>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </TooltipTrigger>
          <TooltipContent>
            <p>View Options</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8 mx-1" />

        {/* Models Selection Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="px-3">
                  <span className="text-white text-sm">Models ({models.length})</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="center">
                <div className="p-3">
                  <h3 className="text-sm font-semibold mb-3">Current Models</h3>
                  {models.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No models in scene</p>
                  ) : (
                    <div className="space-y-2">
                      {models.map((model, index) => (
                        <div 
                          key={model.id} 
                          className={`flex items-center justify-between p-2 rounded-md ${
                            index === selectedModelIndex ? 'bg-accent' : 'hover:bg-accent/50'
                          }`}
                        >
                          <span 
                            className="text-sm truncate flex-1 cursor-pointer"
                            onClick={() => selectModel(index)}
                          >
                            {model.name || `Model ${index + 1}`}
                          </span>
                          <div className="flex items-center gap-1">
                            {index === selectedModelIndex && (
                              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded mr-2">
                                Selected
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectModel(index);
                                handleCopyModel();
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectModel(index);
                                handleDeleteModel();
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </TooltipTrigger>
          <TooltipContent>
            <p>Current Models</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8 mx-1" />

        {/* New Combine Models Popover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover open={combineOptionsOpen} onOpenChange={setCombineOptionsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="px-3">
                  <span className="text-white text-sm">Combine</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="center">
                <div className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Combine Models</h3>
                  
                  {models.length < 2 ? (
                    <div className="bg-muted/50 rounded-md p-2 mb-4">
                      <p className="text-sm text-muted-foreground">
                        You need at least two models to combine
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 mb-4">
                      {/* Primary Model Selection */}
                      <div>
                        <Label htmlFor="primary-model" className="text-sm font-medium mb-1.5 block">
                          Primary Model
                        </Label>
                        <Select 
                          value={selectedModelIndex !== null ? selectedModelIndex.toString() : undefined}
                          onValueChange={handlePrimaryModelSelect}
                          disabled={models.length === 0}
                        >
                          <SelectTrigger id="primary-model" className="w-full">
                            <SelectValue placeholder="Select primary model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((model, index) => (
                              <SelectItem key={`primary-${index}`} value={index.toString()}>
                                {model.name || `Model ${index + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Secondary Model Selection */}
                      <div>
                        <Label htmlFor="secondary-model" className="text-sm font-medium mb-1.5 block">
                          Secondary Model
                        </Label>
                        <Select 
                          value={secondaryModelIndex !== null ? secondaryModelIndex.toString() : undefined}
                          onValueChange={handleSecondaryModelSelect}
                          disabled={models.length === 0}
                        >
                          <SelectTrigger id="secondary-model" className="w-full">
                            <SelectValue placeholder="Select secondary model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((model, index) => (
                              <SelectItem key={`secondary-${index}`} value={index.toString()}>
                                {model.name || `Model ${index + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <Button
                      size="default"
                      variant="outline"
                      className="justify-start h-auto py-2 w-full"
                      onClick={() => handleCSGOperation('union')}
                      disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                    >
                      <Plus className="h-5 w-5 mr-3 flex-shrink-0" />
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">Merge</span>
                        <span className="text-xs text-muted-foreground mt-0.5">Combine both models</span>
                      </div>
                    </Button>
                    
                    <Button
                      size="default"
                      variant="outline"
                      className="justify-start h-auto py-2 w-full"
                      onClick={() => handleCSGOperation('subtract')}
                      disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                    >
                      <Minus className="h-5 w-5 mr-3 flex-shrink-0" />
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">Cut Out</span>
                        <span className="text-xs text-muted-foreground mt-0.5">Remove secondary from primary</span>
                      </div>
                    </Button>
                    
                    <Button
                      size="default"
                      variant="outline"
                      className="justify-start h-auto py-2 w-full"
                      onClick={() => handleCSGOperation('intersect')}
                      disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                    >
                      <XCircle className="h-5 w-5 mr-3 flex-shrink-0" />
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">Intersect</span>
                        <span className="text-xs text-muted-foreground mt-0.5">Keep overlapping parts</span>
                      </div>
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </TooltipTrigger>
          <TooltipContent>
            <p>Combine Models</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8" />

        <ShareDialog />

        <div className="flex items-center gap-2">
          <Select 
            value={renderingMode} 
            onValueChange={handleRenderingModeChange}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent className="min-w-[120px]">
              <SelectItem key="standard" value="standard">Standard</SelectItem>
              <SelectItem key="wireframe" value="wireframe">Wireframe</SelectItem>
              <SelectItem key="realistic" value="realistic">Realistic</SelectItem>
              <SelectItem key="xray" value="xray">X-Ray</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TooltipProvider>
    </div>
  );
};

export default ToolBar; 