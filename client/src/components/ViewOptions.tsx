import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useScene } from "@/hooks/use-scene";

export function ViewOptions() {
  const { 
    cameraView, 
    setCameraView, 
    showGrid, 
    setShowGrid, 
    showAxes, 
    setShowAxes 
  } = useScene();

  return (
    <div className="p-4 border-t">
      <h3 className="text-lg font-semibold mb-4">View Options</h3>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={cameraView === 'top' ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setCameraView('top')}
          >
            Top
          </Button>
          <Button
            variant={cameraView === 'front' ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setCameraView('front')}
          >
            Front
          </Button>
          <Button
            variant={cameraView === 'side' ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setCameraView('side')}
          >
            Side
          </Button>
          <Button
            variant={cameraView === 'isometric' ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setCameraView('isometric')}
          >
            Isometric
          </Button>
        </div>
        
        <div className="space-y-2 pt-2">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-grid" 
              checked={showGrid}
              onCheckedChange={(checked) => setShowGrid(!!checked)}
            />
            <Label htmlFor="show-grid">Show Grid</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-axes" 
              checked={showAxes}
              onCheckedChange={(checked) => setShowAxes(!!checked)}
            />
            <Label htmlFor="show-axes">Show Axes</Label>
          </div>
        </div>
      </div>
    </div>
  );
} 