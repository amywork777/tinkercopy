declare module 'three/examples/jsm/exporters/STLExporter' {
  import { Object3D } from 'three';

  export class STLExporter {
    constructor();
    parse(scene: Object3D, options?: { binary?: boolean }): string | Uint8Array;
  }
} 