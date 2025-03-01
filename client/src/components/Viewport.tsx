import { useEffect, useRef } from "react";
import { useScene } from "@/hooks/use-scene";
import { Card } from "@/components/ui/card";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scene, camera, renderer, initializeScene, models, selectedModelIndex } = useScene();
  
  // Initialize scene when component mounts
  useEffect(() => {
    if (!containerRef.current) return;
    
    console.log("Setting up 3D viewport...");
    
    // Initialize the scene with our container element
    const cleanup = initializeScene(containerRef.current);
    
    // Clean up when component unmounts
    return cleanup;
  }, [initializeScene]);

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
      
      {/* Status overlay */}
      <div 
        className="absolute bottom-4 right-4 bg-background/80 p-2 rounded-md text-sm z-20 pointer-events-none"
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
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-center"
          style={{ pointerEvents: "none" }}
        >
          <h3 className="text-xl font-medium">3D Model Workspace</h3>
          <p className="text-sm opacity-80 mt-2">Click on objects to select them.</p>
          <p className="text-sm opacity-80">Use the transform tools to modify selected objects.</p>
        </div>
      )}
    </Card>
  );
}