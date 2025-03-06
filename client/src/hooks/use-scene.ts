import { create } from "zustand";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSG } from 'three-csg-ts';
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry, TextGeometryParameters } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { createRoot } from 'react-dom/client';
import { ImportScaleDialog } from '../components/ImportScaleDialog';
import { Vector3 } from "three";
import * as React from 'react';
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isGizmoBeingDragged } from '@/lib/dragState';

// Scene configuration
const GRID_SIZE = 500; // Much larger grid for better visibility
const GRID_DIVISIONS = 100; // More divisions for finer grid
const BACKGROUND_COLOR = 0x333333; // Dark gray

// Define an array of vibrant, fun colors
const vibrantColors = [
  '#FF5733', // Bright orange/coral
  '#33FF57', // Bright green
  '#3357FF', // Bright blue
  '#FF33A8', // Hot pink
  '#33FFF6', // Cyan
  '#F6FF33', // Bright yellow
  '#FF33F6', // Magenta
  '#FF5757', // Bright red
  '#57FF57', // Lime green
  '#5757FF', // Indigo
  '#FFC733', // Gold
  '#33CFFF', // Sky blue
  '#FF9E33', // Orange
  '#B533FF', // Purple
  '#33FF9E'  // Mint green
];

const getRandomColor = () => {
  // Select a random color from the array
  const randomIndex = Math.floor(Math.random() * vibrantColors.length);
  return new THREE.Color(vibrantColors[randomIndex]);
};

// Maximum model size in inches - set to exactly 10 inches
const MAX_SIZE_INCHES = 10;
const MM_PER_INCH = 25.4;
const MAX_SIZE_MM = MAX_SIZE_INCHES * MM_PER_INCH; // 254mm

// Helper constants for transformation
const TRANSFORM_STEP = 5.0;
const ROTATION_STEP = Math.PI / 18;
const SCALE_STEP = 0.2;
const SNAP_THRESHOLD = 1.0;
const SNAP_GRID_SIZE = 2.0;

// Type for our 3D models
type Model = {
  id: string;
  name: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'text' | 'model' | 'torusknot' | 'octahedron' | 'icosahedron' | 'dodecahedron' | 'capsule' | 'pyramid' | 'svg';
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  originalScale: THREE.Vector3;
  textProps?: TextProps;
};

// Type for our transform operations
type TransformOperation = 'translateX' | 'translateY' | 'translateZ' | 
                         'rotateX' | 'rotateY' | 'rotateZ' | 
                         'scaleX' | 'scaleY' | 'scaleZ';

// Type for history tracking
type HistoryRecord = {
  models: Model[];
  selectedModelIndex: number | null;
};

// Type for our snap settings
type SnapSettings = {
  enabled: boolean;
  snapToGrid: boolean;
  snapToFaces: boolean;
  snapToEdges: boolean;
  snapThreshold: number;
};

// Add SVG Result type
type SVGResult = {
  paths: Array<{
    toShapes: (solid: boolean) => THREE.Shape[];
  }>;
};

// Utility function to merge Float32Arrays
const mergeFloat32Arrays = (arrays: Float32Array[]): Float32Array => {
  // Calculate total length
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  
  // Create new array with combined length
  const result = new Float32Array(totalLength);
  
  // Copy data
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  return result;
};

// Text options type
type TextOptions = {
  text: string;
  fontSize?: number;
  height?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelSegments?: number;
  color?: THREE.Color | string | number;
  fontPath?: string;
};

// Default font path
const defaultFontPath = '/fonts/helvetiker_regular.typeface.json';

