import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';

export function exportSTL(mesh: THREE.Mesh): string {
  const exporter = new STLExporter();
  return exporter.parse(mesh, { binary: true });
}
