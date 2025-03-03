import { create } from "zustand";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSG } from 'three-csg-ts';
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry, TextGeometryParameters } from "three/examples/jsm/geometries/TextGeometry.js";

// Scene configuration
const GRID_SIZE = 100; // Increased from 50 to 100 to provide more workspace for 10-inch models
const BACKGROUND_COLOR = 0x333333; // Dark gray
const getRandomColor = () => new THREE.Color(Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5);

// Maximum model size in inches - set to exactly 10 inches
const MAX_SIZE_INCHES = 10; // Maximum dimension allowed for any model
const MM_PER_INCH = 25.4; // Standard conversion

// Helper constants for transformation
const TRANSFORM_STEP = 5.0; // Increased from 1.0 to 5.0 for much faster movement
const ROTATION_STEP = Math.PI / 18; // 10 degrees in radians
const SCALE_STEP = 0.2; // Increased from 0.1 to 0.2 for faster scaling (20% scale step)
const SNAP_THRESHOLD = 1.0; // Increased from 0.5 to 1.0 for larger models
const SNAP_GRID_SIZE = 2.0; // Increased from 1.0 to 2.0 for larger models

// Type for our 3D models
type Model = {
  id: string;
  name: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'text' | 'model' | 'torusknot' | 'octahedron' | 'icosahedron' | 'dodecahedron' | 'capsule' | 'pyramid';
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
  cameraView: 'top' | 'front' | 'side' | 'isometric';
  showGrid: boolean;
  showAxes: boolean;
  setCameraView: (view: 'top' | 'front' | 'side' | 'isometric') => void;
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
  loadSTL: (file: File) => Promise<void>;
  loadSVG: (file: File, extrudeDepth?: number) => Promise<void>;
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
    transformMode: "translate",

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
      
      // Initialize orbit controls
      const orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.minDistance = 5; // Allow closer zoom (was 5)
      orbitControls.maxDistance = 200; // Allow further zoom (was 100)
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.05;
      
      set({ orbitControls });
      
      // Add a grid helper and give it a name for later reference
      const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / 2);
      gridHelper.name = 'gridHelper';
      gridHelper.visible = get().showGrid;
      gridHelper.position.y = -1;
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
        // Only handle selection when not adjusting camera
        if (orbitControls.enabled) {
          const currentState = get();
          
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
    
    // Load an STL file
    loadSTL: async (file: File) => {
        const state = get();
      
      if (!state.isSceneReady) {
        console.error("Scene not ready, can't load model");
        return;
      }
      
      try {
        console.log("[MODEL IMPORT] Loading STL file:", file.name);
        const loader = new STLLoader();
        
        // Load the STL file
        const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
          const reader = new FileReader();
          
          reader.onload = (event) => {
            try {
              if (event.target?.result) {
                const result = event.target.result;
                const geometry = loader.parse(result as ArrayBuffer);
                resolve(geometry);
              } else {
                reject(new Error("Failed to read file"));
              }
            } catch (error) {
              reject(error);
            }
          };
          
          reader.onerror = () => reject(new Error("Error reading file"));
          reader.readAsArrayBuffer(file);
        });
        
        // Center the geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        if (geometry.boundingBox) {
          geometry.boundingBox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);
        }

        // IMPORTANT: Preserve the original dimensions of models
        // Calculate dimensions and report extensively
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        
        if (geometry.boundingSphere && geometry.boundingBox) {
          const radius = geometry.boundingSphere.radius;
          const size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          
          const width = size.x;
          const height = size.y;
          const depth = size.z;
          
          const inchWidth = width / MM_PER_INCH;
          const inchHeight = height / MM_PER_INCH;
          const inchDepth = depth / MM_PER_INCH;
          
          console.log(`[MODEL IMPORT] Original dimensions: ${width.toFixed(2)}mm × ${height.toFixed(2)}mm × ${depth.toFixed(2)}mm`);
          console.log(`[MODEL IMPORT] Original dimensions: ${inchWidth.toFixed(2)}in × ${inchHeight.toFixed(2)}in × ${inchDepth.toFixed(2)}in`);
          console.log(`[MODEL IMPORT] Radius: ${radius.toFixed(2)} units (${(radius/MM_PER_INCH).toFixed(2)} inches)`);
          
          // Calculate max dimension in inches
          const maxDimension = Math.max(inchWidth, inchHeight, inchDepth);
          console.log(`[MODEL IMPORT] Max dimension: ${maxDimension.toFixed(2)} inches`);
          
          // Only scale down extremely large models that would be difficult to work with
          // Use consistent scaling to preserve aspect ratio
          if (radius > 500) { 
            const scaleFactor = 100 / radius;
            geometry.scale(scaleFactor, scaleFactor, scaleFactor);
            
            // Report new dimensions after scaling
            geometry.computeBoundingBox();
            if (geometry.boundingBox) {
              const newSize = new THREE.Vector3();
              geometry.boundingBox.getSize(newSize);
              
              console.log(`[MODEL IMPORT] Very large model detected. Scaled down by factor: ${scaleFactor.toFixed(4)}`);
              console.log(`[MODEL IMPORT] New dimensions: ${newSize.x.toFixed(2)}mm × ${newSize.y.toFixed(2)}mm × ${newSize.z.toFixed(2)}mm`);
              console.log(`[MODEL IMPORT] New dimensions: ${(newSize.x/MM_PER_INCH).toFixed(2)}in × ${(newSize.y/MM_PER_INCH).toFixed(2)}in × ${(newSize.z/MM_PER_INCH).toFixed(2)}in`);
            }
          } else {
            // If our model is very small, scale it up to make it easier to see 
            // but still leave room to scale it more if needed
            if (maxDimension < 1.0) {
              // Scale up small models to be more visible but still under 5 inches
              const targetSize = 2.0; // Target 2 inches for the largest dimension
              const scaleFactor = (targetSize * MM_PER_INCH) / (maxDimension * MM_PER_INCH);
              
              geometry.scale(scaleFactor, scaleFactor, scaleFactor);
              
              console.log(`[MODEL IMPORT] Very small model detected. Scaled up by factor: ${scaleFactor.toFixed(4)}`);
              
              // Report new dimensions
              geometry.computeBoundingBox();
              if (geometry.boundingBox) {
                const newSize = new THREE.Vector3();
                geometry.boundingBox.getSize(newSize);
                
                console.log(`[MODEL IMPORT] New dimensions: ${newSize.x.toFixed(2)}mm × ${newSize.y.toFixed(2)}mm × ${newSize.z.toFixed(2)}mm`);
                console.log(`[MODEL IMPORT] New dimensions: ${(newSize.x/MM_PER_INCH).toFixed(2)}in × ${(newSize.y/MM_PER_INCH).toFixed(2)}in × ${(newSize.z/MM_PER_INCH).toFixed(2)}in`);
              }
            } else {
              console.log(`[MODEL IMPORT] Model within reasonable size range. No auto-scaling applied.`);
            }
          }
        }
        
        // Create material with random color
        const material = new THREE.MeshStandardMaterial({ 
          color: getRandomColor(),
          metalness: 0.1,
          roughness: 0.8,
          side: THREE.DoubleSide,
        });

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position mesh slightly above the grid
        mesh.position.y = 0;
        
        // Store original transform
        const originalPosition = mesh.position.clone();
        const originalRotation = mesh.rotation.clone();
        const originalScale = mesh.scale.clone();
        
        // Add to scene
        scene.add(mesh);
        console.log("[MODEL IMPORT] Added mesh to scene");
        
        // Create model object
        const newModel: Model = {
          id: `model-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: file.name,
          type: 'model',
          mesh,
          originalPosition,
          originalRotation,
          originalScale
        };
        
        // Add to models array
        const models = [...state.models, newModel];
        set({ models });
        
        // Select the new model
        const newIndex = models.length - 1;
        get().selectModel(newIndex);
        
        // Force a render
        state.renderer.render(state.scene, state.camera);
        
        // Save to history after adding a model
        get().saveHistoryState();
        
      } catch (error) {
        console.error("Error loading STL:", error);
        throw new Error("Failed to load STL file");
      }
    },

    // Remove a model
    removeModel: (index: number) => {
      const state = get();
      
      if (index < 0 || index >= state.models.length) {
        return;
      }
      
      // Remove from scene
      scene.remove(state.models[index].mesh);
      
      // Remove from models array
      const models = state.models.filter((_, i) => i !== index);
      
      // Update selected model
      let selectedModelIndex = state.selectedModelIndex;
      
      if (selectedModelIndex === index) {
        // If we're removing the selected model
        selectedModelIndex = null;
      } else if (selectedModelIndex !== null && selectedModelIndex > index) {
        // If we're removing a model before the selected one, decrement the index
        selectedModelIndex--;
      }
      
      set({ models, selectedModelIndex });
      
      // Force a render
      state.renderer.render(state.scene, state.camera);
      
      // Save to history after removing a model
      get().saveHistoryState();
    },
    
    // Select a model
    selectModel: (index: number | null) => {
      const { models, selectedModelIndex, clearSnapIndicators } = get();
      
      // If there was a previously selected model, reset its appearance
      if (selectedModelIndex !== null && models[selectedModelIndex]) {
        const model = models[selectedModelIndex];
        model.mesh.material = new THREE.MeshStandardMaterial({
          color: model.mesh.material instanceof THREE.MeshStandardMaterial 
            ? model.mesh.material.color 
            : new THREE.Color(0x888888),
          roughness: 0.7,
          metalness: 0.2
        });
      }
      
      // If selecting a new model, highlight it
      if (index !== null && models[index]) {
        const model = models[index];
        model.mesh.material = new THREE.MeshStandardMaterial({
          color: model.mesh.material instanceof THREE.MeshStandardMaterial 
            ? model.mesh.material.color 
            : new THREE.Color(0x888888),
          roughness: 0.3,
          metalness: 0.7,
          emissive: new THREE.Color(0x222222)
        });
      }
      
      // Reset highlighting on all models
      models.forEach(model => {
        if (model.mesh.material instanceof THREE.MeshStandardMaterial) {
          model.mesh.material.emissive.set(0x000000); // Reset emissive to black (no glow)
        }
      });
      
      // If selecting a model, highlight it
      if (index !== null && models[index]) {
        const selectedModel = models[index];
        
        // Highlight selected model with emissive glow
        if (selectedModel.mesh.material instanceof THREE.MeshStandardMaterial) {
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
          const material = model.mesh.material as THREE.MeshStandardMaterial;
          
          // Check if this is not the primary selected model
          if (model.mesh.userData.secondarySelected) {
            material.emissive.set(0x000000);
            model.mesh.userData.secondarySelected = false;
          }
        }
      });
      
      // Update secondary model index
      set({ secondaryModelIndex: index });
      
      // If selecting a secondary model, highlight it differently
      if (index !== null && state.models[index]) {
        const secondaryModel = state.models[index];
        
        // Highlight secondary model with a different emissive color
        const material = secondaryModel.mesh.material as THREE.MeshStandardMaterial;
        material.emissive.set(0x004444); // Teal-ish color
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
      
      // Ensure minimum scale
      const minScale = 0.01; // Smaller minimum scale for more flexibility
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
        
        // Log original dimensions for debugging
        console.log(`Original model dimensions (mm): ${originalWidth.toFixed(2)} × ${originalHeight.toFixed(2)} × ${originalDepth.toFixed(2)}`);
        console.log(`Original model dimensions (in): ${(originalWidth/MM_PER_INCH).toFixed(2)} × ${(originalHeight/MM_PER_INCH).toFixed(2)} × ${(originalDepth/MM_PER_INCH).toFixed(2)}`);
        
        // Convert max size to current unit (254mm for 10 inches)
        const maxSizeInMM = MAX_SIZE_INCHES * MM_PER_INCH;
        
        // Calculate maximum allowed scale for each dimension
        if (originalWidth > 0) {
          const maxScaleX = maxSizeInMM / originalWidth;
          if (validX > maxScaleX) {
            console.log(`X scale capped from ${validX.toFixed(2)} to ${maxScaleX.toFixed(2)} to respect 10-inch limit`);
            validX = maxScaleX;
          }
        }
        
        if (originalHeight > 0) {
          const maxScaleY = maxSizeInMM / originalHeight;
          if (validY > maxScaleY) {
            console.log(`Y scale capped from ${validY.toFixed(2)} to ${maxScaleY.toFixed(2)} to respect 10-inch limit`);
            validY = maxScaleY;
          }
        }
        
        if (originalDepth > 0) {
          const maxScaleZ = maxSizeInMM / originalDepth;
          if (validZ > maxScaleZ) {
            console.log(`Z scale capped from ${validZ.toFixed(2)} to ${maxScaleZ.toFixed(2)} to respect 10-inch limit`);
            validZ = maxScaleZ;
          }
        }
        
        // Calculate final dimensions after scaling
        const finalWidth = originalWidth * validX;
        const finalHeight = originalHeight * validY;
        const finalDepth = originalDepth * validZ;
        
        // Log final dimensions in both mm and inches for debugging
        console.log(`Final dimensions (mm): ${finalWidth.toFixed(2)} × ${finalHeight.toFixed(2)} × ${finalDepth.toFixed(2)}`);
        console.log(`Final dimensions (in): ${(finalWidth/MM_PER_INCH).toFixed(2)} × ${(finalHeight/MM_PER_INCH).toFixed(2)} × ${(finalDepth/MM_PER_INCH).toFixed(2)}`);
        
        // Check if any dimension is close to the maximum limit
        const tolerance = 0.1; // Add a small tolerance for floating point comparisons
        const atLimit = (
          (originalWidth > 0 && Math.abs(finalWidth - maxSizeInMM) < tolerance) || 
          (originalHeight > 0 && Math.abs(finalHeight - maxSizeInMM) < tolerance) || 
          (originalDepth > 0 && Math.abs(finalDepth - maxSizeInMM) < tolerance)
        );
          
        if (atLimit) {
          console.log(`At least one dimension is at the maximum ${MAX_SIZE_INCHES} inch (${maxSizeInMM.toFixed(2)} mm) limit`);
        }
      }
      
      // Set the new scale
      mesh.scale.set(validX, validY, validZ);
      
      // Update the matrix
      mesh.updateMatrix();
      
      console.log(`Set scale for model ${model.name}:`, { x: validX, y: validY, z: validZ });
      
      // Render to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after direct scale change
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
      const { selectedModelIndex, secondaryModelIndex, models } = state;
      
      // Set loading state
      set({ isCSGOperationLoading: true });
      
      try {
        if (selectedModelIndex === null) {
          console.warn("Primary model not selected for CSG operation");
          set({ isCSGOperationLoading: false });
          return;
        }
        
        if (secondaryModelIndex === null) {
          console.warn("Secondary model not selected for CSG operation");
          set({ isCSGOperationLoading: false });
          return;
        }
        
        // Get the models
        const modelA = models[selectedModelIndex];
        const modelB = models[secondaryModelIndex];
        
        console.log(`Performing CSG ${operationType} between models:`, modelA.name, modelB.name);
        
        // IMPROVED APPROACH: Treat models as solid objects
        // Step 1: Prepare geometries with proper transforms applied
        const meshA = modelA.mesh;
        const meshB = modelB.mesh;
        
        // Clone and apply transforms to geometries
        const geomA = modelA.mesh.geometry.clone();
        const geomB = modelB.mesh.geometry.clone();
        
        // Get world matrices
        meshA.updateWorldMatrix(true, false);
        meshB.updateWorldMatrix(true, false);
        
        // Apply world matrices to geometries
        geomA.applyMatrix4(meshA.matrixWorld);
        geomB.applyMatrix4(meshB.matrixWorld);
        
        // Step 2: Pre-process geometries to ensure they're manifold (watertight)
        console.log("Pre-processing geometries to ensure solid objects");
        
        // For union operations, we need to be especially careful with vertex merging
        // as it can cause faces to disappear. Use a smaller tolerance for unions.
        const mergeVertexTolerance = operationType === 'union' ? 0.0001 : 0.001;
        
        // Merge vertices to fix any tiny gaps or overlaps
        // @ts-ignore - mergeVertices exists but TypeScript doesn't know about it
        if (typeof geomA.mergeVertices === 'function') {
          // @ts-ignore
          geomA.mergeVertices(mergeVertexTolerance);
        }
        
        // @ts-ignore
        if (typeof geomB.mergeVertices === 'function') {
          // @ts-ignore
          geomB.mergeVertices(mergeVertexTolerance);
        }
        
        // Compute normals
        geomA.computeVertexNormals();
        geomB.computeVertexNormals();
        
        // Create new meshes with normalized transforms
        const csgMeshA = new THREE.Mesh(
          geomA,
          new THREE.MeshStandardMaterial({
            color: meshA.material instanceof THREE.Material ? 
                  (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
                  (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
            side: THREE.DoubleSide
          })
        );
        
        const csgMeshB = new THREE.Mesh(
          geomB,
          new THREE.MeshStandardMaterial({
            color: meshB.material instanceof THREE.Material ? 
                  (meshB.material as THREE.MeshStandardMaterial).color.clone() : 
                  (meshB.material[0] as THREE.MeshStandardMaterial).color.clone(),
            side: THREE.DoubleSide
          })
        );
        
        // Reset positions since transforms are now baked into the geometry
        csgMeshA.position.set(0, 0, 0);
        csgMeshA.rotation.set(0, 0, 0);
        csgMeshA.scale.set(1, 1, 1);
        csgMeshB.position.set(0, 0, 0);
        csgMeshB.rotation.set(0, 0, 0);
        csgMeshB.scale.set(1, 1, 1);
        
        // Add a small delay to allow the UI to show loading state
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log("Prepared meshes for CSG operation:", {
          meshA: { vertices: geomA.attributes.position.count },
          meshB: { vertices: geomB.attributes.position.count }
        });
        
        // Step 3: Perform CSG operation
        let resultMesh: THREE.Mesh;
        
        try {
          // For union operations, we'll use a direct geometry merging approach without CSG
          if (operationType === 'union') {
            console.log("Using direct geometry merging for union to preserve all faces");
            
            // Skip CSG entirely for union operations to preserve all faces including intersections
            const combinedGeometry = mergeGeometries([geomA, geomB]);
            
            // Keep original colors
            const material = new THREE.MeshStandardMaterial({
              color: meshA.material instanceof THREE.Material ? 
                    (meshA.material as THREE.MeshStandardMaterial).color.clone() : 
                    (meshA.material[0] as THREE.MeshStandardMaterial).color.clone(),
              side: THREE.DoubleSide
            });
            
            resultMesh = new THREE.Mesh(combinedGeometry, material);
            console.log("Created union by direct geometry merging, preserving all faces");
          } else {
            // For subtract and intersect, use the standard CSG approach
            switch(operationType) {
              case 'subtract':
                resultMesh = CSG.subtract(csgMeshA, csgMeshB);
                break;
              case 'intersect':
                resultMesh = CSG.intersect(csgMeshA, csgMeshB);
                break;
              default:
                throw new Error(`Unknown operation: ${operationType}`);
            }
          }
        } catch (error) {
          console.error("CSG operation failed:", error);
          throw new Error(`The CSG ${operationType} operation failed. The models may have complex geometry or non-manifold surfaces.`);
        }
        
        // Step 4: Process the result to ensure clean mesh
        console.log("Processing CSG result mesh...");
        
        if (resultMesh.geometry) {
          console.log("Original result vertices:", resultMesh.geometry.attributes.position.count);
          
          try {
            // For union operations, be more careful with vertex merging
            const vertexMergeTolerance = operationType === 'union' ? 0.0001 : 0.001;
            
            // Step 4.1: Merge vertices to clean up duplicate points
            // @ts-ignore
            if (typeof resultMesh.geometry.mergeVertices === 'function') {
              // @ts-ignore
              const verticesBefore = resultMesh.geometry.attributes.position.count;
              // @ts-ignore
              resultMesh.geometry.mergeVertices(vertexMergeTolerance);
              const verticesAfter = resultMesh.geometry.attributes.position.count;
              console.log(`Merged vertices: ${verticesBefore} → ${verticesAfter}`);
            }
            
            // Step 4.2: Compute normals for proper lighting
            resultMesh.geometry.computeVertexNormals();
            
            // Step 4.3: Update bounding info
            resultMesh.geometry.computeBoundingBox();
            resultMesh.geometry.computeBoundingSphere();
            
            console.log("Final result vertices:", resultMesh.geometry.attributes.position.count);
          } catch (e) {
            console.warn("Error during result processing:", e);
            resultMesh.geometry.computeVertexNormals();
          }
        }
        
        // Step 5: Setup material properties
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
        throw error;  // Re-throw to allow for UI error handling
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
    setCameraView: (view: 'top' | 'front' | 'side' | 'isometric') => {
      const state = get();
      set({ cameraView: view });
      console.log(`Camera view set to: ${view}`);
    },
    setShowGrid: (show: boolean) => {
      const state = get();
      set({ showGrid: show });
      console.log(`Grid visibility set to: ${show}`);
    },
    setShowAxes: (show: boolean) => {
      const state = get();
      set({ showAxes: show });
      console.log(`Axes visibility set to: ${show}`);
    },

    // Add function to set rendering mode
    setRenderingMode: (mode: 'standard' | 'wireframe' | 'realistic' | 'xray') => {
      set({ renderingMode: mode });
      
      // Update all models with the new rendering mode
      const { models, scene } = get();
      
      models.forEach(model => {
        updateModelMaterial(model.mesh, mode);
      });
      
      // Force re-render
      const { renderer, camera } = get();
      if (renderer && camera) {
        renderer.render(scene, camera);
      }
    },

    // Load an SVG file and convert to 3D by extruding
    loadSVG: async (file: File, extrudeDepth = 2) => {
      const state = get();
      
      if (!state.isSceneReady) {
        console.error("Scene not ready, can't load SVG");
        return;
      }
      
      try {
        console.log("Loading SVG file:", file.name, "with extrusion depth:", extrudeDepth);
        const loader = new SVGLoader();
        
        // Load the SVG file
        const svgData = await new Promise<SVGResult>((resolve, reject) => {
          const reader = new FileReader();
          
          reader.onload = (event) => {
            try {
              if (event.target?.result) {
                const result = event.target.result;
                const svgData = loader.parse(result as string);
                resolve(svgData as SVGResult);
              } else {
                reject(new Error("Failed to read SVG file"));
              }
            } catch (error) {
              reject(error);
            }
          };
          
          reader.onerror = () => reject(new Error("Error reading SVG file"));
          reader.readAsText(file);
        });
        
        // Create material with random color
        const material = new THREE.MeshStandardMaterial({ 
          color: getRandomColor(),
          metalness: 0.1,
          roughness: 0.8,
          side: THREE.DoubleSide,
        });
        
        // Create an empty geometry to merge all paths into
        const group = new THREE.Group();
        
        // Extrusion settings
        const extrudeSettings = {
          depth: extrudeDepth,
          bevelEnabled: false
        };
        
        // Process all paths in the SVG
        svgData.paths.forEach((path) => {
          const shapes = path.toShapes(true);
          
          shapes.forEach((shape) => {
            // Extrude the shape to create a 3D object
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const mesh = new THREE.Mesh(geometry, material);
            group.add(mesh);
          });
        });
        
        // If no valid paths were found, throw an error
        if (group.children.length === 0) {
          throw new Error("No valid paths found in SVG");
        }
        
        // Combine all meshes into a single mesh
        const buffers: THREE.BufferGeometry[] = [];
        group.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            buffers.push(child.geometry.clone());
          }
        });
        
        // Use BufferGeometryUtils to merge geometries
        let mergedGeometry: THREE.BufferGeometry;
        if (buffers.length === 1) {
          mergedGeometry = buffers[0];
        } else {
          // Create a manual merged geometry
          const meshesToMerge: THREE.Mesh[] = [];
          group.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              meshesToMerge.push(child);
            }
          });
          
          const finalGeometry = new THREE.BufferGeometry();
          let verticesArray: Float32Array[] = [];
          let normalsArray: Float32Array[] = [];
          let uvsArray: Float32Array[] = [];
          let indicesArray: number[][] = [];
          let vertexOffset = 0;
          
          meshesToMerge.forEach((mesh) => {
            const geo = mesh.geometry;
            const vertices = geo.attributes.position.array as Float32Array;
            const normals = geo.attributes.normal?.array as Float32Array;
            const uvs = geo.attributes.uv?.array as Float32Array;
            const indices = geo.index ? Array.from(geo.index.array) : [];
            
            verticesArray.push(vertices);
            if (normals) normalsArray.push(normals);
            if (uvs) uvsArray.push(uvs);
            
            // Adjust indices to account for merged vertices
            if (indices.length > 0) {
              const adjustedIndices = indices.map(i => i + vertexOffset);
              indicesArray.push(adjustedIndices);
            }
            
            vertexOffset += vertices.length / 3;
          });
          
          // Merge arrays
          const mergedVertices = mergeFloat32Arrays(verticesArray);
          const mergedNormals = normalsArray.length > 0 ? mergeFloat32Arrays(normalsArray) : undefined;
          const mergedUvs = uvsArray.length > 0 ? mergeFloat32Arrays(uvsArray) : undefined;
          const mergedIndices = indicesArray.flat();
          
          // Set attributes
          finalGeometry.setAttribute('position', new THREE.BufferAttribute(mergedVertices, 3));
          if (mergedNormals) finalGeometry.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
          if (mergedUvs) finalGeometry.setAttribute('uv', new THREE.BufferAttribute(mergedUvs, 2));
          if (mergedIndices.length > 0) finalGeometry.setIndex(mergedIndices);
          
          finalGeometry.computeVertexNormals();
          mergedGeometry = finalGeometry;
        }
        
        // Center the geometry
        mergedGeometry.computeBoundingBox();
        const center = new THREE.Vector3();
        if (mergedGeometry.boundingBox) {
          mergedGeometry.boundingBox.getCenter(center);
          mergedGeometry.translate(-center.x, -center.y, -center.z);
        }
        
        // Normalize size
        mergedGeometry.computeBoundingSphere();
        if (mergedGeometry.boundingSphere) {
          const radius = mergedGeometry.boundingSphere.radius;
          if (radius > 0) {
            const scaleFactor = radius > 5 ? 5 / radius : 1;
            if (scaleFactor !== 1) {
              mergedGeometry.scale(scaleFactor, scaleFactor, scaleFactor);
            }
          }
        }
        
        // Create the final mesh
        const mesh = new THREE.Mesh(mergedGeometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Position mesh slightly above the grid
        mesh.position.y = 0;
        
        // Store original transform
        const originalPosition = mesh.position.clone();
        const originalRotation = mesh.rotation.clone();
        const originalScale = mesh.scale.clone();
        
        // Add to scene
        scene.add(mesh);
        console.log("Added SVG mesh to scene:", mesh);
        
        // Create model object
        const newModel: Model = {
          id: `svg-model-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: file.name,
          type: 'model',
          mesh,
          originalPosition,
          originalRotation,
          originalScale
        };
        
        // Add to models array
        const models = [...state.models, newModel];
        set({ models });
        
        // Select the new model
        const newIndex = models.length - 1;
        get().selectModel(newIndex);
        
        // Force a render
        state.renderer.render(state.scene, state.camera);
        
        // Save to history after adding a model
        get().saveHistoryState();
        
      } catch (error) {
        console.error("Error loading SVG:", error);
        throw new Error("Failed to load SVG file");
      }
    },
    
    // Create 3D text
    loadText: async (text: string, options: TextOptions = { text }) => {
      const state = get();

      if (!state.isSceneReady) {
        console.error("Scene not ready, can't create text");
        return;
      }
      
      try {
        console.log("Creating 3D text:", text);
        
        // Default text options
        const defaultOptions = {
          fontSize: 5,
          height: 2,
          curveSegments: 4,
          bevelEnabled: true,
          bevelThickness: 0.2,
          bevelSize: 0.1,
          bevelSegments: 3,
          fontPath: defaultFontPath
        };
        
        // Merge defaults with provided options
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Load font
        const fontLoader = new FontLoader();
        const font = await new Promise((resolve, reject) => {
          console.log("Loading font from:", mergedOptions.fontPath);
          fontLoader.load(
            mergedOptions.fontPath, 
            (font) => resolve(font),
            undefined,
            (err) => {
              console.error("Error loading font:", err);
              // If the specified font fails, try the default as fallback
              if (mergedOptions.fontPath !== defaultFontPath) {
                console.log("Trying fallback font:", defaultFontPath);
                fontLoader.load(
                  defaultFontPath,
                  (font) => resolve(font),
                  undefined,
                  (fallbackErr) => reject(new Error(`Failed to load both specified and fallback fonts`))
                );
              } else {
                reject(new Error(`Failed to load font: ${(err as Error).message}`));
              }
            }
          );
        });
        
        // Create text geometry parameters
        const geometryParams: TextGeometryParameters = {
          font: font as any,
          size: mergedOptions.fontSize,
          depth: mergedOptions.height,
          curveSegments: mergedOptions.curveSegments,
          bevelEnabled: mergedOptions.bevelEnabled,
          bevelThickness: mergedOptions.bevelThickness,
          bevelSize: mergedOptions.bevelSize,
          bevelSegments: mergedOptions.bevelSegments,
        };
        
        // Create text geometry
        const geometry = new TextGeometry(text, geometryParams);
        
        // Create material with specified or random color
        const material = new THREE.MeshStandardMaterial({ 
          color: mergedOptions.color || getRandomColor(),
          metalness: 0.1,
          roughness: 0.8,
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Center the geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        if (geometry.boundingBox) {
          geometry.boundingBox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);
        }
        
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
          originalScale
        };
        
        // Add to models array
        const models = [...state.models, newModel];
        set({ models });
        
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
  
  switch (mode) {
    case 'standard':
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
        const material = new THREE.MeshStandardMaterial({
          color: currentColor,
          roughness: 0.7,
          metalness: 0.2
        });
        mesh.material = material;
      }
      break;
      
    case 'wireframe':
      if (!(mesh.material instanceof THREE.MeshBasicMaterial) || !(mesh.material as THREE.MeshBasicMaterial).wireframe) {
        const material = new THREE.MeshBasicMaterial({
          color: currentColor,
          wireframe: true
        });
        mesh.material = material;
      }
      break;
      
    case 'realistic':
      if (!(mesh.material instanceof THREE.MeshPhysicalMaterial)) {
        const material = new THREE.MeshPhysicalMaterial({
          color: currentColor,
          roughness: 0.3,
          metalness: 0.8,
          clearcoat: 0.5,
          clearcoatRoughness: 0.2,
          reflectivity: 1
        });
        mesh.material = material;
      }
      break;
      
    case 'xray':
      if (!(mesh.material instanceof THREE.MeshBasicMaterial) || !(mesh.material as THREE.MeshBasicMaterial).transparent) {
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

type Model = {
  id: string;
  name: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'text' | 'model' | 'torusknot' | 'octahedron' | 'icosahedron' | 'dodecahedron' | 'capsule' | 'pyramid';
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  originalScale: THREE.Vector3;
  textProps?: TextProps;
};
// ... existing code ...