type SceneState = {
  // Scene components
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbitControls: OrbitControls | null;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;

  // State variables
  models: Model[];
  isSceneInitialized: boolean;
  isSceneReady: boolean;
  selectedModelIndex: number | null;
  secondaryModelIndex: number | null; // For CSG operations
  transformMode: "translate" | "rotate" | "scale";
  
  // Rendering mode
  renderingMode: 'standard' | 'wireframe' | 'realistic' | 'xray';
  setRenderingMode: (mode: 'standard' | 'wireframe' | 'realistic' | 'xray') => void;
  
  // Unit system
  unit: 'mm' | 'in';
  setUnit: (unit: 'mm' | 'in') => void;
  convertValue: (value: number, from: 'mm' | 'in', to: 'mm' | 'in') => number;
  
  // View options
  cameraView: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric';
  showGrid: boolean;
  showAxes: boolean;
  setCameraView: (view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric') => void;
  setShowGrid: (show: boolean) => void;
  setShowAxes: (show: boolean) => void;
  
  // Loading states
  isCSGOperationLoading: boolean;
  
  // History tracking for undo/redo
  history: HistoryRecord[];
  currentHistoryIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  
  // Snap settings
  snapSettings: SnapSettings;
  snapIndicators: THREE.Object3D[];
  
  // Scene initialization
  initializeScene: (container: HTMLDivElement) => () => void;
  
  // Model management
  loadSTL: (file: File | string, name?: string) => Promise<void>;
  loadSVG: (file: File | string, extrudeDepth?: number) => Promise<void>;
  loadText: (text: string, options?: TextOptions) => Promise<void>;
  removeModel: (index: number) => void;
  selectModel: (index: number | null) => void;
  selectSecondaryModel: (index: number | null) => void;
  
  // Transform operations - direct transforms without controls
  setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
  applyTransform: (operation: TransformOperation, direction: 1 | -1) => void;
  resetTransform: () => void;
  
  // Direct transform methods
  setModelPosition: (x: number, y: number, z: number) => void;
  setModelRotation: (x: number, y: number, z: number) => void;
  setModelScale: (x: number, y: number, z: number) => void;
  
  // CSG operations
  performCSGOperation: (operationType: 'union' | 'subtract' | 'intersect') => Promise<void>;
  
  // History operations
  saveHistoryState: () => void;
  undo: () => void;
  redo: () => void;
  
  // Snap operations
  toggleSnap: () => void;
  updateSnapSettings: (settings: Partial<SnapSettings>) => void;
  clearSnapIndicators: () => void;
  
  // Export
  exportSelectedModelAsSTL: () => Blob | null;

  // Add function to update grid position based on models
  updateGridPosition: () => void;

  // Sync UI state with current model transforms
  syncTransformUIState: () => void;
};

export const useScene = create<SceneState>((set, get) => {
  // Create initial Three.js objects 
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    precision: "highp"
  });
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  return {
    // Scene components
    scene,
    camera,
    renderer,
    orbitControls: null,
    raycaster,
    mouse,
    
    // State variables
    models: [],
    isSceneInitialized: false,
    isSceneReady: false,
    selectedModelIndex: null,
    secondaryModelIndex: null,
    transformMode: "scale",

    // Rendering mode
    renderingMode: 'standard',

    // Unit system
    unit: 'mm',
    setUnit: (unit: 'mm' | 'in') => {
      set({ unit });
      console.log(`Changed unit system to ${unit}`);
    },
    convertValue: (value: number, from: 'mm' | 'in', to: 'mm' | 'in'): number => {
      if (from === to) return value;
      
      if (from === 'mm' && to === 'in') {
        // Convert mm to inches (1 inch = 25.4 mm)
        return value / 25.4;
      } else if (from === 'in' && to === 'mm') {
        // Convert inches to mm
        return value * 25.4;
      }
      
      return value; // Fallback
    },

    // View options
    cameraView: 'isometric',
    showGrid: true,
    showAxes: true,

    // Loading states
    isCSGOperationLoading: false,
    
    // History tracking for undo/redo
    history: [],
    currentHistoryIndex: -1,
    canUndo: false,
    canRedo: false,
    
    // Snap settings
    snapSettings: {
      enabled: false,
      snapToGrid: true,
      snapToFaces: true,
      snapToEdges: true,
      snapThreshold: SNAP_THRESHOLD
    },
    snapIndicators: [],
    
    // Initialize the 3D scene
    initializeScene: (container: HTMLDivElement) => {
      console.log("Initializing scene with container:", container);
      const state = get();

      if (state.isSceneInitialized) {
        console.log("Scene already initialized, skipping");
        return () => {};
      }
      
      // Clear container
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      
      // Set up renderer
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setClearColor(BACKGROUND_COLOR);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // Style canvas
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.touchAction = "none";
      canvas.style.outline = "none";
      canvas.style.zIndex = "1";
      
      // Append to container
      container.appendChild(canvas);
      console.log("Canvas attached to DOM:", canvas.width, "x", canvas.height);
      
      // Setup camera and orbit controls
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.position.set(25, 25, 25); // Was originally 10, 10, 10
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      
      // Initialize orbit controls with optimizations for transform controls
      const orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.minDistance = 5; // Allow closer zoom
      orbitControls.maxDistance = 200; // Allow further zoom
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.05;
      orbitControls.rotateSpeed = 0.7; // Slow down rotation for more precise control
      orbitControls.zoomSpeed = 0.8; // Slightly slower zoom for better control
      orbitControls.addEventListener('change', () => {
        // Force renderer update on orbit change
        renderer.render(scene, camera);
      });
      
      // Make sure the canvas receives all pointer events
      canvas.style.pointerEvents = "auto";
      canvas.style.zIndex = "1";
      
      set({ orbitControls });
      
      // Add a grid helper and give it a name for later reference
      const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);
      gridHelper.name = 'gridHelper';
      gridHelper.visible = get().showGrid;
      gridHelper.position.y = -25; // Start grid lower initially
      scene.add(gridHelper);
      
      // Add axes helper
      const axesHelper = new THREE.AxesHelper(GRID_SIZE / 2); // Larger axes for better visibility
      axesHelper.name = 'axesHelper';
      axesHelper.visible = get().showAxes;
      scene.add(axesHelper);
      
      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(10, 10, 10);
      directionalLight.castShadow = true;
      scene.add(directionalLight);
      
      // Add click event listener for model selection 
      canvas.addEventListener('pointerdown', (event) => {
          const currentState = get();
          
        // Check if the gizmo is being dragged to avoid conflicts
        if (isGizmoBeingDragged()) {
          return;
        }
        
        // We're skipping complicated checks for debugging purposes
        // This avoids potential conflicts between selection and transformation
        const isTransformActive = false; // Allow selection to work for debugging
        
        // Only handle selection when orbit controls are enabled
        if (orbitControls.enabled && !isTransformActive) {
          // Prevent default to avoid any browser handling
          event.preventDefault();
          
          // Only handle left mouse button
          if (event.button !== 0) return;
          
          // Get mouse position
          const rect = canvas.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          // Update raycaster
          mouse.set(x, y);
          raycaster.setFromCamera(mouse, camera);
          
          // Get current models to check
          const currentModels = currentState.models;
          if (currentModels.length === 0) return;
          
          // Find intersections with models
          const meshes = currentModels.map(model => model.mesh);
          const intersects = raycaster.intersectObjects(meshes, false);
          
          if (intersects.length > 0) {
            // Find which model was clicked
            const clickedMesh = intersects[0].object as THREE.Mesh;
            const modelIndex = currentModels.findIndex(model => model.mesh === clickedMesh);
            
            if (modelIndex !== -1) {
              console.log(`Clicked on model ${modelIndex}:`, currentModels[modelIndex].name);
              get().selectModel(modelIndex);
              
              // Initialize free dragging if a model is selected
              const selectedModel = currentModels[modelIndex];
              
              // Create a drag plane perpendicular to the camera direction
              const dragPlane = new THREE.Plane();
              const cameraDirection = new THREE.Vector3();
              camera.getWorldDirection(cameraDirection);
              dragPlane.setFromNormalAndCoplanarPoint(
                cameraDirection,
                selectedModel.mesh.position
              );
              
              // Save initial intersection point
              const initialIntersection = new THREE.Vector3();
              const initialRay = new THREE.Ray(camera.position, raycaster.ray.direction);
              initialRay.intersectPlane(dragPlane, initialIntersection);
              
              // Save the initial model position
              const initialModelPosition = selectedModel.mesh.position.clone();
              
              // Disable orbit controls during dragging
              orbitControls.enabled = false;
              
              // Define pointermove handler
              const handlePointerMove = (moveEvent: PointerEvent) => {
                // Get current mouse position
                const rect = canvas.getBoundingClientRect();
                const x = ((moveEvent.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((moveEvent.clientY - rect.top) / rect.height) * 2 + 1;
                
                // Update raycaster with new mouse position
                mouse.set(x, y);
                raycaster.setFromCamera(mouse, camera);
                
                // Find the new intersection point with the drag plane
                const currentIntersection = new THREE.Vector3();
                const currentRay = new THREE.Ray(camera.position, raycaster.ray.direction);
                if (currentRay.intersectPlane(dragPlane, currentIntersection)) {
                  // Calculate the offset
                  const offset = new THREE.Vector3().subVectors(
                    currentIntersection,
                    initialIntersection
                  );
                  
                  // Apply offset to model position
                  const newPosition = new THREE.Vector3().addVectors(
                    initialModelPosition,
                    offset
                  );
                  
                  // Update the model position
                  get().setModelPosition(newPosition.x, newPosition.y, newPosition.z);
                }
              };
              
              // Define pointerup handler
              const handlePointerUp = () => {
                // Remove event listeners
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
                
                // Re-enable orbit controls
                orbitControls.enabled = true;
                
                // Save the state for undo/redo
                get().saveHistoryState();
              };
              
              // Add event listeners for dragging
              window.addEventListener('pointermove', handlePointerMove);
              window.addEventListener('pointerup', handlePointerUp);
            }
          } else {
            // Clicked on empty space, deselect
            get().selectModel(null);
          }
        }
      });
      
      // Set up animation loop
      function animate() {
        requestAnimationFrame(animate);
        
        if (orbitControls) {
          orbitControls.update();
        }
        
        // Ensure grid and axes visibility matches state
        const state = get();
        const gridHelper = scene.children.find(child => child.name === 'gridHelper');
        const axesHelper = scene.children.find(child => child.name === 'axesHelper');
        
        if (gridHelper) {
          gridHelper.visible = state.showGrid;
        }
        
        if (axesHelper) {
          axesHelper.visible = state.showAxes;
        }
        
        renderer.render(scene, camera);
      }
      
      animate();
      
      // Handle window resize
      function handleResize() {
        if (!container) return;
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.render(scene, camera);
      }
      
      window.addEventListener('resize', handleResize);
      
      // Update state
      set({ 
        orbitControls, 
        isSceneInitialized: true,
        isSceneReady: true
      });
      
      // Return cleanup function
      return () => {
        console.log("Cleaning up scene");
        window.removeEventListener('resize', handleResize);
        
        if (container.contains(canvas)) {
          container.removeChild(canvas);
        }
        
        // Reset state
        set({
          orbitControls: null,
          isSceneInitialized: false,
          isSceneReady: false,
        });
      };
    },
    
    // Add function to update grid position based on models
    updateGridPosition: () => {
        const state = get();
      const gridHelper = state.scene.children.find(child => child.name === 'gridHelper');
      if (!gridHelper) return;

      // Find the lowest point among all models
      let lowestY = 0;
      let hasModels = false;

      state.models.forEach(model => {
        if (!model.mesh) return;
        
        // Create a new bounding box for the entire mesh in world space
        const bbox = new THREE.Box3();
        bbox.setFromObject(model.mesh); // This handles all transformations automatically

        if (!hasModels) {
          lowestY = bbox.min.y;
          hasModels = true;
              } else {
          lowestY = Math.min(lowestY, bbox.min.y);
        }
      });

      // Position grid 50mm below the lowest point or at -50 if no models
      const gridY = hasModels ? lowestY - 50 : -50;
      gridHelper.position.y = gridY;

      // Force scene update
      if (state.renderer && state.camera) {
        state.renderer.render(state.scene, state.camera);
      }
    },
    
    // Load an STL file
    loadSTL: async (file: File | string, name?: string) => {
      const loader = new STLLoader();
      let geometry: THREE.BufferGeometry;
      
      if (typeof file === 'string') {
        // If file is a URL string, load it directly
        try {
          // For Firebase Storage URLs, we need to fetch the data ourselves
          // because STLLoader might have CORS issues with the Firebase URLs
          const response = await fetch(file);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          geometry = loader.parse(arrayBuffer);
        } catch (error) {
          console.error("Error loading STL from URL:", error);
          throw new Error(`Failed to load STL from URL: ${error}`);
        }
      } else {
        // Original file handling logic
        const arrayBuffer = await file.arrayBuffer();
        geometry = loader.parse(arrayBuffer);
      }
      
      // Show scaling dialog
      const dialogRoot = document.createElement('div');
      dialogRoot.id = 'scale-dialog-root';
      document.body.appendChild(dialogRoot);
      
      // Create a promise that resolves when scaling is complete
      const scale = await new Promise<THREE.Vector3>((resolve) => {
        const root = createRoot(dialogRoot);
        root.render(
          React.createElement(ImportScaleDialog, {
            isOpen: true,
            onClose: () => {
              root.unmount();
              dialogRoot.remove();
              resolve(new THREE.Vector3(1, 1, 1)); // Default scale if dialog is closed
            },
            geometry: geometry,
            onScale: (scale) => {
              root.unmount();
              dialogRoot.remove();
              resolve(scale);
            }
          })
        );
      });
      
      // Create mesh with random color and apply scale
        const material = new THREE.MeshStandardMaterial({ 
          color: getRandomColor(),
        metalness: 0.5,
        roughness: 0.5,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

      // Apply the chosen scale
      mesh.scale.copy(scale);

      // Center geometry
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox!.getCenter(center);
      geometry.center();

      // Find suitable position
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const position = findSuitablePosition(get().models, size);
      mesh.position.copy(position);

      // Add to scene
      scene.add(mesh);
        
        // Store original transform
        const originalPosition = mesh.position.clone();
        const originalRotation = mesh.rotation.clone();
        const originalScale = mesh.scale.clone();
        
        // Create model object
      const model: Model = {
          id: `model-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: name || (typeof file === 'string' ? file.split('/').pop() || 'Model from URL' : file.name),
          type: 'model',
          mesh,
          originalPosition,
          originalRotation,
          originalScale
        };
        
      // Update state
      const updatedModels = [...get().models, model];
      set({ 
        models: updatedModels,
        selectedModelIndex: updatedModels.length - 1 
      });
        get().saveHistoryState();
      get().updateGridPosition();
    },

    // Remove a model
    removeModel: (index: number) => {
      const state = get();
      if (index < 0 || index >= state.models.length) return;

      const model = state.models[index];
      scene.remove(model.mesh);

      const newModels = [...state.models];
      newModels.splice(index, 1);
      set({ models: newModels, selectedModelIndex: null });

      // Update grid position after removing model
      get().updateGridPosition();

      // Save to history
      get().saveHistoryState();
    },
    
    // Select a model
    selectModel: (index: number | null) => {
      const { models, selectedModelIndex, clearSnapIndicators, renderingMode } = get();
      
      // If there was a previously selected model, reset its appearance
      if (selectedModelIndex !== null && models[selectedModelIndex]) {
        const model = models[selectedModelIndex];
        // First preserve the current color
        const currentColor = model.mesh.material instanceof THREE.Material 
          ? (model.mesh.material as THREE.MeshStandardMaterial).color 
          : new THREE.Color(0x888888);
        
        // Apply material based on the current rendering mode
        updateModelMaterial(model.mesh, renderingMode);
      }
      
      // If selecting a new model, highlight it while preserving the rendering mode
      if (index !== null && models[index]) {
        const model = models[index];
        const currentColor = model.mesh.material instanceof THREE.Material 
          ? (model.mesh.material as THREE.MeshStandardMaterial).color 
          : new THREE.Color(0x888888);
        
        // First apply the current rendering mode
        updateModelMaterial(model.mesh, renderingMode);
        
        // Then add highlighting based on material type
        if (model.mesh.material instanceof THREE.MeshStandardMaterial || 
            model.mesh.material instanceof THREE.MeshPhysicalMaterial) {
          model.mesh.material.emissive = new THREE.Color(0x222222);
        }
      }
      
      // Reset highlighting on all models
      models.forEach(model => {
        if (model.mesh.material instanceof THREE.MeshStandardMaterial ||
            model.mesh.material instanceof THREE.MeshPhysicalMaterial) {
          model.mesh.material.emissive.set(0x000000); // Reset emissive to black (no glow)
        }
      });
      
      // If selecting a model, highlight it
      if (index !== null && models[index]) {
        const selectedModel = models[index];
        
        // Highlight selected model with emissive glow based on material type
        if (selectedModel.mesh.material instanceof THREE.MeshStandardMaterial ||
            selectedModel.mesh.material instanceof THREE.MeshPhysicalMaterial) {
          selectedModel.mesh.material.emissive.set(0x222222); // Slight glow
        }
      }
      
      clearSnapIndicators(); // Clear indicators when selecting a new model
      
      // Force a render to show changes
      const { scene, camera, renderer } = get();
      renderer.render(scene, camera);
      
      set({ selectedModelIndex: index });
    },
    
    // Select a secondary model for CSG operations
    selectSecondaryModel: (index: number | null) => {
      const state = get();

      // Reset secondary highlighting on all models
      state.models.forEach(model => {
        // Only reset secondary highlight, not the primary selected model
        if (state.models.indexOf(model) !== state.selectedModelIndex) {
          // Check if this is not the primary selected model and it was secondarily selected
          if (model.mesh.userData.secondarySelected) {
            // Reset emissive based on material type
            if (model.mesh.material instanceof THREE.MeshStandardMaterial || 
                model.mesh.material instanceof THREE.MeshPhysicalMaterial) {
              model.mesh.material.emissive.set(0x000000);
            }
            model.mesh.userData.secondarySelected = false;
          }
        }
      });
      
      // Update secondary model index
      set({ secondaryModelIndex: index });
      
      // If selecting a secondary model, highlight it differently
      if (index !== null && state.models[index]) {
        const secondaryModel = state.models[index];
        
        // Highlight secondary model with a different emissive color based on material type
        if (secondaryModel.mesh.material instanceof THREE.MeshStandardMaterial || 
            secondaryModel.mesh.material instanceof THREE.MeshPhysicalMaterial) {
          secondaryModel.mesh.material.emissive.set(0x004444); // Teal-ish color
        }
        secondaryModel.mesh.userData.secondarySelected = true;
        
        console.log("Selected secondary model:", secondaryModel.name);
      }
      
      // Force a render to show changes
      state.renderer.render(state.scene, state.camera);
    },
    
    // Set transform mode (affects how applyTransform works)
    setTransformMode: (mode: "translate" | "rotate" | "scale") => {
      const { clearSnapIndicators } = get();
      clearSnapIndicators();
      set({ transformMode: mode });
      console.log(`Transform mode set to: ${mode}`);
    },

    // Apply transformation directly to the selected model
    applyTransform: (operation: TransformOperation, direction: 1 | -1) => {
      const state = get();
      const { selectedModelIndex, models, snapSettings, unit } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for transform");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Convert max size to current unit
      const maxSizeInCurrentUnit = unit === 'in' ? MAX_SIZE_INCHES : MAX_SIZE_INCHES * MM_PER_INCH;
      
      // Apply the requested transform
      switch(operation) {
        // Translation operations
        case 'translateX':
          mesh.position.x += TRANSFORM_STEP * direction;
          if (snapSettings.enabled) snapModelPosition(selectedModelIndex);
          console.log(`Moved X to: ${mesh.position.x.toFixed(2)}`);
          break;
        case 'translateY':
          mesh.position.y += TRANSFORM_STEP * direction;
          if (snapSettings.enabled) snapModelPosition(selectedModelIndex);
          console.log(`Moved Y to: ${mesh.position.y.toFixed(2)}`);
          break;
        case 'translateZ':
          mesh.position.z += TRANSFORM_STEP * direction;
          if (snapSettings.enabled) snapModelPosition(selectedModelIndex);
          console.log(`Moved Z to: ${mesh.position.z.toFixed(2)}`);
          break;
          
        // Rotation operations
        case 'rotateX':
          mesh.rotation.x += ROTATION_STEP * direction;
          break;
        case 'rotateY':
          mesh.rotation.y += ROTATION_STEP * direction;
          break;
        case 'rotateZ':
          mesh.rotation.z += ROTATION_STEP * direction;
          break;
          
        // Scale operations  
        case 'scaleX':
        case 'scaleY':
        case 'scaleZ': {
          const minScale = 0.01; // Smaller minimum scale for more flexibility
          
          // Calculate current size in scene units
          mesh.geometry.computeBoundingBox();
          const boundingBox = mesh.geometry.boundingBox;
          
          if (boundingBox) {
            // Calculate dimensions of the original geometry (before scaling)
            const size = new THREE.Vector3();
            boundingBox.getSize(size);
            const originalWidth = size.x;
            const originalHeight = size.y; 
            const originalDepth = size.z;
            
            console.log(`Original model dimensions: ${originalWidth.toFixed(2)} × ${originalHeight.toFixed(2)} × ${originalDepth.toFixed(2)}`);
            
            // Calculate the proposed new scale
            let newScaleX = mesh.scale.x;
            let newScaleY = mesh.scale.y;
            let newScaleZ = mesh.scale.z;
            
            if (operation === 'scaleX') {
              newScaleX += SCALE_STEP * direction;
            } else if (operation === 'scaleY') {
              newScaleY += SCALE_STEP * direction;
            } else if (operation === 'scaleZ') {
              newScaleZ += SCALE_STEP * direction;
            }
            
            // Calculate the proposed dimensions
            const proposedWidth = originalWidth * newScaleX;
            const proposedHeight = originalHeight * newScaleY;
            const proposedDepth = originalDepth * newScaleZ;
            
            // Check if any dimension would exceed the max size
            const maxDimension = Math.max(proposedWidth, proposedHeight, proposedDepth);
            
            if (direction > 0 && maxDimension > maxSizeInCurrentUnit) {
              // If scaling up and any dimension would exceed max size, don't scale
              console.log(`Cannot scale further - max dimension would be ${(maxDimension/MM_PER_INCH).toFixed(2)} inches`);
              return;
            } else if (direction < 0) {
              // If scaling down, ensure we don't go below minimum
              newScaleX = Math.max(minScale, newScaleX);
              newScaleY = Math.max(minScale, newScaleY);
              newScaleZ = Math.max(minScale, newScaleZ);
            }
            
            // Apply the new scales
            mesh.scale.set(newScaleX, newScaleY, newScaleZ);
            
            // Log current dimensions after scaling
            const currentWidth = originalWidth * mesh.scale.x;
            const currentHeight = originalHeight * mesh.scale.y;
            const currentDepth = originalDepth * mesh.scale.z;
            
            // Convert to appropriate units for display
            const widthInUserUnits = unit === 'in' ? currentWidth / MM_PER_INCH : currentWidth;
            const heightInUserUnits = unit === 'in' ? currentHeight / MM_PER_INCH : currentHeight;
            const depthInUserUnits = unit === 'in' ? currentDepth / MM_PER_INCH : currentDepth;
            
            console.log(`Current dimensions (${unit}): ${widthInUserUnits.toFixed(2)} × ${heightInUserUnits.toFixed(2)} × ${depthInUserUnits.toFixed(2)}`);
            // Also log in mm for debugging
            console.log(`Current dimensions (mm): ${currentWidth.toFixed(2)} × ${currentHeight.toFixed(2)} × ${currentDepth.toFixed(2)}`);
            console.log(`Current dimensions (in): ${(currentWidth/MM_PER_INCH).toFixed(2)} × ${(currentHeight/MM_PER_INCH).toFixed(2)} × ${(currentDepth/MM_PER_INCH).toFixed(2)}`);
          } else {
            // Fallback to original behavior if bounding box is not available
            if (operation === 'scaleX') {
              mesh.scale.x = Math.max(minScale, mesh.scale.x + SCALE_STEP * direction);
            } else if (operation === 'scaleY') {
              mesh.scale.y = Math.max(minScale, mesh.scale.y + SCALE_STEP * direction);
            } else if (operation === 'scaleZ') {
              mesh.scale.z = Math.max(minScale, mesh.scale.z + SCALE_STEP * direction);
            }
          }
          break;
        }
      }
      
      // Update the matrix
      mesh.updateMatrix();
      
      // Render the scene to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after transformation
      get().saveHistoryState();

      // After applying transform
      if (operation.startsWith('translate') || operation.startsWith('scale')) {
        get().updateGridPosition();
      }
    },
    
    // Set direct position for the selected model
    setModelPosition: (x: number, y: number, z: number) => {
      const state = get();
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for position change");
        return;
      }
      
      const model = models[selectedModelIndex];
      model.mesh.position.set(x, y, z);
      
      // Apply snapping if enabled
      if (state.snapSettings.enabled) {
        snapModelPosition(selectedModelIndex);
      }
      
      model.mesh.updateMatrix();
      get().saveHistoryState();
    },
    
    // Set model rotation directly from input values (in radians)
    setModelRotation: (x: number, y: number, z: number) => {
      const state = get();
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for rotation change");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Set the new rotation
      mesh.rotation.set(x, y, z);
      
      // Update the matrix
      mesh.updateMatrix();
      
      console.log(`Set rotation for model ${model.name}:`, { 
        x: `${x.toFixed(2)} rad (${(x * 180 / Math.PI).toFixed(1)}°)`,
        y: `${y.toFixed(2)} rad (${(y * 180 / Math.PI).toFixed(1)}°)`,
        z: `${z.toFixed(2)} rad (${(z * 180 / Math.PI).toFixed(1)}°)`
      });
      
      // Render to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after direct rotation change
      get().saveHistoryState();
    },
    
    // Set model scale directly from input values
    setModelScale: (x: number, y: number, z: number) => {
      const state = get();
      const { selectedModelIndex, models, unit } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for scale change");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Ensure minimum scale is very small to allow for tiny models
      const minScale = 0.0001;
      let validX = Math.max(minScale, x);
      let validY = Math.max(minScale, y);
      let validZ = Math.max(minScale, z);
      
      // Apply exact 10-inch size limit
      mesh.geometry.computeBoundingBox();
      const boundingBox = mesh.geometry.boundingBox;
      
      if (boundingBox) {
        // Calculate dimensions of the original geometry (before scaling)
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const originalWidth = size.x;
        const originalHeight = size.y; 
        const originalDepth = size.z;
        
        // Calculate final dimensions after proposed scaling
        const finalWidth = originalWidth * validX;
        const finalHeight = originalHeight * validY;
        const finalDepth = originalDepth * validZ;
        
        // Check if any dimension would exceed 10 inches (254mm)
        const maxAllowedSize = MAX_SIZE_MM; // 254mm (10 inches)
        
        // Calculate scale factors that would achieve exactly 10 inches for each dimension
        const maxScaleX = originalWidth > 0 ? maxAllowedSize / originalWidth : Infinity;
        const maxScaleY = originalHeight > 0 ? maxAllowedSize / originalHeight : Infinity;
        const maxScaleZ = originalDepth > 0 ? maxAllowedSize / originalDepth : Infinity;
        
        // Apply the limits
        validX = Math.min(validX, maxScaleX);
        validY = Math.min(validY, maxScaleY);
        validZ = Math.min(validZ, maxScaleZ);
        
        // Calculate final dimensions for logging
        const finalDimensions = {
          width: originalWidth * validX,
          height: originalHeight * validY,
          depth: originalDepth * validZ
        };
        
        // Log dimensions in both units
        console.log('Final dimensions (mm):', {
          width: finalDimensions.width.toFixed(2),
          height: finalDimensions.height.toFixed(2),
          depth: finalDimensions.depth.toFixed(2)
        });
        
        console.log('Final dimensions (inches):', {
          width: (finalDimensions.width / MM_PER_INCH).toFixed(3),
          height: (finalDimensions.height / MM_PER_INCH).toFixed(3),
          depth: (finalDimensions.depth / MM_PER_INCH).toFixed(3)
        });
      }
      
      // Set the new scale
      mesh.scale.set(validX, validY, validZ);
      mesh.updateMatrix();
      
      // Render to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after scale change
      get().saveHistoryState();
    },
    
    // Reset the selected model to its original transform
    resetTransform: () => {
      const { selectedModelIndex, models, clearSnapIndicators } = get();
      
      if (selectedModelIndex !== null) {
        const model = models[selectedModelIndex];
        model.mesh.position.copy(model.originalPosition);
        model.mesh.rotation.copy(model.originalRotation);
        model.mesh.scale.copy(model.originalScale);
        
        clearSnapIndicators();
        get().saveHistoryState();
      }
    },
    
    // Perform CSG operations between selected and secondary models
    performCSGOperation: async (operationType: 'union' | 'subtract' | 'intersect') => {
      const state = get();
      const { selectedModelIndex, secondaryModelIndex, models, scene } = state;
      
      // Set loading state
      set({ isCSGOperationLoading: true });
      
      // Add progress tracking system
      const reportProgress = (stage: string, percent: number) => {
        console.log(`Boolean operation progress: ${stage} - ${percent.toFixed(1)}%`);
      };
      
      try {
        if (selectedModelIndex === null) {
          throw new Error("Primary model not selected for boolean operation");
        }
        
        if (secondaryModelIndex === null) {
          throw new Error("Secondary model not selected for boolean operation");
        }
        
        // Get the models
        const modelA = models[selectedModelIndex];
        const modelB = models[secondaryModelIndex];
        
        console.log(`Performing CSG ${operationType} between models:`, modelA.name, modelB.name);
        
        // Create working copies of meshes
        const meshA = modelA.mesh.clone();
        const meshB = modelB.mesh.clone();
        
        // Apply world matrices to transform geometries into world space
        meshA.updateWorldMatrix(true, false);
        meshB.updateWorldMatrix(true, false);
        
        // Clone and transform geometries
        const geomA = modelA.mesh.geometry.clone();
        const geomB = modelB.mesh.geometry.clone();
        
        geomA.applyMatrix4(meshA.matrixWorld);
        geomB.applyMatrix4(meshB.matrixWorld);
        
        // Ensure geometries are manifold (watertight)
        const processedGeomA = ensureManifoldGeometry(geomA);
        const processedGeomB = ensureManifoldGeometry(geomB);
        
        // Pre-processing feedback
        console.log("Pre-processed geometries:", {
          meshA: { 
            original: geomA.attributes.position.count,
            processed: processedGeomA.attributes.position.count 
          },
          meshB: { 
            original: geomB.attributes.position.count,
            processed: processedGeomB.attributes.position.count
          }
        });
        
        // Create temporary meshes with material configuration suitable for CSG
        const tempMeshA = new THREE.Mesh(
          processedGeomA,
          new THREE.MeshStandardMaterial({
            color: meshA.material instanceof THREE.Material ? 
                  (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
                  (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
            side: THREE.DoubleSide
          })
        );
        
        const tempMeshB = new THREE.Mesh(
          processedGeomB,
          new THREE.MeshStandardMaterial({
            color: meshB.material instanceof THREE.Material ? 
                  (meshB.material as THREE.MeshStandardMaterial).color.clone() : 
                  (meshB.material[0] as THREE.MeshStandardMaterial).color.clone(),
            side: THREE.DoubleSide
          })
        );
        
        // Reset positions since transforms are now baked into the geometry
        tempMeshA.position.set(0, 0, 0);
        tempMeshA.rotation.set(0, 0, 0);
        tempMeshA.scale.set(1, 1, 1);
        tempMeshB.position.set(0, 0, 0);
        tempMeshB.rotation.set(0, 0, 0);
        tempMeshB.scale.set(1, 1, 1);
        
        // Add a small delay to allow the UI to show loading state
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Perform the operation based on type
        let resultMesh: THREE.Mesh;
        let operationSucceeded = false;
        let errorMessage = "";
        
        // Try different approaches, starting with the most reliable for each operation type
        try {
          if (operationType === 'union') {
            // For union operations, try the new robust approach first
            try {
              console.log("Attempting robust union for complex meshes");
              resultMesh = robustMeshUnion(tempMeshA, tempMeshB);
              operationSucceeded = true;
              console.log("Robust union successful");
            } catch (e) {
              console.warn("Robust union approach failed, trying CSG union as final fallback", e);
              
              // Final CSG fallback
              try {
                resultMesh = CSG.union(tempMeshA, tempMeshB);
                operationSucceeded = true;
                console.log("Union via CSG fallback successful");
              } catch (csgError: any) {
                throw new Error(`Union operation failed: ${csgError.message}`);
              }
            }
          } else if (operationType === 'subtract') {
            // For subtract operations, try multiple approaches
            try {
              console.log("Attempting optimized subtraction for complex meshes");
              
              // First try: Standard CSG subtraction
              try {
                console.log("Performing standard CSG subtraction");
                resultMesh = CSG.subtract(tempMeshA, tempMeshB);
                operationSucceeded = true;
                console.log("Standard subtraction successful");
              } catch (e) {
                console.warn("Standard subtraction failed, trying with simplified geometries", e);
                
                // Second try: Simplify geometries before subtraction
                const simplifyThreshold = 0.01; // Simplification factor
                const altGeomA = simplifyGeometry(processedGeomA, simplifyThreshold);
                const altGeomB = simplifyGeometry(processedGeomB, simplifyThreshold);
                
                const altMeshA = new THREE.Mesh(
                  altGeomA,
                  new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
                );
                
                const altMeshB = new THREE.Mesh(
                  altGeomB,
                  new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
                );
                
                try {
                  resultMesh = CSG.subtract(altMeshA, altMeshB);
                  operationSucceeded = true;
                  console.log("Subtraction with simplified geometries successful");
                } catch (altError: any) {
                  // Final attempt with basic material and different settings
                  console.warn("Simplified subtraction failed, trying final approach", altError);
                  
                  const finalGeomA = ensureManifoldGeometry(meshA.geometry.clone().applyMatrix4(meshA.matrixWorld));
                  const finalGeomB = ensureManifoldGeometry(meshB.geometry.clone().applyMatrix4(meshB.matrixWorld));
                  
                  const finalMeshA = new THREE.Mesh(
                    finalGeomA,
                    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
                  );
                  
                  const finalMeshB = new THREE.Mesh(
                    finalGeomB,
                    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
                  );
                  
                  // Reset transforms as they're baked into geometry
                  finalMeshA.position.set(0, 0, 0);
                  finalMeshA.rotation.set(0, 0, 0);
                  finalMeshA.scale.set(1, 1, 1);
                  finalMeshB.position.set(0, 0, 0);
                  finalMeshB.rotation.set(0, 0, 0);
                  finalMeshB.scale.set(1, 1, 1);
                  
                  resultMesh = CSG.subtract(finalMeshA, finalMeshB);
                  operationSucceeded = true;
                  console.log("Final subtraction approach successful");
                }
              }
            } catch (error: any) {
              throw new Error(`Subtraction operation failed: ${error.message}`);
            }
          } else if (operationType === 'intersect') {
            // For intersect operations, try multiple approaches
            try {
              console.log("Attempting optimized intersection for complex meshes");
              
              // First try: Standard CSG intersection
              try {
                console.log("Performing standard CSG intersection");
                resultMesh = CSG.intersect(tempMeshA, tempMeshB);
                operationSucceeded = true;
                console.log("Standard intersection successful");
              } catch (e) {
                console.warn("Standard intersection failed, trying with simplified geometries", e);
                
                // Second try: Simplify geometries before intersection
                const simplifyThreshold = 0.01; // Simplification factor
                const altGeomA = simplifyGeometry(processedGeomA, simplifyThreshold);
                const altGeomB = simplifyGeometry(processedGeomB, simplifyThreshold);
                
                const altMeshA = new THREE.Mesh(
                  altGeomA,
                  new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
                );
                
                const altMeshB = new THREE.Mesh(
                  altGeomB,
                  new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
                );
                
                try {
                  resultMesh = CSG.intersect(altMeshA, altMeshB);
                  operationSucceeded = true;
                  console.log("Intersection with simplified geometries successful");
                } catch (altError: any) {
                  // Final attempt with basic material and different settings
                  console.warn("Simplified intersection failed, trying final approach", altError);
                  
                  const finalGeomA = ensureManifoldGeometry(meshA.geometry.clone().applyMatrix4(meshA.matrixWorld));
                  const finalGeomB = ensureManifoldGeometry(meshB.geometry.clone().applyMatrix4(meshB.matrixWorld));
                  
                  const finalMeshA = new THREE.Mesh(
                    finalGeomA,
                    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
                  );
                  
                  const finalMeshB = new THREE.Mesh(
                    finalGeomB,
                    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
                  );
                  
                  // Reset transforms as they're baked into geometry
                  finalMeshA.position.set(0, 0, 0);
                  finalMeshA.rotation.set(0, 0, 0);
                  finalMeshA.scale.set(1, 1, 1);
                  finalMeshB.position.set(0, 0, 0);
                  finalMeshB.rotation.set(0, 0, 0);
                  finalMeshB.scale.set(1, 1, 1);
                  
                  resultMesh = CSG.intersect(finalMeshA, finalMeshB);
                  operationSucceeded = true;
                  console.log("Final intersection approach successful");
                }
              }
            } catch (error: any) {
              throw new Error(`Intersection operation failed: ${error.message}`);
            }
          } else {
            throw new Error(`Unknown operation type: ${operationType}`);
          }
        } catch (error: any) {
          console.error("All CSG approaches failed:", error);
          errorMessage = error.message || "Operation failed";
          throw error;
        }
        
        // If we made it here, we have a result mesh
        if (!operationSucceeded || !resultMesh) {
          throw new Error(errorMessage || "Boolean operation failed with no specific error");
        }
        
        // Validate the result mesh
        if (!validateResultMesh(resultMesh)) {
          throw new Error("The boolean operation produced an invalid mesh. Try with simpler models or a different operation.");
        }
        
        // Post-process the result geometry
        if (resultMesh.geometry) {
          console.log("Post-processing result geometry");
          
          try {
            // Compute normals for proper lighting
            resultMesh.geometry.computeVertexNormals();
            
            // Update bounding info
            resultMesh.geometry.computeBoundingBox();
            resultMesh.geometry.computeBoundingSphere();
            
            // For union operations, be careful with vertex merging
            if (operationType === 'union' && BufferGeometryUtils.mergeVertices) {
              // Use a small tolerance to avoid losing detail
              resultMesh.geometry = BufferGeometryUtils.mergeVertices(resultMesh.geometry, 0.0001);
            }
            
            console.log("Final result vertices:", resultMesh.geometry.attributes.position.count);
          } catch (e) {
            console.warn("Error during result post-processing:", e);
            // Still continue with the operation
          }
        }
        
        // Setup final material properties
        const material = new THREE.MeshStandardMaterial({
          color: meshA.material instanceof THREE.Material ? 
                 (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
                 (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
          metalness: 0.1,
          roughness: 0.8,
          side: THREE.DoubleSide,
          flatShading: false
        });
        
        resultMesh.material = material;
        resultMesh.castShadow = true;
        resultMesh.receiveShadow = true;
        
        // Remove the original models from the scene
        scene.remove(modelA.mesh);
        scene.remove(modelB.mesh);
        
        // Add the result to the scene
        scene.add(resultMesh);
        
        // Create a new model for the result
        const newModel: Model = {
          id: `csg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: `${operationType}_${modelA.name}_${modelB.name}`,
          type: 'model',
          mesh: resultMesh,
          originalPosition: resultMesh.position.clone(),
          originalRotation: resultMesh.rotation.clone(),
          originalScale: resultMesh.scale.clone()
        };
        
        // Update models array: remove the two used models and add the result
        const updatedModels = models.filter((_, i) => i !== selectedModelIndex && i !== secondaryModelIndex);
        updatedModels.push(newModel);
        
        // Update state
        set({ 
          models: updatedModels,
          selectedModelIndex: updatedModels.length - 1, // Select the new model
          secondaryModelIndex: null, // Reset secondary selection
          isCSGOperationLoading: false
        });
        
        console.log(`CSG operation successful, created: ${newModel.name}`);
        
        // Render to show changes
        state.renderer.render(state.scene, state.camera);
        
        // Save history state after CSG operation
        get().saveHistoryState();
        
      } catch (error) {
        console.error(`Error during CSG ${operationType} operation:`, error);
        set({ isCSGOperationLoading: false });
        
        // Create a user-friendly error message
        let userErrorMessage = `The ${operationType} operation failed.`;
        
        if (error && typeof error === 'object' && 'message' in error) {
          const errorMessage = error.message as string;
          if (errorMessage.includes("non-manifold") || errorMessage.includes("watertight")) {
            userErrorMessage += " The models have gaps or overlaps that prevent a clean operation.";
          } else if (errorMessage.includes("intersect") || errorMessage.includes("overlap")) {
            userErrorMessage += " The models don't intersect properly.";
          } else if (errorMessage.includes("complex")) {
            userErrorMessage += " The models are too complex for this operation.";
          }
        }
        
        userErrorMessage += " Try repositioning the models or using simpler shapes.";
        
        throw new Error(userErrorMessage);
      }
    },
    
    // Save the current state to history
    saveHistoryState: () => {
      const { models, selectedModelIndex, history, currentHistoryIndex } = get();
      
      // Create a deep clone of the models array for history
      const modelsCopy: Model[] = models.map(model => {
        // Create a clone of the mesh
        const meshClone = model.mesh.clone(false); // false means don't clone children
        
        // Clone materials properly
        if (Array.isArray(model.mesh.material)) {
          meshClone.material = model.mesh.material.map(mat => mat.clone());
        } else if (model.mesh.material) {
          meshClone.material = (model.mesh.material as THREE.Material).clone();
        }
        
        return {
          id: model.id,
          name: model.name,
          type: model.type,
          mesh: meshClone,
          originalPosition: model.originalPosition.clone(),
          originalRotation: model.originalRotation.clone(),
          originalScale: model.originalScale.clone()
        };
      });
      
      // Create the history record
      const newRecord: HistoryRecord = {
        models: modelsCopy,
        selectedModelIndex
      };
      
      // If we're in the middle of the history and perform a new action,
      // we need to truncate the history after the current index
      if (currentHistoryIndex < history.length - 1) {
        const newHistory = history.slice(0, currentHistoryIndex + 1);
        newHistory.push(newRecord);
        
        set({
          history: newHistory,
          currentHistoryIndex: newHistory.length - 1,
          canUndo: newHistory.length > 1,
          canRedo: false
        });
      } else {
        // Otherwise just append to history
        const newHistory = [...history, newRecord];
        
        // Cap history at 30 steps to avoid memory issues
        if (newHistory.length > 30) {
          newHistory.shift();
        }
        
        set({
          history: newHistory,
          currentHistoryIndex: newHistory.length - 1,
          canUndo: newHistory.length > 1,
          canRedo: false
        });
      }
      
      console.log(`Saved history state. History length: ${get().history.length}, Current index: ${get().currentHistoryIndex}`);
    },
    
    // Undo the last operation
    undo: () => {
      const { history, currentHistoryIndex, scene, renderer, camera } = get();
      
      if (currentHistoryIndex <= 0) {
        console.warn("Cannot undo: at the beginning of history");
        return;
      }
      
      // Move back in history
      const newIndex = currentHistoryIndex - 1;
      const targetState = history[newIndex];
      
      // Clear current models from scene
      get().models.forEach(model => {
        scene.remove(model.mesh);
      });
      
      // Add models from history state to the scene
      // These are clones in history, so we need to clone them again to avoid modifying history
      const restoredModels: Model[] = targetState.models.map(historyModel => {
        const restoredGeometry = (historyModel.mesh.geometry as THREE.BufferGeometry).clone();
        
        // Clone materials
        let restoredMaterial: THREE.Material | THREE.Material[];
        if (Array.isArray(historyModel.mesh.material)) {
          restoredMaterial = historyModel.mesh.material.map(mat => mat.clone());
        } else {
          restoredMaterial = (historyModel.mesh.material as THREE.Material).clone();
        }
        
        // Create the restored mesh
        const restoredMesh = new THREE.Mesh(restoredGeometry, restoredMaterial);
        
        // Copy transform properties
        restoredMesh.position.copy(historyModel.mesh.position);
        restoredMesh.rotation.copy(historyModel.mesh.rotation);
        restoredMesh.scale.copy(historyModel.mesh.scale);
        
        // Ensure casting shadows
        restoredMesh.castShadow = true;
        restoredMesh.receiveShadow = true;
        
        // Add to scene
        scene.add(restoredMesh);
        
        return {
          id: historyModel.id,
          name: historyModel.name,
          type: historyModel.type,
          mesh: restoredMesh,
          originalPosition: historyModel.originalPosition.clone(),
          originalRotation: historyModel.originalRotation.clone(),
          originalScale: historyModel.originalScale.clone()
        };
      });
      
      // Update state
      set({
        models: restoredModels,
        selectedModelIndex: targetState.selectedModelIndex,
        currentHistoryIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true
      });
      
      // Reapply highlighting to the selected model
      if (targetState.selectedModelIndex !== null) {
        const selectedModel = restoredModels[targetState.selectedModelIndex];
        if (selectedModel) {
          const material = selectedModel.mesh.material as THREE.MeshStandardMaterial;
          material.emissive.set(0x444444);
        }
      }
      
      // Force a render
      renderer.render(scene, camera);
      
      console.log(`Undo to history index ${newIndex}. Can undo: ${newIndex > 0}, Can redo: true`);
    },
    
    // Redo the last undone operation
    redo: () => {
      const { history, currentHistoryIndex, scene, renderer, camera } = get();
      
      if (currentHistoryIndex >= history.length - 1) {
        console.warn("Cannot redo: at the end of history");
        return;
      }
      
      // Move forward in history
      const newIndex = currentHistoryIndex + 1;
      const targetState = history[newIndex];
      
      // Clear current models from scene
      get().models.forEach(model => {
        scene.remove(model.mesh);
      });
      
      // Add models from history state to the scene
      const restoredModels: Model[] = targetState.models.map(historyModel => {
        const restoredGeometry = (historyModel.mesh.geometry as THREE.BufferGeometry).clone();
        
        // Clone materials
        let restoredMaterial: THREE.Material | THREE.Material[];
        if (Array.isArray(historyModel.mesh.material)) {
          restoredMaterial = historyModel.mesh.material.map(mat => mat.clone());
        } else {
          restoredMaterial = (historyModel.mesh.material as THREE.Material).clone();
        }
        
        // Create the restored mesh
        const restoredMesh = new THREE.Mesh(restoredGeometry, restoredMaterial);
        
        // Copy transform properties
        restoredMesh.position.copy(historyModel.mesh.position);
        restoredMesh.rotation.copy(historyModel.mesh.rotation);
        restoredMesh.scale.copy(historyModel.mesh.scale);
        
        // Ensure casting shadows
        restoredMesh.castShadow = true;
        restoredMesh.receiveShadow = true;
        
        // Add to scene
        scene.add(restoredMesh);
        
        return {
          id: historyModel.id,
          name: historyModel.name,
          type: historyModel.type,
          mesh: restoredMesh,
          originalPosition: historyModel.originalPosition.clone(),
          originalRotation: historyModel.originalRotation.clone(),
          originalScale: historyModel.originalScale.clone()
        };
      });
      
      // Update state
      set({
        models: restoredModels,
        selectedModelIndex: targetState.selectedModelIndex,
        currentHistoryIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < history.length - 1
      });
      
      // Reapply highlighting to the selected model
      if (targetState.selectedModelIndex !== null) {
        const selectedModel = restoredModels[targetState.selectedModelIndex];
        if (selectedModel) {
          const material = selectedModel.mesh.material as THREE.MeshStandardMaterial;
          material.emissive.set(0x444444);
        }
      }
      
      // Force a render
      renderer.render(scene, camera);
      
      console.log(`Redo to history index ${newIndex}. Can undo: true, Can redo: ${newIndex < history.length - 1}`);
    },
    
    // Export the selected model as STL
    exportSelectedModelAsSTL: () => {
      const { selectedModelIndex, models } = get();
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for export");
        return null;
      }
      
      try {
        const selectedModel = models[selectedModelIndex];
        
        // Clone the mesh to preserve the original
        const meshToExport = selectedModel.mesh.clone();
        
        // Create an STL exporter
        const exporter = new STLExporter();
        
        // Export the model as STL binary format
        const result = exporter.parse(meshToExport, { binary: true });
        
        // Create a blob from the result
        const blob = new Blob([result], { type: result instanceof Uint8Array ? 'application/octet-stream' : 'text/plain' });
        
        // Return the blob
        return blob;
        
      } catch (error) {
        console.error("Error exporting STL:", error);
        throw new Error("Failed to export STL file");
      }
    },
    
    // Toggle snap on/off
    toggleSnap: () => {
      const { snapSettings, clearSnapIndicators } = get();
      
      // Toggle the enabled state
      const newEnabledState = !snapSettings.enabled;
      
      set({
        snapSettings: {
          ...snapSettings,
          enabled: newEnabledState
        }
      });
      
      // If turning off snap mode, clear indicators
      if (!newEnabledState) {
        clearSnapIndicators();
      }
      
      console.log(`Snap mode ${newEnabledState ? 'enabled' : 'disabled'}`);
    },
    
    // Update snap settings
    updateSnapSettings: (settings: Partial<SnapSettings>) => {
      const { snapSettings } = get();
      set({ 
        snapSettings: { 
          ...snapSettings, 
          ...settings
        } 
      });
      console.log("Updated snap settings:", { ...snapSettings, ...settings });
    },
    
    // Clear snap indicators
    clearSnapIndicators: () => {
      const { scene, snapIndicators } = get();
      
      // Remove all existing snap indicators from the scene
      snapIndicators.forEach(indicator => {
        scene.remove(indicator);
      });
      
      set({ snapIndicators: [] });
    },

    // View options
    setCameraView: (view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric') => {
      const { renderingMode } = get();
      set({ cameraView: view });
      
      // Make sure we re-apply the current rendering mode after camera view change
      // This prevents the camera view change from affecting the rendering mode
      setTimeout(() => {
        const { models, scene, camera, renderer, selectedModelIndex, secondaryModelIndex } = get();
        
        // Re-apply rendering mode to ensure consistency
        models.forEach(model => {
          // Call updateModelMaterial with force=true to ensure the rendering mode is correctly applied
          updateModelMaterial(model.mesh, renderingMode);
        });
        
        // Re-apply selection highlights if needed
        if (selectedModelIndex !== null && models[selectedModelIndex]) {
          const selectedModel = models[selectedModelIndex];
          if (selectedModel.mesh.material instanceof THREE.MeshStandardMaterial || 
              selectedModel.mesh.material instanceof THREE.MeshPhysicalMaterial) {
            selectedModel.mesh.material.emissive.set(0x222222);
          }
        }
        
        if (secondaryModelIndex !== null && models[secondaryModelIndex]) {
          const secondaryModel = models[secondaryModelIndex];
          if (secondaryModel.mesh.material instanceof THREE.MeshStandardMaterial || 
              secondaryModel.mesh.material instanceof THREE.MeshPhysicalMaterial) {
            secondaryModel.mesh.material.emissive.set(0x004444);
          }
        }
        
        // Force a render to apply changes
        if (renderer && camera) {
          renderer.render(scene, camera);
          console.log(`Reapplied rendering mode '${renderingMode}' after camera view change to: ${view}`);
        }
      }, 50); // Small delay to ensure camera position is updated first
      
      console.log(`Camera view set to: ${view}`);
    },
    setShowGrid: (show: boolean) => {
      const state = get();
      set({ showGrid: show });
      
      // Update the grid helper visibility
      const gridHelper = state.scene.children.find(child => child.name === 'gridHelper');
      if (gridHelper) {
        gridHelper.visible = show;
      }
      
      console.log(`Grid visibility set to: ${show}`);
    },
    setShowAxes: (show: boolean) => {
      const state = get();
      set({ showAxes: show });
      
      // Update the axes helper visibility
      const axesHelper = state.scene.children.find(child => child.name === 'axesHelper');
      if (axesHelper) {
        axesHelper.visible = show;
      }
      
      console.log(`Axes visibility set to: ${show}`);
    },

    // Add function to set rendering mode
    setRenderingMode: (mode: 'standard' | 'wireframe' | 'realistic' | 'xray') => {
      const prevMode = get().renderingMode;
      set({ renderingMode: mode });
      
      console.log(`Changing rendering mode from ${prevMode} to ${mode}`);
      
      // Update all models with the new rendering mode
      const { models, scene, camera, renderer, selectedModelIndex, secondaryModelIndex } = get();
      
      // Apply new rendering mode to all models
      models.forEach(model => {
        updateModelMaterial(model.mesh, mode);
      });
      
      // Re-apply selection highlights if needed
      if (selectedModelIndex !== null && models[selectedModelIndex]) {
        const selectedModel = models[selectedModelIndex];
        if (mode !== 'wireframe' && mode !== 'xray') {
          if (selectedModel.mesh.material instanceof THREE.MeshStandardMaterial || 
              selectedModel.mesh.material instanceof THREE.MeshPhysicalMaterial) {
            selectedModel.mesh.material.emissive.set(0x222222);
          }
        }
      }
      
      // Re-apply secondary selection highlights if needed
      if (secondaryModelIndex !== null && models[secondaryModelIndex]) {
        const secondaryModel = models[secondaryModelIndex];
        if (mode !== 'wireframe' && mode !== 'xray') {
          if (secondaryModel.mesh.material instanceof THREE.MeshStandardMaterial || 
              secondaryModel.mesh.material instanceof THREE.MeshPhysicalMaterial) {
            secondaryModel.mesh.material.emissive.set(0x004444);
          }
        }
      }
      
      // Force re-render
      if (renderer && camera) {
        console.log(`Rendering mode changed to: ${mode}, forcing re-render`);
        renderer.render(scene, camera);
      }
    },

    // Load an SVG file and convert to 3D by extruding
    loadSVG: async (file: File | string, extrudeDepth = 2) => {
      const state = get();
      
      try {
        // Create a URL for the file
        let url: string;
        if (typeof file === 'string') {
          // If file is already a URL string, use it directly
          url = file;
        } else {
          // Otherwise create a URL from the File object
          url = URL.createObjectURL(file);
        }
        
        // Load the SVG
        const loader = new SVGLoader();
        const svgData = await loader.loadAsync(url);
        
        // Clean up the URL if we created it from a File
        if (typeof file !== 'string') {
          URL.revokeObjectURL(url);
        }
        
        // Create a group to hold our shapes
        const group = new THREE.Group();
        
        // Create a material with a random color
          const material = new THREE.MeshStandardMaterial({ 
            color: getRandomColor(),
            side: THREE.DoubleSide,
          });
          
        // Extrusion settings with bevel for better 3D appearance
          const extrudeSettings = {
            depth: extrudeDepth,
          bevelEnabled: true,
          bevelThickness: 1,
          bevelSize: 1,
          bevelOffset: 0,
          bevelSegments: 3
          };
          
          // Process all paths in the SVG
          svgData.paths.forEach((path) => {
          // Convert all subpaths to shapes
            const shapes = path.toShapes(true);
            
            shapes.forEach((shape) => {
            // Ensure the shape is properly oriented for solid extrusion
            shape.autoClose = true;
            
            // Create holes array if the shape has holes
            const holes = [];
            if (shape.holes && shape.holes.length > 0) {
              shape.holes.forEach((hole) => {
                hole.autoClose = true;
                holes.push(hole);
              });
            }
            
            // Extrude the shape to create a solid 3D object
              const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            // Create mesh with the geometry
              const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
              group.add(mesh);
            });
          });
          
          // If no valid paths were found, throw an error
          if (group.children.length === 0) {
            throw new Error("No valid paths found in SVG");
          }
          
        // Combine all meshes into a single mesh for better performance
          const buffers: THREE.BufferGeometry[] = [];
          group.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              buffers.push(child.geometry.clone());
            }
          });
          
          // Use BufferGeometryUtils to merge geometries
        const mergedGeometry = BufferGeometryUtils.mergeGeometries(buffers);
        
        // Create the final mesh
        const finalMesh = new THREE.Mesh(mergedGeometry, material);
        finalMesh.castShadow = true;
        finalMesh.receiveShadow = true;
        
        // Center the model
        const box = new THREE.Box3().setFromObject(finalMesh);
        const center = box.getCenter(new THREE.Vector3());
        finalMesh.position.sub(center);
        finalMesh.position.y = extrudeDepth / 2; // Place on the grid
        
        // Fix the orientation for SVG models created from sketches
        if (typeof file !== 'string' && file.name.startsWith('sketch-')) {
          // Apply 180 degrees rotation around Z-axis to correct sketch orientation
          finalMesh.rotateZ(Math.PI);
        }
          
          // Store original transform
        const originalPosition = finalMesh.position.clone();
        const originalRotation = finalMesh.rotation.clone();
        const originalScale = finalMesh.scale.clone();
          
          // Add to scene
        state.scene.add(finalMesh);
          
          // Create model object
        const model: Model = {
          id: `svg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: typeof file === 'string' ? file.split('/').pop() || 'SVG from URL' : file.name,
          type: 'svg',
          mesh: finalMesh,
            originalPosition,
            originalRotation,
            originalScale
          };
          
          // Add to models array
        const updatedModels = [...state.models, model];
        set({ models: updatedModels });
          
          // Select the new model
        const newIndex = updatedModels.length - 1;
        state.selectModel(newIndex);
        
        // Save to history
        state.saveHistoryState();
      } catch (error) {
        console.error("Error loading SVG:", error);
        throw new Error("Failed to load SVG file");
      }
    },
    
    // Create 3D text
    loadText: async (text: string, options: TextOptions = { text }) => {
      const state = get();
      const loader = new FontLoader();
      const fontPath = options?.fontPath || defaultFontPath;

      if (!state.isSceneReady) {
        console.error("Scene not ready, can't create text");
        return;
      }
      
      try {
        const font = await new Promise<Font>((resolve, reject) => {
          loader.load(fontPath, resolve, undefined, reject);
        });
        
        // Set default size to 2 inches (50.8mm)
        const defaultSize = 50.8; // 2 inches in mm
        
        const textProps: TextProps = {
          text,
          fontSize: options?.fontSize || defaultSize,
          height: options?.height || defaultSize * 0.2, // 20% of size for depth
          curveSegments: options?.curveSegments || 12,
          bevelEnabled: options?.bevelEnabled ?? true,
          bevelThickness: options?.bevelThickness || defaultSize * 0.02, // 2% of size
          bevelSize: options?.bevelSize || defaultSize * 0.01, // 1% of size
          bevelSegments: options?.bevelSegments || 5,
          fontPath
        };
        
        // Create text geometry parameters
        const geometryParams: TextGeometryParameters = {
          font: font as any,
          size: textProps.fontSize,
          depth: textProps.height,
          curveSegments: textProps.curveSegments,
          bevelEnabled: textProps.bevelEnabled,
          bevelThickness: textProps.bevelThickness,
          bevelSize: textProps.bevelSize,
          bevelSegments: textProps.bevelSegments,
        };
        
        // Create text geometry
        const geometry = new TextGeometry(text, geometryParams);
        
        // Create material with specified or random color
        const material = new THREE.MeshStandardMaterial({ 
          color: options?.color || getRandomColor(),
          metalness: 0.1,
          roughness: 0.8,
        });
        
        // Center the geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        if (geometry.boundingBox) {
          geometry.boundingBox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);
        }
        
        // Show scaling dialog
        const dialogRoot = document.createElement('div');
        dialogRoot.id = 'scale-dialog-root';
        document.body.appendChild(dialogRoot);
        
        // Create a promise that resolves when scaling is complete
        const scale = await new Promise<THREE.Vector3>((resolve) => {
          const root = createRoot(dialogRoot);
          root.render(
            React.createElement(ImportScaleDialog, {
              isOpen: true,
              onClose: () => {
                root.unmount();
                dialogRoot.remove();
                resolve(new THREE.Vector3(1, 1, 1)); // Default scale if dialog is closed
              },
              geometry: geometry,
              onScale: (scale) => {
                root.unmount();
                dialogRoot.remove();
                resolve(scale);
              }
            })
          );
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Apply the chosen scale
        mesh.scale.copy(scale);
        
        // Position mesh slightly above the grid
        mesh.position.y = 0;
        
        // Store original transform
        const originalPosition = mesh.position.clone();
        const originalRotation = mesh.rotation.clone();
        const originalScale = mesh.scale.clone();
        
        // Add to scene
        scene.add(mesh);
        console.log("Added text mesh to scene:", mesh);
        
        // Create model object
        const newModel: Model = {
          id: `text-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: `Text: ${text.substring(0, 15)}${text.length > 15 ? '...' : ''}`,
          type: 'text',
          mesh,
          originalPosition,
          originalRotation,
          originalScale,
          textProps
        };
        
        // Add to models array
        const models = [...state.models, newModel];
        set({ models });
        
        // Update grid position
        get().updateGridPosition();
        
        // Select the new model
        const newIndex = models.length - 1;
        get().selectModel(newIndex);
        
        // Force a render
        state.renderer.render(state.scene, state.camera);
        
        // Save to history after adding a model
        get().saveHistoryState();
        
      } catch (error) {
        console.error("Error creating 3D text:", error);
        throw new Error("Failed to create 3D text");
      }
    },

    // Sync UI state with current model transforms
    syncTransformUIState: () => {
      const state = get();
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        return;
      }
      
      const model = models[selectedModelIndex];
      
      // This function doesn't need to do anything on its own
      // It will cause a component re-render which will update position/rotation/scale values
      // through the useEffect hooks in the TransformControls component
      
      // Force a render to update the scene
      if (state.renderer && state.camera) {
        state.renderer.render(state.scene, state.camera);
      }
      
      console.log("Synced transform UI state after gizmo transform");
    }
  };
});

