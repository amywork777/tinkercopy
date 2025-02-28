import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScene } from "@/hooks/use-scene";
import { Upload, Trash2 } from "lucide-react";

export function ModelList() {
  const { loadSTL, removeModel, models } = useScene();
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await loadSTL(file);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load STL file",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Button className="w-full" onClick={() => document.getElementById("file-input")?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          Import STL
        </Button>
        <input
          id="file-input"
          type="file"
          accept=".stl"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {models.map((model, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
              <span className="truncate">{model.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeModel(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
