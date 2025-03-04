import { useEffect, useRef, useState, useCallback } from "react";
import { useScene } from "@/hooks/use-scene";
import { ViewCube } from "./ViewCube";
import { TransformGizmo } from "./TransformGizmo";
import { useDevice } from "@/lib/hooks/use-device";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
  
  const { isMobile } = useDevice();
  const [touchStartTime, setTouchStartTime] = useState(0);
  const [lastTap, setLastTap] = useState(0);
  const [orbitControls, setOrbitControls] = useState<OrbitControls | null>(null);
  
  // Initialize scene when component mounts
  useEffect(() => {
    if (!containerRef.current) return;
    
    console.log("Setting up 3D viewport...");
    
    // Initialize the scene with our container element
    const cleanup = initializeScene(containerRef.current);
    
    // Get the orbit controls instance from the scene
    if (camera && renderer) {
      const controls = new OrbitControls(camera, renderer.domElement);
      setOrbitControls(controls);
    }
    
    // Clean up when component unmounts
    return () => {
      cleanup();
      if (orbitControls) {
        orbitControls.dispose();
      }
    };
  }, [initializeScene, camera, renderer]);

  // Add touch handlers for mobile devices
  useEffect(() => {
    if (!containerRef.current || !isMobile || !orbitControls) return;

    const container = containerRef.current;
    
    // Mobile touch handlers
    const handleTouchStart = (e: TouchEvent) => {
      // Track touch start time for long press detection
      setTouchStartTime(Date.now());
      
      // Double tap detection for selection
      const currentTime = Date.now();
      const tapLength = currentTime - lastTap;
      if (tapLength < 300 && tapLength > 0) {
        // Double tap detected - implement model selection logic
        e.preventDefault();
        const touch = e.touches[0];
        // You could implement raycasting here to select a model on double tap
        console.log("Double tap detected at", touch.clientX, touch.clientY);
      }
      setLastTap(currentTime);
    };

    const handleTouchEnd = () => {
      setTouchStartTime(0);
    };

    // Adjust OrbitControls for mobile
    if (orbitControls) {
      // Make controls more touch-friendly
      orbitControls.rotateSpeed = 0.5;
      orbitControls.zoomSpeed = 1.0;
      orbitControls.panSpeed = 0.8;
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.2;
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, isMobile, orbitControls, lastTap]);

  // Add debug listener for mouse movement
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Debug mouse events
    const handleMouseMove = (e: MouseEvent) => {
      // Don't log to avoid console spam
      // console.log("Mouse move in viewport", e.clientX, e.clientY);
    };

    const handleMouseDown = (e: MouseEvent) => {
      console.log("Mouse down in viewport", e.clientX, e.clientY);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef.current]);

  // Update camera position when camera view changes
  useEffect(() => {
    if (!camera) return;
    
    console.log(`Changing camera view to: ${cameraView}`);
    
    switch (cameraView) {
      case 'top':
        camera.position.set(0, 50, 0);
        camera.lookAt(0, 0, 0);
        break;
      case 'bottom':
        camera.position.set(0, -50, 0);
        camera.lookAt(0, 0, 0);
        break;  
      case 'front':
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        break;
      case 'back':
        camera.position.set(0, 0, -50);
        camera.lookAt(0, 0, 0);
        break;
      case 'right':
        camera.position.set(50, 0, 0);
        camera.lookAt(0, 0, 0);
        break;
      case 'left':
        camera.position.set(-50, 0, 0);
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
    <div 
      ref={containerRef} 
      className="w-full h-full relative" 
      onContextMenu={(e) => e.preventDefault()} // Prevent right-click menu
    >
      {/* Viewport guidance overlay for mobile - only show on first visit/tutorial */}
      {isMobile && (
        <div className="absolute top-0 left-0 w-full pointer-events-none p-4 text-sm text-center text-white bg-black/30 rounded-b-md opacity-80">
          <p>Pinch to zoom • Drag to rotate • Two fingers to pan</p>
        </div>
      )}
      
      {/* ViewCube - Position differently on mobile */}
      <div className={`absolute ${isMobile ? 'bottom-4 right-4' : 'top-4 right-4'} z-10`}>
        <ViewCube />
      </div>
      
      {/* Loading indicator or other UI elements */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {models.length === 0 && (
          <div className="bg-background/70 backdrop-blur-sm p-6 rounded-md shadow-lg text-center max-w-xs">
            <p className="text-lg font-medium mb-2">No models in scene</p>
            <p className="text-sm text-muted-foreground">
              {isMobile 
                ? "Tap the menu button to add shapes or import models" 
                : "Use the sidebar to add shapes or import models"}
            </p>
          </div>
        )}
      </div>
      
      {/* Transform gizmo */}
      {selectedModelIndex !== null && (
        <TransformGizmo />
      )}
    </div>
  );
}