import { Viewport } from "@/components/Viewport";
import { ModelLibrary } from "@/components/ModelLibrary";
import { TransformControls } from "@/components/TransformControls";
import { CSGControls } from "@/components/CSGControls";
import { ViewOptions } from "@/components/ViewOptions";

export default function Home() {
  return (
    <div className="flex h-screen bg-background">
      <div className="w-80 bg-background flex flex-col overflow-auto">
        <ModelLibrary />
        <TransformControls />
        <div className="mt-4">
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground">
              Tip: Ctrl+click to set a secondary model for CSG operations
            </p>
          </div>
        </div>
      </div>
      <main className="flex-1 bg-zinc-900">
        <Viewport />
      </main>
      <div className="w-72 bg-background flex flex-col">
        <CSGControls />
        <ViewOptions />
      </div>
    </div>
  );
}
