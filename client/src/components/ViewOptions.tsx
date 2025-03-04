import React from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDevice } from "@/lib/hooks/use-device";

interface ViewOptionsProps {
  onClose: () => void;
  renderingMode: "standard" | "wireframe" | "realistic" | "xray";
  setRenderingMode: (mode: "standard" | "wireframe" | "realistic" | "xray") => void;
  cameraView: "isometric" | "top" | "bottom" | "front" | "back" | "left" | "right";
  setCameraView: (view: "isometric" | "top" | "bottom" | "front" | "back" | "left" | "right") => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showAxes: boolean;
  setShowAxes: (show: boolean) => void;
}

export function ViewOptions({
  onClose,
  renderingMode,
  setRenderingMode,
  cameraView,
  setCameraView,
  showGrid,
  setShowGrid,
  showAxes,
  setShowAxes
}: ViewOptionsProps) {
  const { isMobile } = useDevice();
  
  return (
    <Card className="backdrop-blur-sm bg-background/95 shadow-lg border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">View Options</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          {/* Camera Views */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Camera View</Label>
            <div className={`grid grid-cols-${isMobile ? "2" : "4"} gap-2`}>
              {(["top", "front", "right", "isometric"] as const).map((view) => (
                <Button
                  key={view}
                  size="sm"
                  variant={cameraView === view ? 'default' : 'outline'}
                  className="w-full text-xs"
                  onClick={() => setCameraView(view)}
                >
                  {view.charAt(0).toUpperCase() + view.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Rendering Mode */}
          <div>
            <Label htmlFor="render-mode" className="text-sm font-medium mb-1.5 block">
              Render Mode
            </Label>
            <Select 
              value={renderingMode} 
              onValueChange={setRenderingMode}
            >
              <SelectTrigger id="render-mode" className="w-full">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="wireframe">Wireframe</SelectItem>
                <SelectItem value="realistic">Realistic</SelectItem>
                <SelectItem value="xray">X-Ray</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Grid and Axes Options */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="show-grid" 
                checked={showGrid}
                onCheckedChange={(checked) => setShowGrid(!!checked)}
              />
              <Label htmlFor="show-grid" className="text-sm">Show Grid</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="show-axes" 
                checked={showAxes}
                onCheckedChange={(checked) => setShowAxes(!!checked)}
              />
              <Label htmlFor="show-axes" className="text-sm">Show Axes</Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 