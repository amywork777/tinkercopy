import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { Move, RotateCcw, Maximize } from "lucide-react";

export function TransformControls() {
  const { setTransformMode, transformMode } = useScene();

  return (
    <div className="flex flex-col space-y-2">
      <h3 className="font-medium mb-2">Transform Tools</h3>
      <div className="flex space-x-2">
        <Button
          variant={transformMode === "translate" ? "default" : "outline"}
          onClick={() => setTransformMode("translate")}
        >
          <Move className="h-4 w-4 mr-2" />
          Move
        </Button>
        <Button
          variant={transformMode === "rotate" ? "default" : "outline"}
          onClick={() => setTransformMode("rotate")}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Rotate
        </Button>
        <Button
          variant={transformMode === "scale" ? "default" : "outline"}
          onClick={() => setTransformMode("scale")}
        >
          <Maximize className="h-4 w-4 mr-2" />
          Scale
        </Button>
      </div>
    </div>
  );
}
