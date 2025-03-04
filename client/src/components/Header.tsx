import React from "react";
import { Button } from "@/components/ui/button";
import { Undo, Redo } from "lucide-react";
import { useScene } from "@/hooks/use-scene";

export function Header() {
  const { 
    canUndo, 
    canRedo, 
    undo, 
    redo,
  } = useScene();

  return (
    <header className="w-full py-2 px-4 border-b bg-background flex items-center justify-between">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">Taiyaki.ai</h1>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="h-8 px-2"
        >
          <Undo className="h-4 w-4" />
          <span className="ml-1">Undo</span>
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="h-8 px-2"
        >
          <Redo className="h-4 w-4" />
          <span className="ml-1">Redo</span>
        </Button>
      </div>
    </header>
  );
} 