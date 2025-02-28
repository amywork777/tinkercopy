import { ModelList } from "./ModelList";
import { TransformControls } from "./TransformControls";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function Sidebar() {
  return (
    <Card className="w-80 border-r rounded-none">
      <div className="p-4">
        <h2 className="text-xl font-bold">3D Model Merger</h2>
        <Separator className="my-4" />
        <TransformControls />
        <Separator className="my-4" />
        <ModelList />
      </div>
    </Card>
  );
}
