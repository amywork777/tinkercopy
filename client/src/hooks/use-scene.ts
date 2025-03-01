import { create } from "zustand";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSG } from 'three-csg-ts';

// Scene configuration
const GRID_SIZE = 20;
const BACKGROUND_COLOR = 0x333333; // Dark gray
const getRandomColor = () => new THREE.Color(Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5);

// Helper constants for transformation
const TRANSFORM_STEP = 0.5; // Movement step size in units
const ROTATION_STEP = Math.PI / 18; // 10 degrees in radians
const SCALE_STEP = 0.1; // 10% scale step

// Type for our 3D models
type Model = {
  id: string;
  name: string;
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  originalScale: THREE.Vector3;
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
  
  // Loading states
  isCSGOperationLoading: boolean;
  
  // History tracking for undo/redo
  history: HistoryRecord[];
  currentHistoryIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  
  // Scene initialization
  initializeScene: (container: HTMLDivElement) => () => void;
  
  // Model management
  loadSTL: (file: File) => Promise<void>;
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
  
  // Undo/Redo
  saveHistoryState: () => void;
  undo: () => void;
  redo: () => void;
  
  // Export
  exportSelectedModelAsSTL: () => void;
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
    
    // Loading states
    isCSGOperationLoading: false,
    
    // History tracking for undo/redo
    history: [],
    currentHistoryIndex: -1,
    canUndo: false,
    canRedo: false,
    
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
      
      // Set up camera
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);
      
      // Set up orbit controls
      const orbitControls = new OrbitControls(camera, canvas);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.1;
      orbitControls.screenSpacePanning = true;
      orbitControls.minDistance = 1;
      orbitControls.maxDistance = 50;
      
      // Add a grid helper
      const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0xFFFFFF, 0x888888);
      scene.add(gridHelper);
      
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
        console.log("Loading STL file:", file.name);
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

        // Normalize size
        geometry.computeBoundingSphere();
        if (geometry.boundingSphere) {
          const radius = geometry.boundingSphere.radius;
          if (radius > 0) {
            const scaleFactor = radius > 5 ? 5 / radius : 1;
            if (scaleFactor !== 1) {
              geometry.scale(scaleFactor, scaleFactor, scaleFactor);
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
        console.log("Added mesh to scene:", mesh);
        
        // Create model object
        const newModel: Model = {
          id: `model-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: file.name,
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
      const state = get();
      
      // Reset highlighting on all models
      state.models.forEach(model => {
        const material = model.mesh.material as THREE.MeshStandardMaterial;
        material.emissive.set(0x000000); // Reset emissive to black (no glow)
      });
      
      // Update selected model index
      set({ selectedModelIndex: index });
      
      // If selecting a model, highlight it
      if (index !== null && state.models[index]) {
        const selectedModel = state.models[index];
        
        // Highlight selected model with emissive glow
        const material = selectedModel.mesh.material as THREE.MeshStandardMaterial;
        material.emissive.set(0x444444);
        
        console.log("Selected model:", selectedModel.name);
        console.log("Position:", selectedModel.mesh.position);
        console.log("Rotation:", selectedModel.mesh.rotation);
        console.log("Scale:", selectedModel.mesh.scale);
      }
      
      // Force a render to show changes
      state.renderer.render(state.scene, state.camera);
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
      set({ transformMode: mode });
      console.log(`Transform mode set to: ${mode}`);
    },
    
    // Apply transformation directly to the selected model
    applyTransform: (operation: TransformOperation, direction: 1 | -1) => {
      const state = get();
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for transformation");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Apply the transformation based on operation type
      switch(operation) {
        // Translation operations
        case 'translateX':
          mesh.position.x += TRANSFORM_STEP * direction;
          break;
        case 'translateY':
          mesh.position.y += TRANSFORM_STEP * direction;
          break;
        case 'translateZ':
          mesh.position.z += TRANSFORM_STEP * direction;
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
          mesh.scale.x = Math.max(0.1, mesh.scale.x + SCALE_STEP * direction);
          break;
        case 'scaleY':
          mesh.scale.y = Math.max(0.1, mesh.scale.y + SCALE_STEP * direction);
          break;
        case 'scaleZ':
          mesh.scale.z = Math.max(0.1, mesh.scale.z + SCALE_STEP * direction);
          break;
      }
      
      // Update the matrix
      mesh.updateMatrix();
      
      // Log the change
      console.log(`Applied ${operation} with direction ${direction} to model:`, model.name);
      console.log("New position:", mesh.position);
      console.log("New rotation:", mesh.rotation);
      console.log("New scale:", mesh.scale);
      
      // Render to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after significant transforms
      // To avoid flooding history with every small movement, we'll only save
      // after a small delay
      clearTimeout(window.transformHistoryTimeout);
      window.transformHistoryTimeout = setTimeout(() => {
        get().saveHistoryState();
      }, 500) as unknown as number;
    },
    
    // Set model position directly from input values
    setModelPosition: (x: number, y: number, z: number) => {
      const state = get();
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for position change");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Set the new position
      mesh.position.set(x, y, z);
      
      // Update the matrix
      mesh.updateMatrix();
      
      console.log(`Set position for model ${model.name}:`, { x, y, z });
      
      // Render to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after direct position change
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
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for scale change");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Ensure minimum scale
      const minScale = 0.1;
      const validX = Math.max(minScale, x);
      const validY = Math.max(minScale, y);
      const validZ = Math.max(minScale, z);
      
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
      const state = get();
      const { selectedModelIndex, models } = state;
      
      if (selectedModelIndex === null || !models[selectedModelIndex]) {
        console.warn("No model selected for reset");
        return;
      }
      
      const model = models[selectedModelIndex];
      const mesh = model.mesh;
      
      // Reset to original values
      mesh.position.copy(model.originalPosition);
      mesh.rotation.copy(model.originalRotation);
      mesh.scale.copy(model.originalScale);
      
      // Update the matrix
      mesh.updateMatrix();
      
      console.log(`Reset transformation for model: ${model.name}`);
      
      // Render to show changes
      state.renderer.render(state.scene, state.camera);
      
      // Save history state after reset
      get().saveHistoryState();
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
        return;
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
        const blob = new Blob([result], { type: 'application/octet-stream' });
        
        // Create a download link
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${selectedModel.name.replace(/\.[^/.]+$/, '') || 'model'}_exported.stl`;
        link.click();
        
        // Clean up the URL object
        URL.revokeObjectURL(link.href);
        
        console.log(`Exported model '${selectedModel.name}' as STL`);
      } catch (error) {
        console.error("Error exporting STL:", error);
        throw new Error("Failed to export STL file");
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