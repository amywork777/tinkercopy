import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { useScene } from "@/hooks/use-scene";
import { Card } from "@/components/ui/card";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scene, camera, renderer, controls } = useScene();

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.appendChild(renderer.domElement);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeChild(renderer.domElement);
    };
  }, [scene, camera, renderer, controls]);

  return (
    <Card className="h-full w-full rounded-none border-0">
      <div ref={containerRef} className="h-full w-full" />
    </Card>
  );
}
