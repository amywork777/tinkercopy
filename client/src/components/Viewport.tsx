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

    // Add renderer to container
    container.appendChild(renderer.domElement);

    // Initialize transform controls
    initializeTransformControls();

    // Handle resize
    const handleResize = () => {
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
    };

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    // Initial setup
    handleResize();
    window.addEventListener("resize", handleResize);
    animate();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animate as unknown as number);

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