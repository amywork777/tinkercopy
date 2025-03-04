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
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useDevice } from "@/lib/hooks/use-device";

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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const { isMobile, isTablet } = useDevice();
  const isSmallScreen = isMobile || isTablet;

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

  const handleCSGOperation = async (operationType: 'union' | 'subtract' | 'intersect') => {
    if (selectedModelIndex === null || secondaryModelIndex === null) {
      toast({
        title: "Operation failed",
        description: "Please select two models for the operation",
        variant: "destructive",
      });
      return;
    }
    
    const operationNames = {
      union: "Merge",
      subtract: "Cut Out",
      intersect: "Intersect"
    };
    
    toast({
      title: `${operationNames[operationType]} operation in progress...`,
      description: "Please wait while we process your models",
      variant: "default",
    });
    
    try {
      await performCSGOperation(operationType);
      toast({
        title: "Operation complete",
        description: `${operationNames[operationType]} operation was successful`,
        duration: 2000,
      });
      
      // Close popover when done
      setCombineOptionsOpen(false);
    } catch (error) {
      toast({
        title: "Operation failed",
        description: error instanceof Error ? error.message : "Unknown error",
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
    <div className="flex items-center justify-center w-full">
      <div className="bg-background/80 backdrop-blur-sm shadow-sm rounded-lg border border-border p-1">
        <div className="flex items-center gap-1">
          {/* Essential controls always visible */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isSmallScreen ? "sm" : "default"}
                disabled={!canUndo}
                onClick={handleUndo}
                className={isSmallScreen ? "h-8 w-8 px-0" : ""}
              >
                <Undo className={isSmallScreen ? "h-4 w-4" : "h-5 w-5"} />
                <span className="sr-only">Undo</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Undo</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isSmallScreen ? "sm" : "default"}
                disabled={!canRedo}
                onClick={handleRedo}
                className={isSmallScreen ? "h-8 w-8 px-0" : ""}
              >
                <Redo className={isSmallScreen ? "h-4 w-4" : "h-5 w-5"} />
                <span className="sr-only">Redo</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Redo</p>
            </TooltipContent>
          </Tooltip>
          
          {/* Separator */}
          <Separator orientation="vertical" className="h-8" />
          
          {/* Delete button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isSmallScreen ? "sm" : "default"}
                disabled={selectedModelIndex === null}
                onClick={handleDeleteModel}
                className={isSmallScreen ? "h-8 w-8 px-0" : ""}
              >
                <Trash2 className={isSmallScreen ? "h-4 w-4" : "h-5 w-5"} />
                <span className="sr-only">Delete</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete Selected</p>
            </TooltipContent>
          </Tooltip>
          
          {/* Only show on larger screens */}
          {!isMobile && (
            <>
              {/* Duplicate button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size={isSmallScreen ? "sm" : "default"}
                    disabled={selectedModelIndex === null}
                    onClick={handleCopyModel}
                    className={isSmallScreen ? "h-8 w-8 px-0" : ""}
                  >
                    <Copy className={isSmallScreen ? "h-4 w-4" : "h-5 w-5"} />
                    <span className="sr-only">Duplicate</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Duplicate</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Another separator */}
              <Separator orientation="vertical" className="h-8" />
              
              {/* Boolean operations in a dropdown on small screens */}
              {isTablet ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
                      <Combine className="h-4 w-4" />
                      <span className="sr-only">Combine</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                        onClick={() => handleCSGOperation('union')}
                      >
                        Union
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                        onClick={() => handleCSGOperation('subtract')}
                      >
                        Subtract
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                        onClick={() => handleCSGOperation('intersect')}
                      >
                        Intersect
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                // Full size buttons on desktop
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                    onClick={() => handleCSGOperation('union')}
                  >
                    Union
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                    onClick={() => handleCSGOperation('subtract')}
                  >
                    Subtract
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={selectedModelIndex === null || secondaryModelIndex === null || isCSGOperationLoading}
                    onClick={() => handleCSGOperation('intersect')}
                  >
                    Intersect
                  </Button>
                </div>
              )}
            </>
          )}
          
          {/* View options button - always show */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewOptionsOpen ? "secondary" : "ghost"}
                size={isSmallScreen ? "sm" : "default"}
                onClick={() => setViewOptionsOpen(!viewOptionsOpen)}
                className={isSmallScreen ? "h-8 w-8 px-0" : ""}
              >
                <Maximize2 className={isSmallScreen ? "h-4 w-4" : "h-5 w-5"} />
                <span className="sr-only">View Options</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View Options</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      {/* View Options Dialog */}
      {viewOptionsOpen && (
        <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-20 w-[90%] sm:w-[400px]">
          <ViewOptions 
            onClose={() => setViewOptionsOpen(false)} 
            renderingMode={renderingMode} 
            setRenderingMode={setRenderingMode}
            cameraView={cameraView}
            setCameraView={setCameraView}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            showAxes={showAxes}
            setShowAxes={setShowAxes}
          />
        </div>
      )}
    </div>
  );
};

export default ToolBar; 