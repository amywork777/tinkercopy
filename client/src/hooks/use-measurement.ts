import { useState, useEffect, useCallback } from 'react';
import { Vector3, Vector2, Raycaster, Camera, Scene, ArrowHelper, Line, BufferGeometry, LineBasicMaterial, Object3D } from 'three';
import { useScene } from './use-scene';

interface MeasurementPoint {
  position: Vector3;
  object?: Object3D;
}

export function useMeasurement() {
  const { scene, camera } = useScene();
  const [isActive, setIsActive] = useState(false);
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [measurementLine, setMeasurementLine] = useState<Line | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [unit, setUnit] = useState('units');

  // Initialize the measurement functionality
  const initialize = useCallback(() => {
    if (!scene || !camera) return;
    
    setIsActive(true);
    setPoints([]);
    setDistance(null);
    
    // Clean up any existing measurement visual aids
    if (measurementLine && scene) {
      scene.remove(measurementLine);
      setMeasurementLine(null);
    }
    
    console.log('Measurement mode initialized');
  }, [scene, camera]);

  // Clean up the measurement functionality
  const cleanup = useCallback(() => {
    setIsActive(false);
    setPoints([]);
    setDistance(null);
    
    // Remove measurement visual aids
    if (measurementLine && scene) {
      scene.remove(measurementLine);
      setMeasurementLine(null);
    }
    
    console.log('Measurement mode cleaned up');
  }, [scene, measurementLine]);

  // Add a point to the measurement
  const addPoint = useCallback((x: number, y: number) => {
    if (!isActive || !scene || !camera) return;
    
    const raycaster = new Raycaster();
    const mouse = new Vector2(
      (x / window.innerWidth) * 2 - 1,
      -(y / window.innerHeight) * 2 + 1
    );
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const point: MeasurementPoint = {
        position: intersect.point.clone(),
        object: intersect.object
      };
      
      // Add the point
      setPoints(prevPoints => {
        const newPoints = [...prevPoints, point];
        
        // If we have two points, calculate the distance
        if (newPoints.length === 2) {
          const dist = newPoints[0].position.distanceTo(newPoints[1].position);
          setDistance(parseFloat(dist.toFixed(2)));
          
          // Draw a line between the points
          drawMeasurementLine(newPoints[0].position, newPoints[1].position);
        }
        
        // Limit to two points for now
        return newPoints.slice(0, 2);
      });
      
      return true;
    }
    
    return false;
  }, [isActive, scene, camera]);

  // Draw a line between two measurement points
  const drawMeasurementLine = useCallback((start: Vector3, end: Vector3) => {
    if (!scene) return;
    
    // Remove existing line
    if (measurementLine) {
      scene.remove(measurementLine);
    }
    
    // Create line geometry
    const geometry = new BufferGeometry().setFromPoints([start, end]);
    const material = new LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    const line = new Line(geometry, material);
    
    // Add to scene
    scene.add(line);
    setMeasurementLine(line);
    
  }, [scene, measurementLine]);

  // Clear the current measurement
  const clearMeasurement = useCallback(() => {
    setPoints([]);
    setDistance(null);
    
    if (measurementLine && scene) {
      scene.remove(measurementLine);
      setMeasurementLine(null);
    }
  }, [scene, measurementLine]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (measurementLine && scene) {
        scene.remove(measurementLine);
      }
    };
  }, [scene, measurementLine]);

  return {
    isActive,
    points,
    distance,
    unit,
    setUnit,
    initialize,
    cleanup,
    addPoint,
    clearMeasurement
  };
} 