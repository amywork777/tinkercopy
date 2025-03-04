import { useEffect, useRef, useState, useCallback } from "react";
import { useScene } from "@/hooks/use-scene";
import { Card } from "@/components/ui/card";
import { ViewCube } from "./ViewCube";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { 
    scene, 
    camera, 
    renderer, 
    initializeScene, 
    models, 
    selectedModelIndex,
    cameraView,
    showGrid,
    showAxes,
    setCameraView
  } = useScene();
  
  // Initialize scene when component mounts
  useEffect(() => {
    if (!containerRef.current) return;
    
    console.log("Setting up 3D viewport...");
    
    // Initialize the scene with our container element
    const cleanup = initializeScene(containerRef.current);
    
    // Clean up when component unmounts
    return cleanup;
  }, [initializeScene]);

  // Update camera position when camera view changes
  useEffect(() => {
    if (!camera) return;
    
    console.log(`Changing camera view to: ${cameraView}`);
    
    switch (cameraView) {
      case 'top':
        camera.position.set(0, 50, 0);
        camera.lookAt(0, 0, 0);
        break;
      case 'front':
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        break;
      case 'side':
        camera.position.set(50, 0, 0);
        camera.lookAt(0, 0, 0);
        break;
      case 'isometric':
        camera.position.set(30, 30, 30);
        camera.lookAt(0, 0, 0);
        break;
    }
    
    // Force renderer update
    if (renderer) {
      renderer.render(scene, camera);
    }
  }, [cameraView, camera, renderer, scene]);

  // Toggle grid visibility
  useEffect(() => {
    if (!scene) return;
    
    // Find the grid helper in the scene
    const gridHelper = scene.children.find(child => child.name === 'gridHelper');
    
    if (gridHelper) {
      gridHelper.visible = showGrid;
      
      // Force renderer update
      if (renderer && camera) {
        renderer.render(scene, camera);
      }
    }
  }, [showGrid, scene, renderer, camera]);

  // Toggle axes visibility
  useEffect(() => {
    if (!scene) return;
    
    // Find the axes helper in the scene
    const axesHelper = scene.children.find(child => child.name === 'axesHelper');
    
    if (axesHelper) {
      if (showAxes) {
        scene.add(axesHelper);
      } else {
        scene.remove(axesHelper);
      }
      
      // Force renderer update
      if (renderer && camera) {
        renderer.render(scene, camera);
      }
    }
  }, [showAxes, scene, renderer, camera]);

  return (
    <Card 
      className="h-full w-full rounded-md overflow-hidden border shadow-md relative"
      style={{ position: "relative" }}
    >
      {/* Container div for Three.js canvas with important positioning styles */}
      <div 
        ref={containerRef} 
        className="w-full h-full relative"
        style={{
          minHeight: "600px",
          background: "#333", // Fallback color before scene loads
          position: "relative",
          touchAction: "none" // Disable browser handling of touch events
        }}
      />
      
      {/* View Cube */}
      <ViewCube />
      
      {/* Status overlay */}
      <div 
        className="absolute bottom-4 left-4 bg-background/80 p-2 rounded-md text-sm z-20 pointer-events-none"
        style={{ pointerEvents: "none" }}
      >
        {models.length === 0 ? (
          <span>Import an STL model to get started</span>
        ) : (
          <span>Models: {models.length} | Selected: {selectedModelIndex !== null ? 
            models[selectedModelIndex]?.name.slice(0, 20) || 'Unknown' : 'None'}</span>
        )}
      </div>
      
      {/* Help text overlay when empty */}
      {models.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-background/50 p-6 rounded-lg text-center max-w-md">
            <h3 className="text-lg font-medium mb-2">Empty Scene</h3>
            <p className="text-muted-foreground mb-4">
              Add a shape from the sidebar or import an STL file to get started
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}