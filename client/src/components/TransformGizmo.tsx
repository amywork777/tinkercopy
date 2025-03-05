import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Object3D } from 'three';
import { useScene } from '@/hooks/use-scene';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { setGizmoActive } from '@/lib/dragState';

// Custom simplified implementation that doesn't rely on TransformControls
export function TransformGizmo() {
  // References to our custom transform objects
  const transformGroupRef = useRef<THREE.Group | null>(null);
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);
  
  const { 
    scene, 
    camera, 
    renderer, 
    models, 
    selectedModelIndex, 
    transformMode,
    setModelPosition,
    orbitControls,
    saveHistoryState,
    syncTransformUIState
  } = useScene();

  // Create our custom transform controls when component mounts
  useEffect(() => {
    if (!scene || !camera || !renderer) {
      console.error("TransformGizmo: Scene, camera or renderer not available");
      return;
    }

    console.log("TransformGizmo: Creating custom transform controls");
    
    // Create a group to hold all the transform handles
    const transformGroup = new THREE.Group();
    transformGroup.name = 'customTransformControls';
    transformGroupRef.current = transformGroup;
    
    // Create directional arrows for transformation
    // X axis - Red
    const xDir = new THREE.Vector3(1, 0, 0);
    const xArrow = new THREE.ArrowHelper(
      xDir, 
      new THREE.Vector3(0, 0, 0),
      5,  // Length
      0xff0000,  // Red
      1,  // Head length
      0.5  // Head width
    );
    xArrow.name = 'xArrow';
    xArrowRef.current = xArrow;
    
    // Y axis - Green
    const yDir = new THREE.Vector3(0, 1, 0);
    const yArrow = new THREE.ArrowHelper(
      yDir, 
      new THREE.Vector3(0, 0, 0),
      5,
      0x00ff00,  // Green
      1,
      0.5
    );
    yArrow.name = 'yArrow';
    yArrowRef.current = yArrow;
    
    // Z axis - Blue
    const zDir = new THREE.Vector3(0, 0, 1);
    const zArrow = new THREE.ArrowHelper(
      zDir, 
      new THREE.Vector3(0, 0, 0),
      5,
      0x0000ff,  // Blue
      1,
      0.5
    );
    zArrow.name = 'zArrow';
    zArrowRef.current = zArrow;
    
    // Add all arrows to the transform group
    transformGroup.add(xArrow);
    transformGroup.add(yArrow);
    transformGroup.add(zArrow);
    
    // Add the transform group to the scene
    scene.add(transformGroup);
    
    // Setup raycaster for handle interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    // Track which arrow is being dragged
    let activeDragAxis: 'x' | 'y' | 'z' | null = null;
    let dragStartPosition = new THREE.Vector2();
    let originalModelPosition = new THREE.Vector3();
    
    // Function to update transform group position
    const updateTransformGroupPosition = () => {
      if (!transformGroup) return;
      
      // If we have a selected model, position the transform group at the model's position
      if (selectedModelIndex !== null && models[selectedModelIndex]) {
        const model = models[selectedModelIndex];
        transformGroup.position.copy(model.mesh.position);
      }
    };
    
    // Handle mouse down on an arrow
    const handleMouseDown = (event: MouseEvent) => {
      if (selectedModelIndex === null || !models[selectedModelIndex]) return;
      
      // Get mouse position in normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Cast a ray from the camera through the mouse position
      raycaster.setFromCamera(mouse, camera);
      
      // Check for intersections with our arrows
      const arrowObjects = [xArrow, yArrow, zArrow];
      const intersects = raycaster.intersectObjects(arrowObjects, true);
      
      if (intersects.length > 0) {
        // Set gizmo as active
        setGizmoActive(true);
        
        // Disable orbit controls while dragging
        if (orbitControls) {
          orbitControls.enabled = false;
        }
        
        // Determine which arrow was clicked
        const clickedArrow = intersects[0].object;
        let arrow = null;
        
        // Find the parent ArrowHelper
        const findArrowHelper = (obj: THREE.Object3D): THREE.ArrowHelper | null => {
          if (obj.type === 'ArrowHelper') return obj as THREE.ArrowHelper;
          if (obj.parent) return findArrowHelper(obj.parent);
          return null;
        };
        
        arrow = findArrowHelper(clickedArrow);
        
        if (arrow) {
          // Set the active drag axis based on which arrow was clicked
          if (arrow === xArrow) activeDragAxis = 'x';
          else if (arrow === yArrow) activeDragAxis = 'y';
          else if (arrow === zArrow) activeDragAxis = 'z';
          
          console.log(`TransformGizmo: Started dragging ${activeDragAxis} axis`);
          
          // Store the starting position for reference
          dragStartPosition.set(mouse.x, mouse.y);
          
          // Store the original model position
          originalModelPosition.copy(models[selectedModelIndex].mesh.position);
          
          // Add listeners for mouse move and mouse up
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
          
          // Prevent default to avoid text selection
          event.preventDefault();
        }
      }
    };
    
    // Handle mouse move while dragging
    const handleMouseMove = (event: MouseEvent) => {
      if (activeDragAxis && selectedModelIndex !== null) {
        // Get current mouse position
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Calculate delta from drag start
        const deltaX = mouse.x - dragStartPosition.x;
        const deltaY = mouse.y - dragStartPosition.y;
        
        // Speed factor for movement
        const moveFactor = 10;
        
        // Apply the movement based on active axis
        const model = models[selectedModelIndex];
        const newPosition = originalModelPosition.clone();
        
        if (transformMode === 'translate') {
          switch (activeDragAxis) {
            case 'x':
              newPosition.x += deltaX * moveFactor;
              break;
            case 'y':
              newPosition.y += deltaY * moveFactor;
              break;
            case 'z':
              // For Z, we'll use X movement as it's easier to visualize
              newPosition.z += deltaX * moveFactor;
              break;
          }
          
          // Update model position
          setModelPosition(newPosition.x, newPosition.y, newPosition.z);
          
          // Update transform controls position
          updateTransformGroupPosition();
          
          // Render the scene
          renderer.render(scene, camera);
        }
      }
    };
    
    // Handle mouse up after dragging
    const handleMouseUp = () => {
      if (activeDragAxis) {
        console.log(`TransformGizmo: Finished dragging ${activeDragAxis} axis`);
        
        // Mark gizmo as inactive
        setGizmoActive(false);
        
        // Re-enable orbit controls
        if (orbitControls) {
          orbitControls.enabled = true;
        }
        
        // Clear active drag axis
        activeDragAxis = null;
        
        // Remove the event listeners
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        
        // Save the state for undo/redo
        syncTransformUIState();
        saveHistoryState();
      }
    };
    
    // Add the mouse down event listener to the canvas
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    
    // Clean up function
    return () => {
      // Remove all event listeners
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      // Remove transform group from scene
      if (transformGroupRef.current) {
        scene.remove(transformGroupRef.current);
        transformGroupRef.current = null;
      }
      
      // Reset gizmo active state
      setGizmoActive(false);
      
      console.log("TransformGizmo: Cleaned up custom controls");
    };
  }, [scene, camera, renderer, orbitControls, saveHistoryState, syncTransformUIState]);
  
  // Handle selection changes - update transform controls position and visibility
  useEffect(() => {
    // Skip if no transform group
    if (!transformGroupRef.current) return;
    
    console.log("TransformGizmo: Selection changed", { selectedModelIndex });
    
    // Hide or show the transform group based on selection
    if (selectedModelIndex !== null && models[selectedModelIndex]) {
      // Show controls
      transformGroupRef.current.visible = true;
      
      // Get the selected model
      const selectedModel = models[selectedModelIndex];
      
      // Update transform group position to match model position
      transformGroupRef.current.position.copy(selectedModel.mesh.position);
      
      console.log("TransformGizmo: Controls positioned at", transformGroupRef.current.position);
      
      // Force render to show controls
      if (renderer && camera) {
        renderer.render(scene, camera);
      }
    } else {
      // Hide controls if no model is selected
      transformGroupRef.current.visible = false;
    }
  }, [selectedModelIndex, models, scene, camera, renderer]);
  
  // Update controls based on transform mode
  useEffect(() => {
    if (!transformGroupRef.current) return;
    
    console.log("TransformGizmo: Mode changed to", transformMode);
    
    // Adjust the appearance based on transform mode
    // For now we only implemented translate, but you could add rotate/scale
    
    // Force render
    if (renderer && camera) {
      renderer.render(scene, camera);
    }
  }, [transformMode, scene, camera, renderer]);
  
  // This component doesn't render any DOM elements
  return null;
} 