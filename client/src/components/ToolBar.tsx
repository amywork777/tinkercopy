import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Undo, Redo, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useScene } from "@/hooks/use-scene";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const ToolBar = () => {
  const { 
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    renderingMode, 
    setRenderingMode,
    cameraView, 
    setCameraView, 
    showGrid, 
    setShowGrid, 
    showAxes, 
    setShowAxes
  } = useScene();
  const { toast } = useToast();
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);

  const handleUndo = () => {
    if (canUndo) {
      undo();
      toast({
        title: "Action undone",
        duration: 2000,
      });
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      redo();
      toast({
        title: "Action redone",
        duration: 2000,
      });
    }
  };

  const handleRenderingModeChange = (value: string) => {
    setRenderingMode(value as 'standard' | 'wireframe' | 'realistic' | 'xray');
    toast({
      title: `Rendering mode: ${value}`,
      duration: 2000,
    });
  };

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-background/90 backdrop-blur-sm rounded-lg shadow-lg p-2 flex items-center space-x-2 border border-border">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              <Undo className={canUndo ? "text-primary" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Undo (Ctrl+Z)</p>
          </TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleRedo}
              disabled={!canRedo}
            >
              <Redo className={canRedo ? "text-primary" : "text-muted-foreground"} size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo (Ctrl+Y)</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-8 mx-1" />

        {/* View Options Popover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover open={viewOptionsOpen} onOpenChange={setViewOptionsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon">
                  <span className="text-white text-xs font-medium">Views</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="center">
                <div className="p-3">
                  <h3 className="text-sm font-semibold mb-3">View Options</h3>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant={cameraView === 'top' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('top')}
                      >
                        Top
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraView === 'front' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('front')}
                      >
                        Front
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraView === 'side' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('side')}
                      >
                        Side
                      </Button>
                      <Button
                        size="sm"
                        variant={cameraView === 'isometric' ? 'default' : 'outline'}
                        className="w-full h-8"
                        onClick={() => setCameraView('isometric')}
                      >
                        Isometric
                      </Button>
                    </div>
                    
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="toolbar-show-grid" 
                          checked={showGrid}
                          onCheckedChange={(checked) => setShowGrid(!!checked)}
                        />
                        <Label htmlFor="toolbar-show-grid" className="text-sm">Show Grid</Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="toolbar-show-axes" 
                          checked={showAxes}
                          onCheckedChange={(checked) => setShowAxes(!!checked)}
                        />
                        <Label htmlFor="toolbar-show-axes" className="text-sm">Show Axes</Label>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </TooltipTrigger>
          <TooltipContent>
            <p>View Options</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Separator orientation="vertical" className="h-8" />

      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <Select 
          value={renderingMode} 
          onValueChange={handleRenderingModeChange}
        >
          <SelectTrigger className="w-[140px]">
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
    </div>
  );
};

export default ToolBar; 