import { Material, Mesh, Scene, Vector3, Euler } from 'three';

export interface TextProps {
  text: string;
  fontSize: number;
  height: number;
  curveSegments: number;
  bevelEnabled: boolean;
  bevelThickness: number;
  bevelSize: number;
  bevelSegments: number;
  fontPath: string;
}

export interface Model {
  id: string;
  name: string;
  type: 'text' | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'model' | 'torusknot' | 'octahedron' | 'icosahedron' | 'dodecahedron' | 'capsule' | 'pyramid' | 'svg';
  mesh: Mesh;
  originalPosition: Vector3;
  originalRotation: Euler;
  originalScale: Vector3;
  textProps?: TextProps;
}

declare module 'three' {
  interface Material {
    color?: {
      set: (color: string) => void;
      getHexString: () => string;
    };
  }

  interface Scene {
    needsUpdate?: boolean;
  }
} 