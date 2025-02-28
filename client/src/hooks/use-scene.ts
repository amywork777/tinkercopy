import { create } from "zustand";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type TransformMode = "translate" | "rotate" | "scale";

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  transformControls: TransformControls | null;
  models: { name: string; mesh: THREE.Mesh }[];
  selectedModelIndex: number | null;
  transformMode: TransformMode;
  loadSTL: (file: File) => Promise<void>;
  removeModel: (index: number) => void;
  setTransformMode: (mode: TransformMode) => void;
  selectModel: (index: number | null) => void;
  initializeTransformControls: () => void;
}

export const useScene = create<SceneState>((set, get) => {
  // Initialize scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  // Initialize camera
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  // Initialize renderer
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true 
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;

  // Initialize orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Add grid and lights
  const grid = new THREE.GridHelper(10, 10);
  scene.add(grid);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(0, 5, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  return {
    scene,
    camera,
    renderer,
    controls,
    transformControls: null,
    models: [],
    selectedModelIndex: null,
    transformMode: "translate",

    initializeTransformControls: () => {
      const state = get();

      // Clean up existing transform controls
      if (state.transformControls) {
        state.transformControls.dispose();
        state.scene.remove(state.transformControls);
      }

      // Create new transform controls
      const transformControls = new TransformControls(state.camera, state.renderer.domElement);

      // Configure transform controls
      transformControls.size = 0.75;
      transformControls.showX = true;
      transformControls.showY = true;
      transformControls.showZ = true;
      transformControls.enabled = true;

      // Handle interaction between orbit and transform controls
      transformControls.addEventListener('mouseDown', () => {
        state.controls.enabled = false;
      });

      transformControls.addEventListener('mouseUp', () => {
        state.controls.enabled = true;
      });

      transformControls.addEventListener('dragging-changed', (event) => {
        state.controls.enabled = !event.value;
      });

      // Add to scene
      state.scene.add(transformControls);
      set({ transformControls });

      // If there's a selected model, attach the controls
      if (state.selectedModelIndex !== null && state.models[state.selectedModelIndex]) {
        const selectedMesh = state.models[state.selectedModelIndex].mesh;
        transformControls.attach(selectedMesh);
        transformControls.setMode(state.transformMode);
      }
    },

    loadSTL: async (file: File) => {
      try {
        const state = get();
        const loader = new STLLoader();
        const arrayBuffer = await file.arrayBuffer();
        const geometry = loader.parse(arrayBuffer);

        // Center and prepare the geometry
        geometry.center();
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ 
          color: 0x808080,
          metalness: 0.1,
          roughness: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add mesh to scene
        state.scene.add(mesh);

        // Update models array and select the new model
        const newIndex = state.models.length;
        set({ 
          models: [...state.models, { name: file.name, mesh }],
          selectedModelIndex: newIndex
        });

        // Ensure transform controls are ready
        if (!state.transformControls) {
          state.initializeTransformControls();
        }

        // Attach transform controls to new mesh
        if (state.transformControls) {
          state.transformControls.attach(mesh);
          state.transformControls.setMode(state.transformMode);
        }
      } catch (error) {
        console.error('Error loading STL:', error);
        throw new Error('Failed to load STL file');
      }
    },

    removeModel: (index: number) => {
      const state = get();
      const model = state.models[index];

      if (model) {
        // Detach transform controls if they exist
        if (state.transformControls) {
          state.transformControls.detach();
        }

        // Remove mesh from scene
        state.scene.remove(model.mesh);

        // Update models array
        const newModels = [...state.models];
        newModels.splice(index, 1);

        // Update selection
        let newSelectedIndex = state.selectedModelIndex;
        if (state.selectedModelIndex === index) {
          newSelectedIndex = null;
        } else if (state.selectedModelIndex !== null && state.selectedModelIndex > index) {
          newSelectedIndex = state.selectedModelIndex - 1;
        }

        set({ 
          models: newModels,
          selectedModelIndex: newSelectedIndex
        });
      }
    },

    setTransformMode: (mode: TransformMode) => {
      const state = get();

      if (!state.transformControls) {
        state.initializeTransformControls();
      }

      if (state.transformControls) {
        state.transformControls.setMode(mode);

        // Re-attach to current selection to ensure mode takes effect
        if (state.selectedModelIndex !== null && state.models[state.selectedModelIndex]) {
          state.transformControls.attach(state.models[state.selectedModelIndex].mesh);
        }
      }

      set({ transformMode: mode });
    },

    selectModel: (index: number | null) => {
      const state = get();

      // Initialize transform controls if they don't exist
      if (!state.transformControls) {
        state.initializeTransformControls();
      }

      if (state.transformControls) {
        // Detach from current selection
        state.transformControls.detach();

        // Attach to new selection if valid
        if (index !== null && state.models[index]) {
          state.transformControls.attach(state.models[index].mesh);
          state.transformControls.setMode(state.transformMode);
        }
      }

      set({ selectedModelIndex: index });
    }
  };
});