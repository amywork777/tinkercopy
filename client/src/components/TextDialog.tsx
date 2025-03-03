import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Checkbox } from "./ui/checkbox";
import { useToast } from "../hooks/use-toast";
import { useScene } from "../hooks/use-scene";

type TextDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TextDialog({ open, onOpenChange }: TextDialogProps) {
  const { toast } = useToast();
  const { loadText } = useScene();
  
  const [text, setText] = useState("Text");
  const [fontSize, setFontSize] = useState(152.4);
  const [height, setHeight] = useState(76.2);
  const [curveSegments, setCurveSegments] = useState(4);
  const [bevelEnabled, setBevelEnabled] = useState(true);
  const [bevelThickness, setBevelThickness] = useState(12.7);
  const [bevelSize, setBevelSize] = useState(6.35);
  const [bevelSegments, setBevelSegments] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSubmit = async () => {
    if (!text.trim()) {
      toast({
        title: "Error",
        description: "Text cannot be empty",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      await loadText(text, {
        text,
        fontSize,
        height,
        curveSegments,
        bevelEnabled,
        bevelThickness,
        bevelSize,
        bevelSegments,
      });
      
      toast({
        title: "Success",
        description: "3D text created successfully",
      });
      
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create 3D text",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create 3D Text</DialogTitle>
          <DialogDescription>
            Enter text and customize options to create a 3D text object
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="text" className="text-right">
              Text
            </Label>
            <Input
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Font Size</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Slider
                value={[fontSize]}
                min={25.4}
                max={304.8}
                step={25.4}
                onValueChange={(value) => setFontSize(value[0])}
                className="flex-1"
              />
              <span className="w-16 text-sm text-muted-foreground">
                {(fontSize / 25.4).toFixed(1)}"
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Depth</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Slider
                value={[height]}
                min={25.4}
                max={152.4}
                step={25.4}
                onValueChange={(value) => setHeight(value[0])}
                className="flex-1"
              />
              <span className="w-16 text-sm text-muted-foreground">
                {(height / 25.4).toFixed(1)}"
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Segments</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Slider
                value={[curveSegments]}
                min={1}
                max={10}
                step={1}
                onValueChange={(value) => setCurveSegments(value[0])}
                className="flex-1"
              />
              <span className="w-12 text-sm text-muted-foreground">
                {curveSegments}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Bevel</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Checkbox
                checked={bevelEnabled}
                onCheckedChange={(checked) => 
                  setBevelEnabled(checked === true)
                }
                id="bevel"
              />
              <Label htmlFor="bevel" className="text-sm font-normal">
                Enable bevel
              </Label>
            </div>
          </div>
          
          {bevelEnabled && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Bevel Thickness</Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Slider
                    value={[bevelThickness]}
                    min={0.01}
                    max={1}
                    step={0.01}
                    disabled={!bevelEnabled}
                    onValueChange={(value) => setBevelThickness(value[0])}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {bevelThickness}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Bevel Size</Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Slider
                    value={[bevelSize]}
                    min={0.01}
                    max={1}
                    step={0.01}
                    disabled={!bevelEnabled}
                    onValueChange={(value) => setBevelSize(value[0])}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {bevelSize}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Bevel Segments</Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Slider
                    value={[bevelSegments]}
                    min={1}
                    max={10}
                    step={1}
                    disabled={!bevelEnabled}
                    onValueChange={(value) => setBevelSegments(value[0])}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {bevelSegments}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={handleSubmit} 
            disabled={isLoading}
          >
            {isLoading ? "Creating..." : "Create 3D Text"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 