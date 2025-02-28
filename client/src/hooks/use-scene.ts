import { create } from "zustand";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

type TransformMode = "translate" | "rotate" | "scale";

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  transformControls: TransformControls;
  models: { name: string; mesh: THREE.Mesh }[];
  transformMode: TransformMode;
  loadSTL: (file: File) => Promise<void>;
  removeModel: (index: number) => void;
  setTransformMode: (mode: TransformMode) => void;
}

export const useScene = create<SceneState>((set, get) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const transformControls = new TransformControls(camera, renderer.domElement);
  scene.add(transformControls);

  // Add grid and lights
  const grid = new THREE.GridHelper(10, 10);
  scene.add(grid);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(0, 1, 0);
  scene.add(directionalLight);

  return {
    scene,
    camera,
    renderer,
    controls,
    transformControls,
    models: [],
    transformMode: "translate",

    loadSTL: async (file: File) => {
      const loader = new STLLoader();
      const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const result = loader.parse(e.target?.result as ArrayBuffer);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        reader.readAsArrayBuffer(file);
      });

      const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
      const mesh = new THREE.Mesh(geometry, material);
      
      const { scene, models } = get();
      scene.add(mesh);
      
      set({ models: [...models, { name: file.name, mesh }] });
    },

    removeModel: (index: number) => {
      const { scene, models } = get();
      const model = models[index];
      if (model) {
        scene.remove(model.mesh);
        const newModels = [...models];
        newModels.splice(index, 1);
        set({ models: newModels });
      }
    },

    setTransformMode: (mode: TransformMode) => {
      const { transformControls } = get();
      transformControls.setMode(mode);
      set({ transformMode: mode });
    },
  };
});