// Add a property to the Window interface for TypeScript
declare global {
  interface Window {
    transformHistoryTimeout: number;
  }
}

// Helper function to merge geometries for the fallback union approach
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Create a new BufferGeometry to store the merged result
  const mergedGeometry = new THREE.BufferGeometry();
  
  // First, determine total counts
  let totalVertices = 0;
  let totalIndices = 0;
  
  geometries.forEach(geometry => {
    totalVertices += geometry.attributes.position.count;
    if (geometry.index) {
      totalIndices += geometry.index.count;
    } else {
      // If no indices, we'll create one triangle per 3 vertices
      totalIndices += geometry.attributes.position.count;
    }
  });
  
  // Create arrays to hold the merged data
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);
  
  let vertexOffset = 0;
  let indexOffset = 0;
  
  // Process each geometry
  geometries.forEach(geometry => {
    const positionAttribute = geometry.attributes.position;
    
    // Get position data - need to handle different ways of accessing the data
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      const z = positionAttribute.getZ(i);
      
      positions[vertexOffset * 3] = x;
      positions[vertexOffset * 3 + 1] = y;
      positions[vertexOffset * 3 + 2] = z;
      
      vertexOffset++;
    }
    
    // Ensure normals exist
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
    
    // Get normal data
    const normalAttribute = geometry.attributes.normal;
    const normalCount = normalAttribute.count;
    
    for (let i = 0; i < normalCount; i++) {
      const x = normalAttribute.getX(i);
      const y = normalAttribute.getY(i);
      const z = normalAttribute.getZ(i);
      
      // Calculate the target position in the normals array
      const targetIndex = (vertexOffset - normalCount + i) * 3;
      
      normals[targetIndex] = x;
      normals[targetIndex + 1] = y;
      normals[targetIndex + 2] = z;
    }
    
    // Handle indices - either copy existing or create sequential ones
    const indexBase = vertexOffset - positionAttribute.count;
    
    if (geometry.index) {
      // Copy existing indices with offset
      for (let i = 0; i < geometry.index.count; i++) {
        indices[indexOffset++] = geometry.index.getX(i) + indexBase;
      }
    } else {
      // Create sequential indices (assuming triangles)
      for (let i = 0; i < positionAttribute.count; i++) {
        indices[indexOffset++] = i + indexBase;
      }
    }
  });
  
  // Set up the attributes
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  
  // Compute bounds
  mergedGeometry.computeBoundingBox();
  mergedGeometry.computeBoundingSphere();
  
  return mergedGeometry;
}

