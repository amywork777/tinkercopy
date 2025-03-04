import { useState, useEffect, useRef } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useToast } from "../hooks/use-toast";
import { useScene } from "../hooks/use-scene";

// Font options with their display names and paths
const FONTS = [
  { name: "Helvetica", value: "helvetica" },
  { name: "Arial", value: "arial" },
  { name: "Times New Roman", value: "times new roman" },
  { name: "Courier", value: "courier" }
];

type TextDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TextDialog({ open, onOpenChange }: TextDialogProps) {
  const { toast } = useToast();
  const { loadText } = useScene();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [text, setText] = useState("Text");
  const [fontSize, setFontSize] = useState(48);
  const [selectedFont, setSelectedFont] = useState(FONTS[0].value);
  const [isLoading, setIsLoading] = useState(false);
  
  // Update the canvas preview whenever text properties change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set font
    ctx.font = `${fontSize}px ${selectedFont}`;
    ctx.fillStyle = 'black';
    
    // Calculate text metrics
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    
    // Center the text
    const x = (canvas.width - textWidth) / 2;
    const y = (canvas.height + textHeight / 2) / 2;
    
    // Draw text
    ctx.fillText(text, x, y);
    
    // Draw bounding box
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - textHeight, textWidth, textHeight);
    
  }, [text, fontSize, selectedFont]);
  
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
        fontSize: fontSize * 0.5, // Convert to appropriate 3D size
        fontPath: `/fonts/${selectedFont}.typeface.json`,
      });
      
      toast({
        title: "Success",
        description: "Text created successfully",
      });
      
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create text",
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
          <DialogTitle>Create Text</DialogTitle>
          <DialogDescription>
            Enter text and customize its appearance
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
            <Label className="text-right">Font</Label>
            <div className="col-span-3">
              <Select value={selectedFont} onValueChange={setSelectedFont}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Size</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Slider
                value={[fontSize]}
                min={12}
                max={144}
                step={1}
                onValueChange={(value) => setFontSize(value[0])}
                className="flex-1"
              />
              <span className="w-12 text-sm text-muted-foreground">
                {fontSize}px
              </span>
            </div>
          </div>
          
          <div className="border rounded-md p-4 bg-background">
            <canvas
              ref={canvasRef}
              width={400}
              height={200}
              className="w-full border-2 border-dashed border-gray-200 bg-white"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={handleSubmit} 
            disabled={isLoading}
          >
            {isLoading ? "Creating..." : "Create Text"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 