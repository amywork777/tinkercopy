import { useEffect, useRef } from "react";
import { useScene } from "@/hooks/use-scene";
import { Card } from "@/components/ui/card";

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scene, camera, renderer, controls, initializeTransformControls } = useScene();

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Clear any existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    container.appendChild(renderer.domElement);

    // Initialize transform controls after renderer is in the DOM
    initializeTransformControls();

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    const handleResize = () => {
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height, false);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial resize
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [scene, camera, renderer, controls, initializeTransformControls]);

  return (
    <Card className="h-full w-full rounded-none border-0">
      <div ref={containerRef} className="h-full w-full" />
    </Card>
  );
}