// Helper function to snap a model's position based on snap settings
function snapModelPosition(modelIndex: number) {
  const state = useScene.getState();
  const { models, snapSettings, scene, clearSnapIndicators } = state;
  
  // Clear any previous snap indicators
  clearSnapIndicators();
  
  if (!snapSettings.enabled || modelIndex === null || !models[modelIndex]) {
    return;
  }
  
  const selectedModel = models[modelIndex];
  const selectedMesh = selectedModel.mesh;
  
  // Create a list to store potential snap points for visualization
  const potentialSnapPoints: { position: THREE.Vector3, distance: number }[] = [];
  
  // 1. Snap to grid if enabled
  if (snapSettings.snapToGrid) {
    // Snap position to grid
    selectedMesh.position.x = Math.round(selectedMesh.position.x / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
    selectedMesh.position.y = Math.round(selectedMesh.position.y / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
    selectedMesh.position.z = Math.round(selectedMesh.position.z / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
  }
  
  // Only check face/edge snapping if enabled and there are other models
  if ((snapSettings.snapToFaces || snapSettings.snapToEdges) && models.length > 1) {
    // Get the bounding box of the selected model
    selectedMesh.geometry.computeBoundingBox();
    if (!selectedMesh.geometry.boundingBox) {
      console.warn("Selected mesh has no bounding box, skipping snap");
      return;
    }
    
    const selectedBox = selectedMesh.geometry.boundingBox.clone();
    selectedBox.applyMatrix4(selectedMesh.matrixWorld);
    
    // Find closest snap point
    let closestDistance = snapSettings.snapThreshold;
    let closestSnapPoint = null;
    
    // Check against all other models
    models.forEach((otherModel, idx) => {
      if (idx === modelIndex) return; // Skip the model we're moving
      
      const otherMesh = otherModel.mesh;
      
      // Get the bounding box of the other model
      otherMesh.geometry.computeBoundingBox();
      if (!otherMesh.geometry.boundingBox) {
        return; // Skip this model if it has no bounding box
      }
      
      const otherBox = otherMesh.geometry.boundingBox.clone();
      otherBox.applyMatrix4(otherMesh.matrixWorld);
      
      // FACE SNAPPING
      if (snapSettings.snapToFaces) {
        // Check Y axis: bottom face of selected model with top face of other model
        const bottomDistance = Math.abs(selectedBox.min.y - otherBox.max.y);
        if (bottomDistance < snapSettings.snapThreshold) {
          if (boxesOverlapInPlane(selectedBox, otherBox, 'xz')) {
            const snapPoint = new THREE.Vector3(
              selectedMesh.position.x,
              otherBox.max.y + (selectedBox.min.y - selectedMesh.position.y),
              selectedMesh.position.z
            );
            
            potentialSnapPoints.push({ position: snapPoint, distance: bottomDistance });
            
            if (bottomDistance < closestDistance) {
              closestDistance = bottomDistance;
              closestSnapPoint = snapPoint;
            }
          }
        }
        
        // Check Y axis: top face of selected model with bottom face of other model
        const topDistance = Math.abs(selectedBox.max.y - otherBox.min.y);
        if (topDistance < snapSettings.snapThreshold) {
          if (boxesOverlapInPlane(selectedBox, otherBox, 'xz')) {
            const snapPoint = new THREE.Vector3(
              selectedMesh.position.x,
              otherBox.min.y - (selectedBox.max.y - selectedMesh.position.y),
              selectedMesh.position.z
            );
            
            potentialSnapPoints.push({ position: snapPoint, distance: topDistance });
            
            if (topDistance < closestDistance) {
              closestDistance = topDistance;
              closestSnapPoint = snapPoint;
            }
          }
        }
        
        // Check X axis: left face of selected model with right face of other model
        const leftDistance = Math.abs(selectedBox.min.x - otherBox.max.x);
        if (leftDistance < snapSettings.snapThreshold) {
          if (boxesOverlapInPlane(selectedBox, otherBox, 'yz')) {
            const snapPoint = new THREE.Vector3(
              otherBox.max.x + (selectedBox.min.x - selectedMesh.position.x),
              selectedMesh.position.y,
              selectedMesh.position.z
            );
            
            potentialSnapPoints.push({ position: snapPoint, distance: leftDistance });
            
            if (leftDistance < closestDistance) {
              closestDistance = leftDistance;
              closestSnapPoint = snapPoint;
            }
          }
        }
        
        // Check X axis: right face of selected model with left face of other model
        const rightDistance = Math.abs(selectedBox.max.x - otherBox.min.x);
        if (rightDistance < snapSettings.snapThreshold) {
          if (boxesOverlapInPlane(selectedBox, otherBox, 'yz')) {
            const snapPoint = new THREE.Vector3(
              otherBox.min.x - (selectedBox.max.x - selectedMesh.position.x),
              selectedMesh.position.y,
              selectedMesh.position.z
            );
            
            potentialSnapPoints.push({ position: snapPoint, distance: rightDistance });
            
            if (rightDistance < closestDistance) {
              closestDistance = rightDistance;
              closestSnapPoint = snapPoint;
            }
          }
        }
        
        // Check Z axis: front face of selected model with back face of other model
        const frontDistance = Math.abs(selectedBox.min.z - otherBox.max.z);
        if (frontDistance < snapSettings.snapThreshold) {
          if (boxesOverlapInPlane(selectedBox, otherBox, 'xy')) {
            const snapPoint = new THREE.Vector3(
              selectedMesh.position.x,
              selectedMesh.position.y,
              otherBox.max.z + (selectedBox.min.z - selectedMesh.position.z)
            );
            
            potentialSnapPoints.push({ position: snapPoint, distance: frontDistance });
            
            if (frontDistance < closestDistance) {
              closestDistance = frontDistance;
              closestSnapPoint = snapPoint;
            }
          }
        }
        
        // Check Z axis: back face of selected model with front face of other model
        const backDistance = Math.abs(selectedBox.max.z - otherBox.min.z);
        if (backDistance < snapSettings.snapThreshold) {
          if (boxesOverlapInPlane(selectedBox, otherBox, 'xy')) {
            const snapPoint = new THREE.Vector3(
              selectedMesh.position.x,
              selectedMesh.position.y,
              otherBox.min.z - (selectedBox.max.z - selectedMesh.position.z)
            );
            
            potentialSnapPoints.push({ position: snapPoint, distance: backDistance });
            
            if (backDistance < closestDistance) {
              closestDistance = backDistance;
              closestSnapPoint = snapPoint;
            }
          }
        }
      }
      
      // EDGE SNAPPING
      if (snapSettings.snapToEdges) {
        // For simplicity, we'll check a few common edge alignments
        // We consider edges as the lines where two faces meet
        
        // Bottom X edges alignment (bottom edge of selected aligned with top edge of other)
        if (Math.abs(selectedBox.min.y - otherBox.max.y) < closestDistance) {
          // Check if X edges overlap
          if (isLineOverlapping(
              selectedBox.min.x, selectedBox.max.x,
              otherBox.min.x, otherBox.max.x
          )) {
            const midX = (Math.max(selectedBox.min.x, otherBox.min.x) + 
                          Math.min(selectedBox.max.x, otherBox.max.x)) / 2;
            
            const offsetX = midX - selectedMesh.position.x;
            
            closestDistance = Math.abs(selectedBox.min.y - otherBox.max.y);
            closestSnapPoint = new THREE.Vector3(
              selectedMesh.position.x + offsetX,
              otherBox.max.y + (selectedBox.min.y - selectedMesh.position.y),
              selectedMesh.position.z
            );
          }
        }
        
        // Check for alignment in Z direction as well (similar to above)
        // This can be expanded for more edge alignment cases as needed
      }
    });
    
    // Create visual indicators for potential snap points
    const snapIndicators: THREE.Object3D[] = [];
    
    potentialSnapPoints.forEach(({ position, distance }) => {
      // Create a visual indicator for this snap point
      const geometry = new THREE.SphereGeometry(0.05, 16, 16);
      const material = new THREE.MeshBasicMaterial({ 
        color: distance === closestDistance ? 0x00ff00 : 0xffaa00,
        transparent: true,
        opacity: 0.7
      });
      const indicator = new THREE.Mesh(geometry, material);
      indicator.position.copy(position);
      
      // Add to scene and track it
      scene.add(indicator);
      snapIndicators.push(indicator);
    });
    
    // Update the state with the new indicators
    state.snapIndicators = snapIndicators;
    
    // Apply the snap if we found a good snap point
    if (closestSnapPoint) {
      console.log("Snapping to point, distance:", closestDistance);
      selectedMesh.position.copy(closestSnapPoint);
    }
  }
}

// Helper function to check if two boxes overlap in a specified plane
function boxesOverlapInPlane(box1: THREE.Box3, box2: THREE.Box3, plane: 'xy' | 'xz' | 'yz'): boolean {
  switch (plane) {
    case 'xy':
      return (
        box1.max.x > box2.min.x &&
        box1.min.x < box2.max.x &&
        box1.max.y > box2.min.y &&
        box1.min.y < box2.max.y
      );
    case 'xz':
      return (
        box1.max.x > box2.min.x &&
        box1.min.x < box2.max.x &&
        box1.max.z > box2.min.z &&
        box1.min.z < box2.max.z
      );
    case 'yz':
      return (
        box1.max.y > box2.min.y &&
        box1.min.y < box2.max.y &&
        box1.max.z > box2.min.z &&
        box1.min.z < box2.max.z
      );
  }
}

// Helper function to check if two lines overlap
function isLineOverlapping(min1: number, max1: number, min2: number, max2: number): boolean {
  return max1 >= min2 && max2 >= min1;
}

// Helper function to update model material based on rendering mode
function updateModelMaterial(mesh: THREE.Mesh, mode: 'standard' | 'wireframe' | 'realistic' | 'xray') {
  // Get the current color from the mesh's material
  let currentColor = new THREE.Color(0x3498db); // Default blue color
  
  // Try to get the color from the existing material if possible
  if (mesh.material instanceof THREE.MeshBasicMaterial || 
      mesh.material instanceof THREE.MeshStandardMaterial ||
      mesh.material instanceof THREE.MeshPhysicalMaterial) {
    currentColor = mesh.material.color;
  }
  
  // Check if the current material is highlighted (emissive)
  const isHighlighted = mesh.material instanceof THREE.MeshStandardMaterial || 
                        mesh.material instanceof THREE.MeshPhysicalMaterial 
                        ? (mesh.material.emissive && mesh.material.emissive.r > 0) 
                        : false;
  
  // Store the highlight state to restore after changing material
  const emissiveColor = isHighlighted ? new THREE.Color(0x222222) : new THREE.Color(0x000000);
  
  switch (mode) {
    case 'standard':
      if (!(mesh.material instanceof THREE.MeshStandardMaterial) || 
          mesh.material.wireframe) { // Check if it's currently wireframe
        const material = new THREE.MeshStandardMaterial({
          color: currentColor,
          roughness: 0.7,
          metalness: 0.2,
          emissive: emissiveColor // Preserve highlight state
        });
        mesh.material = material;
      } else if (isHighlighted) {
        // Just update the emissive to preserve highlight
        mesh.material.emissive = emissiveColor;
      }
      break;
      
    case 'wireframe':
      // Always recreate the wireframe material to ensure it stays wireframe
        const material = new THREE.MeshBasicMaterial({
          color: currentColor,
          wireframe: true
        });
        mesh.material = material;
      break;
      
    case 'realistic':
      if (!(mesh.material instanceof THREE.MeshPhysicalMaterial) || 
          (mesh.material instanceof THREE.MeshBasicMaterial && mesh.material.wireframe)) {
        const material = new THREE.MeshPhysicalMaterial({
          color: currentColor,
          roughness: 0.3,
          metalness: 0.8,
          clearcoat: 0.5,
          clearcoatRoughness: 0.2,
          reflectivity: 1,
          emissive: emissiveColor // Preserve highlight state
        });
        mesh.material = material;
      } else if (isHighlighted) {
        // Just update the emissive to preserve highlight
        mesh.material.emissive = emissiveColor;
      }
      break;
      
    case 'xray':
      if (!(mesh.material instanceof THREE.MeshBasicMaterial && mesh.material.transparent) || 
          (mesh.material instanceof THREE.MeshBasicMaterial && mesh.material.wireframe)) {
        const material = new THREE.MeshBasicMaterial({
          color: currentColor,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        });
        mesh.material = material;
      }
      break;
  }
}

// ... existing code ...
type TextProps = {
  text: string;
  fontSize: number;
  height: number;
  curveSegments: number;
  bevelEnabled: boolean;
  bevelThickness: number;
  bevelSize: number;
  bevelSegments: number;
  fontPath: string;
};

// Helper function to find a suitable position for a new model
const findSuitablePosition = (models: Model[], newModelSize: THREE.Vector3): THREE.Vector3 => {
  if (models.length === 0) {
    return new THREE.Vector3(0, 0, 0);
  }

  // Find the rightmost point of all models
  let maxX = -Infinity;
  models.forEach(model => {
    const box = new THREE.Box3().setFromObject(model.mesh);
    maxX = Math.max(maxX, box.max.x);
  });

  // Position the new model to the right of the rightmost model
  // Add a 50mm gap between models
  const newX = maxX + 50;
  return new THREE.Vector3(newX, 0, 0);
};

// Add this helper function at the top level, outside of the store definition
function ensureManifoldGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Clone the geometry to avoid modifying the original
  const processedGeometry = geometry.clone();
  
  try {
    // Ensure the geometry has computed attributes
    if (!processedGeometry.getAttribute('normal')) {
      processedGeometry.computeVertexNormals();
    }
    
    // Make sure we have a bounding box
    if (!processedGeometry.boundingBox) {
      processedGeometry.computeBoundingBox();
    }
    
    // Merge any duplicate vertices with a small tolerance
    if (BufferGeometryUtils.mergeVertices) {
      return BufferGeometryUtils.mergeVertices(processedGeometry, 0.0001);
    }
  } catch (error) {
    console.warn("Error preparing geometry:", error);
  }
  
  return processedGeometry;
}

// Add this helper function for robust mesh union operations
function robustMeshUnion(meshA: THREE.Mesh, meshB: THREE.Mesh): THREE.Mesh {
  console.log("Starting robust mesh union for complex geometries");
  
  // Strategy 1: Standard buffer geometry merge (fastest, but can fail with complex geometries)
  try {
    console.log("Trying standard geometry merge approach");
    const geomA = meshA.geometry.clone();
    const geomB = meshB.geometry.clone();
    
    // Apply world matrices
    meshA.updateWorldMatrix(true, false);
    meshB.updateWorldMatrix(true, false);
    geomA.applyMatrix4(meshA.matrixWorld);
    geomB.applyMatrix4(meshB.matrixWorld);
    
    // Clean geometries before merging
    const cleanGeomA = ensureManifoldGeometry(geomA);
    const cleanGeomB = ensureManifoldGeometry(geomB);
    
    const mergedGeometry = BufferGeometryUtils.mergeGeometries([cleanGeomA, cleanGeomB]);
    
    // Create result mesh with proper material
    const material = new THREE.MeshStandardMaterial({
      color: meshA.material instanceof THREE.Material ? 
            (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
            (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
      side: THREE.DoubleSide
    });
    
    return new THREE.Mesh(mergedGeometry, material);
  } catch (e) {
    console.warn("Standard geometry merge failed, trying octree-based approach", e);
  }
  
  // Strategy 2: Manual vertex processing
  try {
    console.log("Trying manual vertex processing approach");
    const geomA = meshA.geometry.clone();
    const geomB = meshB.geometry.clone();
    
    // Apply world transforms
    meshA.updateWorldMatrix(true, false);
    meshB.updateWorldMatrix(true, false);
    geomA.applyMatrix4(meshA.matrixWorld);
    geomB.applyMatrix4(meshB.matrixWorld);
    
    // Extract vertex and index data
    const posA = geomA.attributes.position.array;
    const posB = geomB.attributes.position.array;
    const idxA = geomA.index ? Array.from(geomA.index.array) : [];
    const idxB = geomB.index ? Array.from(geomB.index.array) : [];
    
    // Calculate offsets for the combined arrays
    const posACount = posA.length;
    const vertexACount = posACount / 3;
    
    // Create combined position array
    const combinedPos = new Float32Array(posA.length + posB.length);
    combinedPos.set(posA, 0);
    combinedPos.set(posB, posA.length);
    
    // Create combined index array, adjusting indices from B
    const combinedIdx = new Uint32Array(idxA.length + idxB.length);
    combinedIdx.set(idxA, 0);
    
    // Adjust indices from mesh B to account for combined array
    for (let i = 0; i < idxB.length; i++) {
      combinedIdx[idxA.length + i] = idxB[i] + vertexACount;
    }
    
    // Create new buffer geometry
    const combinedGeom = new THREE.BufferGeometry();
    combinedGeom.setAttribute('position', new THREE.BufferAttribute(combinedPos, 3));
    combinedGeom.setIndex(new THREE.BufferAttribute(combinedIdx, 1));
    
    // Generate normals and other attributes
    combinedGeom.computeVertexNormals();
    
    // Create material for the new mesh
    const material = new THREE.MeshStandardMaterial({
      color: meshA.material instanceof THREE.Material ? 
            (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
            (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
      side: THREE.DoubleSide
    });
    
    return new THREE.Mesh(combinedGeom, material);
  } catch (e) {
    console.warn("Manual vertex processing failed, trying final fallback", e);
  }
  
  // Strategy 3: CSG with adjusted parameters (slowest but most reliable)
  try {
    console.log("Trying CSG library with adjusted parameters");
    
    // Create clean copies for CSG operation
    const tempGeomA = meshA.geometry.clone();
    const tempGeomB = meshB.geometry.clone();
    
    // Apply world transforms
    meshA.updateWorldMatrix(true, false);
    meshB.updateWorldMatrix(true, false);
    tempGeomA.applyMatrix4(meshA.matrixWorld);
    tempGeomB.applyMatrix4(meshB.matrixWorld);
    
    // Create meshes with simpler material for CSG
    const tempMeshA = new THREE.Mesh(
      tempGeomA,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    
    const tempMeshB = new THREE.Mesh(
      tempGeomB,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    
    // Reset transforms since they're already applied to geometry
    tempMeshA.position.set(0, 0, 0);
    tempMeshA.rotation.set(0, 0, 0);
    tempMeshA.scale.set(1, 1, 1);
    tempMeshB.position.set(0, 0, 0);
    tempMeshB.rotation.set(0, 0, 0);
    tempMeshB.scale.set(1, 1, 1);
    
    // Perform CSG union with adjusted parameters
    const resultMesh = CSG.union(tempMeshA, tempMeshB);
    
    // Apply material
    const material = new THREE.MeshStandardMaterial({
      color: meshA.material instanceof THREE.Material ? 
            (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
            (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
      side: THREE.DoubleSide
    });
    
    resultMesh.material = material;
    return resultMesh;
  } catch (e: any) {
    console.error("All union strategies failed", e);
    throw new Error("Could not perform union operation on these complex meshes: " + e.message);
  }
}

// Add the simplifyGeometry helper function
function simplifyGeometry(geometry: THREE.BufferGeometry, threshold: number = 0.01): THREE.BufferGeometry {
  const simplified = geometry.clone();
  
  // If the geometry is very complex, skip attributes that aren't essential
  const position = simplified.getAttribute('position');
  if (position && position.count > 10000) {
    // For large geometries, only keep position, normal, and index
    const keepAttributes = ['position', 'normal'];
    
    // Remove non-essential attributes to reduce complexity
    for (const key in simplified.attributes) {
      if (!keepAttributes.includes(key)) {
        simplified.deleteAttribute(key);
      }
    }
  }

  if (simplified.index) {
    // Ensure we have proper vertex normals
    if (!simplified.getAttribute('normal')) {
      simplified.computeVertexNormals();
    }
    
    // Make sure we have a bounding box
    if (!simplified.boundingBox) {
      simplified.computeBoundingBox();
    }
    
    if (BufferGeometryUtils.mergeVertices) {
      return BufferGeometryUtils.mergeVertices(simplified, threshold);
    }
  }
  
  return simplified;
}

// Add a function to validate the result mesh after boolean operations
function validateResultMesh(mesh: THREE.Mesh): boolean {
  // Check if the mesh has a valid geometry
  if (!mesh.geometry) {
    console.error("Result mesh has no geometry");
    return false;
  }
  
  // Check if the geometry has vertices
  const position = mesh.geometry.attributes.position;
  if (!position || position.count === 0) {
    console.error("Result mesh has no vertices");
    return false;
  }
  
  // Check if the geometry has a valid bounding box
  if (!mesh.geometry.boundingBox) {
    try {
      mesh.geometry.computeBoundingBox();
    } catch (e) {
      console.error("Failed to compute bounding box for result mesh");
      return false;
    }
  }
  
  // Check if the geometry has face data (indices)
  if (!mesh.geometry.index || mesh.geometry.index.count === 0) {
    console.error("Result mesh has no face data");
    return false;
  }
  
  return true;
}

export {};