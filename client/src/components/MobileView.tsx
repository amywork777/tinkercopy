import React, { useState, useEffect, useRef } from "react";
import { useScene } from "@/hooks/use-scene";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Box,
  FileDown,
  FileUp,
  ExternalLink,
  Info,
  X,
  RotateCcw,
  Home,
  Trash,
  Plus
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "sonner";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import * as THREE from "three";

// Custom icons for the ones missing from Lucide
const UnionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="5" />
    <circle cx="16" cy="16" r="5" />
  </svg>
);

const DifferenceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="9" r="5" />
    <path d="M15 5.5v.5a5 5 0 0 1-5 5h-.5" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
  </svg>
);

const IntersectionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="5" />
    <circle cx="16" cy="16" r="5" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);

const MobileView: React.FC = () => {
  const { 
    scene, 
    camera, 
    renderer, 
    models, 
    loadSTL,
    exportSelectedModelAsSTL,
    selectModel,
    selectedModelIndex,
    secondaryModelIndex,
    selectSecondaryModel,
    removeModel,
    performCSGOperation
  } = useScene();

  const [showBanner, setShowBanner] = useState(true);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isCsgLoading, setIsCsgLoading] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Make sure the renderer fills the mobile screen
    if (renderer && camera) {
      const resize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      
      resize();
      window.addEventListener('resize', resize);
      
      // Add the renderer element to the container
      const container = document.getElementById('mobile-viewport');
      if (container) {
        // Clear container first
        while (container.firstChild) {
          container.firstChild.remove();
        }
        
        // Add the renderer's canvas
        container.appendChild(renderer.domElement);
        
        // Position camera for mobile view
        camera.position.set(0, 10, 20);
        camera.lookAt(0, 0, 0);
        
        // Add double tap to model selection
        if (renderer.domElement) {
          renderer.domElement.addEventListener('click', handleTap);
        }
        
        // Render scene
        renderer.render(scene, camera);
      }
      
      return () => {
        window.removeEventListener('resize', resize);
        if (renderer.domElement) {
          renderer.domElement.removeEventListener('click', handleTap);
        }
      };
    }
  }, [renderer, camera, scene]);

  const handleTap = (event: MouseEvent) => {
    const now = Date.now();
    const timeDiff = now - lastTapTime;
    
    // If tapped within 300ms of last tap, consider it a double tap
    if (timeDiff < 300) {
      resetCamera();
    }
    
    setLastTapTime(now);
  };

  const resetCamera = () => {
    if (camera) {
      camera.position.set(0, 10, 20);
      camera.lookAt(0, 0, 0);
      if (renderer) renderer.render(scene, camera);
    }
  };

  const addShape = (shape: 'cube' | 'sphere' | 'cylinder') => {
    // Use THREE.js directly to create shapes
    let geometry;
    let mesh;
    
    switch(shape) {
      case 'cube':
        geometry = new THREE.BoxGeometry(5, 5, 5);
        mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ 
            color: Math.random() * 0xffffff,
            roughness: 0.7,
            metalness: 0.2
          })
        );
        mesh.position.set(0, 2.5, 0);
        break;
        
      case 'sphere':
        geometry = new THREE.SphereGeometry(3, 32, 32);
        mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ 
            color: Math.random() * 0xffffff,
            roughness: 0.7,
            metalness: 0.2
          })
        );
        mesh.position.set(0, 3, 0);
        break;
        
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(2, 2, 5, 32);
        mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ 
            color: Math.random() * 0xffffff,
            roughness: 0.7,
            metalness: 0.2
          })
        );
        mesh.position.set(0, 2.5, 0);
        break;
        
      default:
        toast.error("Unknown shape type");
        return;
    }
    
    // Add to scene directly
    if (mesh) {
      // Create a unique ID
      const id = `${shape}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Get the state functions directly
      const state = useScene.getState();
      
      // Create the model object using the same structure as in the useScene
      const model = {
        id,
        name: `${shape.charAt(0).toUpperCase() + shape.slice(1)}`,
        type: shape as any,
        mesh,
        originalPosition: mesh.position.clone(),
        originalRotation: mesh.rotation.clone(),
        originalScale: mesh.scale.clone()
      };
      
      // Add to scene
      scene.add(mesh);
      
      // Update models in the state
      state.models.push(model);
      
      // Select the new model
      selectModel(state.models.length - 1);
      
      // Save to history
      if (state.saveHistoryState) {
        state.saveHistoryState();
      }
      
      toast.success(`Added ${shape}`);
    }
    
    // Close the shape menu
    setShowShapeMenu(false);
  };

  const handleImportModel = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      await loadSTL(file);
      toast.success(`Loaded ${file.name}`);
      // Select the newly added model
      selectModel(models.length - 1);
    } catch (error) {
      toast.error("Failed to load model");
    }
  };

  const handleExport = () => {
    if (selectedModelIndex === null) {
      toast.error("Select a model to export");
      return;
    }
    
    try {
      const stlBlob = exportSelectedModelAsSTL();
      if (!stlBlob) {
        toast.error("Failed to export model");
        return;
      }
      
      // Create download link
      const url = URL.createObjectURL(stlBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model-${Date.now()}.stl`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      toast.success("Model exported successfully");
    } catch (error) {
      toast.error("Export failed");
    }
  };
  
  const handleCSGOperation = async (operation: 'union' | 'subtract' | 'intersect') => {
    if (selectedModelIndex === null || secondaryModelIndex === null) {
      toast.error("Select two models for boolean operation");
      return;
    }
    
    setIsCsgLoading(true);
    try {
      await performCSGOperation(operation);
      toast.success(`${operation.charAt(0).toUpperCase() + operation.slice(1)} operation completed`);
    } catch (error) {
      toast.error(`Failed to perform ${operation} operation`);
    } finally {
      setIsCsgLoading(false);
    }
  };
  
  const handleDeleteModel = () => {
    if (selectedModelIndex === null) {
      toast.error("Select a model to delete");
      return;
    }
    
    removeModel(selectedModelIndex);
    toast.success("Model deleted");
  };
  
  const closeBanner = () => {
    setShowBanner(false);
  };
  
  const returnToTaiyaki = () => {
    window.location.href = "https://taiyaki.ai";
  };
  
  const handleSwitchToDesktop = () => {
    sessionStorage.setItem("temp-use-desktop", "true");
    window.location.reload();
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col relative">
      {/* Hidden file input for STL import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".stl" 
        onChange={handleFileChange} 
      />
      
      {/* The 3D viewport takes the full screen */}
      <div id="mobile-viewport" className="flex-1 w-full">
        {/* Renderer attaches here automatically */}
      </div>

      {/* Top banner - optional info */}
      {showBanner && (
        <div className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground px-2 py-1 flex justify-between items-center z-30 text-xs">
          <div className="flex items-center">
            <Info className="h-3 w-3 mr-1" />
            <span>Mobile Modeler</span>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={returnToTaiyaki} 
              className="h-5 px-1.5 text-xs text-primary-foreground"
            >
              taiyaki.ai
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={closeBanner} 
              className="h-5 w-5 p-0 text-primary-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Main toolbar at the bottom - Improved to match the image */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <Card className="bg-background/95 backdrop-blur-sm p-3 rounded-t-lg shadow-lg border-t border-x">
          <div className="grid grid-cols-5 gap-2">
            {/* Shapes Button */}
            <Popover open={showShapeMenu} onOpenChange={setShowShapeMenu}>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex flex-col h-auto items-center justify-center py-2 space-y-1"
                >
                  <Box className="h-6 w-6" />
                  <span className="text-xs font-normal">Shapes</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-48 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => addShape('cube')} className="flex flex-col items-center p-1 h-auto">
                    <Box className="h-5 w-5 mb-1" />
                    <span className="text-[10px]">Cube</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => addShape('sphere')} className="flex flex-col items-center p-1 h-auto">
                    <div className="h-5 w-5 rounded-full border border-current mb-1"></div>
                    <span className="text-[10px]">Sphere</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => addShape('cylinder')} className="flex flex-col items-center p-1 h-auto">
                    <div className="h-5 w-3 mx-auto border border-current rounded-full mb-1"></div>
                    <span className="text-[10px]">Cylinder</span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* Boolean Operations Button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex flex-col h-auto items-center justify-center py-2 space-y-1"
                >
                  <UnionIcon />
                  <span className="text-xs font-normal">Boolean</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-56 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleCSGOperation('union')} 
                    className="flex flex-col items-center p-1 h-auto"
                    disabled={isCsgLoading || selectedModelIndex === null || secondaryModelIndex === null}
                  >
                    <UnionIcon />
                    <span className="text-[10px]">Union</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleCSGOperation('subtract')} 
                    className="flex flex-col items-center p-1 h-auto"
                    disabled={isCsgLoading || selectedModelIndex === null || secondaryModelIndex === null}
                  >
                    <DifferenceIcon />
                    <span className="text-[10px]">Subtract</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleCSGOperation('intersect')} 
                    className="flex flex-col items-center p-1 h-auto"
                    disabled={isCsgLoading || selectedModelIndex === null || secondaryModelIndex === null}
                  >
                    <IntersectionIcon />
                    <span className="text-[10px]">Intersect</span>
                  </Button>
                </div>
                <div className="mt-2 p-2 bg-muted rounded text-xs">
                  <p>{(selectedModelIndex === null || secondaryModelIndex === null) 
                    ? "⚠️ Select two models first" 
                    : "Ready for boolean operation"}</p>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* Import Button */}
            <Button 
              variant="ghost" 
              className="flex flex-col h-auto items-center justify-center py-2 space-y-1"
              onClick={handleImportModel}
            >
              <FileUp className="h-6 w-6" />
              <span className="text-xs font-normal">Import</span>
            </Button>
            
            {/* Export Button */}
            <Button 
              variant="ghost" 
              className="flex flex-col h-auto items-center justify-center py-2 space-y-1"
              onClick={handleExport}
              disabled={selectedModelIndex === null}
            >
              <FileDown className="h-6 w-6" />
              <span className="text-xs font-normal">Export</span>
            </Button>
            
            {/* More Options Button */}
            <Popover open={showActionMenu} onOpenChange={setShowActionMenu}>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex flex-col h-auto items-center justify-center py-2 space-y-1"
                >
                  <span className="font-bold text-lg">···</span>
                  <span className="text-xs font-normal">More</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-56 p-2">
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={resetCamera} 
                    className="flex flex-col items-center p-1 h-auto"
                  >
                    <Home className="h-5 w-5 mb-1" />
                    <span className="text-[10px]">Reset View</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleDeleteModel} 
                    className="flex flex-col items-center p-1 h-auto"
                    disabled={selectedModelIndex === null}
                  >
                    <Trash className="h-5 w-5 mb-1" />
                    <span className="text-[10px]">Delete</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowHelp(true)} 
                    className="flex flex-col items-center p-1 h-auto"
                  >
                    <Info className="h-5 w-5 mb-1" />
                    <span className="text-[10px]">Help</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleSwitchToDesktop} 
                    className="flex flex-col items-center p-1 h-auto col-span-3"
                  >
                    <ExternalLink className="h-5 w-5 mb-1" />
                    <span className="text-[10px]">Switch to Desktop Version</span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Status text below toolbar */}
          <div className="mt-2 text-xs text-center text-muted-foreground">
            {models.length > 0 
              ? `${models.length} model(s) ${selectedModelIndex !== null ? '- Model ' + (selectedModelIndex + 1) + ' selected' : ''}`
              : `Add shapes or import models to begin`
            }
          </div>
        </Card>
      </div>
      
      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mobile Modeler Help</DialogTitle>
            <DialogDescription>
              FishCAD Mobile Modeler - Quick Guide
            </DialogDescription>
          </DialogHeader>
          
          <div className="text-sm space-y-3">
            <div>
              <h3 className="font-bold">Basic Controls:</h3>
              <ul className="list-disc pl-5 text-xs">
                <li>Drag: Rotate model</li>
                <li>Pinch: Zoom in/out</li>
                <li>Double tap: Reset view</li>
                <li>Tap a model: Select as primary</li>
                <li>Tap selected model again: Select as secondary (for boolean)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold">Features:</h3>
              <ul className="list-disc pl-5 text-xs">
                <li>Add basic shapes (cube, sphere, cylinder)</li>
                <li>Import and export STL files</li>
                <li>Perform boolean operations (union, subtract, intersect)</li>
                <li>Delete models</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold">For Full Features:</h3>
              <p className="text-xs">Use the desktop version for complete CAD capabilities</p>
            </div>
            
            <div className="pt-2">
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={() => setShowHelp(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MobileView; 