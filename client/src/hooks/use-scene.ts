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
  transformControls: TransformControls;
  models: { name: string; mesh: THREE.Mesh }[];
  selectedModelIndex: number | null;
  transformMode: TransformMode;
  loadSTL: (file: File) => Promise<void>;
  removeModel: (index: number) => void;
  setTransformMode: (mode: TransformMode) => void;
  selectModel: (index: number | null) => void;
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
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;

  // Initialize controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Initialize transform controls
  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.size = 0.75;
  transformControls.showX = true;
  transformControls.showY = true;
  transformControls.showZ = true;

  // Debug logging
  console.log("TransformControls instance:", transformControls);
  console.log("Is Object3D?", transformControls instanceof THREE.Object3D);
  console.log("Camera position:", camera.position);
  console.log("Renderer:", renderer);

  // Handle control interactions
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
  });

  // Add grid and lights
  const grid = new THREE.GridHelper(10, 10);
  scene.add(grid);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(0, 5, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  scene.add(transformControls);

  return {
    scene,
    camera,
    renderer,
    controls,
    transformControls,
    models: [],
    selectedModelIndex: null,
    transformMode: "translate",

    loadSTL: async (file: File) => {
      try {
        console.log("Starting STL load for file:", file.name);
        const loader = new STLLoader();
        const arrayBuffer = await file.arrayBuffer();
        console.log("File loaded as ArrayBuffer");

        const geometry = loader.parse(arrayBuffer);
        console.log("STL parsed successfully");

        // Center the geometry
        geometry.center();
        console.log("Geometry centered");

        const material = new THREE.MeshStandardMaterial({ 
          color: 0x808080,
          metalness: 0.1,
          roughness: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Reset transform
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);

        const { scene, models } = get();
        scene.add(mesh);
        console.log("Mesh added to scene");

        const newIndex = models.length;
        set({ 
          models: [...models, { name: file.name, mesh }],
          selectedModelIndex: newIndex
        });
        get().selectModel(newIndex);
        console.log("Model loaded and selected successfully");
      } catch (error) {
        console.error('Error loading STL:', error);
        throw new Error('Failed to load STL file');
      }
    },

    removeModel: (index: number) => {
      const { scene, models, selectedModelIndex, transformControls } = get();
      const model = models[index];
      if (model) {
        scene.remove(model.mesh);
        const newModels = [...models];
        newModels.splice(index, 1);

        let newSelectedIndex = selectedModelIndex;
        if (selectedModelIndex === index) {
          transformControls.detach();
          newSelectedIndex = null;
        } else if (selectedModelIndex !== null && selectedModelIndex > index) {
          newSelectedIndex = selectedModelIndex - 1;
        }

        set({ 
          models: newModels,
          selectedModelIndex: newSelectedIndex
        });
      }
    },

    setTransformMode: (mode: TransformMode) => {
      const { transformControls, selectedModelIndex, models } = get();
      transformControls.setMode(mode);
      if (selectedModelIndex !== null) {
        transformControls.attach(models[selectedModelIndex].mesh);
      }
      set({ transformMode: mode });
    },

    selectModel: (index: number | null) => {
      const { transformControls, models, transformMode } = get();
      transformControls.detach();

      if (index !== null && index < models.length) {
        transformControls.attach(models[index].mesh);
        transformControls.setMode(transformMode);
      }

      set({ selectedModelIndex: index });
    }
  };
});