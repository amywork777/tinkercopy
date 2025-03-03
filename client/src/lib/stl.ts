import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';

export function exportSTL(mesh: THREE.Mesh): string | Uint8Array {
  const exporter = new STLExporter();
  return exporter.parse(mesh, { binary: true });
}
