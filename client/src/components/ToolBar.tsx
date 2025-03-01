import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Undo, Redo, Palette, FileText, Box, Circle, Cylinder, Triangle, CircleDot } from "lucide-react";
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
import { TextDialog } from "@/components/TextDialog";
import * as THREE from "three";

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
    scene
  } = useScene();
  const { toast } = useToast();
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false);

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

  // Helper function to add a shape to the scene
  const addShape = (shape: 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus') => {
    let geometry: THREE.BufferGeometry;
    let shapeName: string;
    
    // Create geometry based on shape type
    switch (shape) {
      case 'cube':
        geometry = new THREE.BoxGeometry(5, 5, 5);
        shapeName = 'Cube';
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(3, 32, 32);
        shapeName = 'Sphere';
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(2.5, 2.5, 5, 32);
        shapeName = 'Cylinder';
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(3, 5, 32);
        shapeName = 'Cone';
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(3, 1, 16, 50);
        shapeName = 'Torus';
        break;
    }

    // Create material with random color
    const material = new THREE.MeshStandardMaterial({ 
      color: Math.random() * 0xffffff,
      metalness: 0.1,
      roughness: 0.8
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Position mesh slightly above the grid
    mesh.position.y = 2.5;
    
    // Store original transform
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    
    // Add to scene
    scene.add(mesh);
    
    // Create model object
    const newModel = {
      id: `${shape}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${shapeName} ${Date.now()}`,
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    // Add to models array
    const { models, saveHistoryState, selectModel } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    // Select the new model
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    // Save to history
    saveHistoryState();
    
    toast({
      title: `${shapeName} added`,
      description: `A new ${shapeName.toLowerCase()} has been added to the scene`,
      duration: 2000,
    });

    // Close the shapes menu after adding a shape
    setShapesMenuOpen(false);
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
              <Undo className={canUndo ? "text-primary" : "text-muted-foreground"} size={18} />
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
              <Redo className={canRedo ? "text-primary" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo (Ctrl+Y)</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8 mx-1" />

        {/* View Options Popover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover open={viewOptionsOpen} onOpenChange={setViewOptionsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon">
                  <span className="text-white text-xs font-medium">Views</span>
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
      </TooltipProvider>

      <Separator orientation="vertical" className="h-8" />

      {/* Add Shapes Popover */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover open={shapesMenuOpen} onOpenChange={setShapesMenuOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2">
                  <Box className="h-4 w-4 mr-1" />
                  <span className="text-white text-xs font-medium">Add Shapes</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="center">
                <div className="p-3">
                  <h3 className="text-sm font-semibold mb-3">Add Shape</h3>
                  <div className="grid gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="justify-start" 
                      onClick={() => addShape('cube')}
                    >
                      <Box className="mr-2 h-4 w-4" />
                      Cube
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => addShape('sphere')}
                    >
                      <Circle className="mr-2 h-4 w-4" />
                      Sphere
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => addShape('cylinder')}
                    >
                      <Cylinder className="mr-2 h-4 w-4" />
                      Cylinder
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => addShape('cone')}
                    >
                      <Triangle className="mr-2 h-4 w-4" />
                      Cone
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => addShape('torus')}
                    >
                      <CircleDot className="mr-2 h-4 w-4" />
                      Torus
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add 3D Shapes</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Separator orientation="vertical" className="h-8" />

      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <Select 
          value={renderingMode} 
          onValueChange={handleRenderingModeChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="wireframe">Wireframe</SelectItem>
            <SelectItem value="realistic">Realistic</SelectItem>
            <SelectItem value="xray">X-Ray</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator orientation="vertical" className="h-8" />

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => setTextDialogOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              <span className="text-white text-xs font-medium">Add Text</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Create 3D text</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TextDialog open={textDialogOpen} onOpenChange={setTextDialogOpen} />
    </div>
  );
};

export default ToolBar; 