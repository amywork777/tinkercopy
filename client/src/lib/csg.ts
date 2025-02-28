import * as THREE from 'three';
import { CSG } from 'three-csg-ts';

export function performBoolean(
  meshA: THREE.Mesh,
  meshB: THREE.Mesh,
  operation: 'union' | 'subtract' | 'intersect'
): THREE.Mesh {
  const bspA = CSG.fromMesh(meshA);
  const bspB = CSG.fromMesh(meshB);
  
  let result;
  switch (operation) {
    case 'union':
      result = bspA.union(bspB);
      break;
    case 'subtract':
      result = bspA.subtract(bspB);
      break;
    case 'intersect':
      result = bspA.intersect(bspB);
      break;
  }
  
  return CSG.toMesh(result, meshA.matrix);
}
