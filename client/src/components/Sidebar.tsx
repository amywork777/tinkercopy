import React from 'react';
import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { Download, Plus, Trash, Box } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ModelList } from "./ModelList";
import { ModelCombiner } from "./CSGControls";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import * as THREE from "three";

export function Sidebar() {
  const { 
    loadSTL, 
    exportSelectedModelAsSTL, 
    selectedModelIndex,
    removeModel,
    scene,
    selectModel,
    saveHistoryState
  } = useScene();
  const { toast } = useToast();
  
  const handleAddCube = () => {
    // Create a cube geometry
    const geometry = new THREE.BoxGeometry(5, 5, 5);
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
      id: `cube-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Cube ${Date.now()}`,
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    // Add to models array
    const { models } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    // Select the new model
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    // Save to history
    saveHistoryState();
    
    toast({
      title: "Cube added",
      description: "A new cube has been added to the scene",
    });
  };
  
  const handleImportModel = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        await loadSTL(file);
        toast({
          title: "Import Successful",
          description: `Imported ${file.name}`
        });
      } catch (error) {
        console.error("Import error:", error);
        toast({
          title: "Import Failed",
          description: "There was an error importing your STL file",
          variant: "destructive",
        });
      }
    };
    input.click();
  };
  
  const handleExportModel = () => {
    if (selectedModelIndex !== null) {
      try {
        // Get the blob from the export function
        const blob = exportSelectedModelAsSTL();
        if (!blob) {
          throw new Error("Failed to generate STL file");
        }
        
        // Create a download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `model-export-${Date.now()}.stl`;
        link.click();
        
        // Clean up
        URL.revokeObjectURL(url);
        
        toast({
          title: "Export Successful",
          description: "Your model has been exported as STL"
        });
      } catch (error) {
        console.error("Export error:", error);
        toast({
          title: "Export Failed",
          description: "There was an error exporting your model",
          variant: "destructive",
        });
      }
    }
  };
  
  const handleDeleteAllModels = () => {
    // Delete all models by removing them one by one
    const { models } = useScene.getState();
    [...models].forEach((_, index) => {
      removeModel(0); // Always delete the first model as the array shifts
    });
    
    toast({
      title: "All models deleted",
      description: "All models have been removed from the scene",
    });
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex items-center justify-between border-b">
        <h1 className="text-xl font-bold">Model Fusion Studio</h1>
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-0 pt-2">
          <div className="px-3 pb-3 space-y-4">
            <div className="flex flex-col space-y-2">
              <Button
                variant="default"
                size="sm"
                className="justify-start"
                onClick={handleAddCube}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Cube
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={handleImportModel}
              >
                <Download className="mr-1 h-4 w-4" />
                Import STL
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={handleExportModel}
                disabled={selectedModelIndex === null}
              >
                <Download className="mr-1 h-4 w-4" />
                Export STL
              </Button>
              
              <Button
                variant="destructive"
                size="sm"
                className="justify-start"
                onClick={handleDeleteAllModels}
              >
                <Trash className="mr-1 h-4 w-4" />
                Delete All
              </Button>
            </div>
            
            <ModelList />
            <ModelCombiner />
          </div>
        </div>
      </div>
    </div>
  );
}
