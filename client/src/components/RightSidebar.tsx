import React from 'react';
import { Printer, X } from "lucide-react";
import Print3DTab from "./Print3DTab";
import { Button } from "./ui/button";

export function RightSidebar({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="w-[320px] flex-shrink-0 border-l border-border overflow-y-auto h-full bg-background">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <h2 className="text-sm font-medium">3D Print</h2>
          </div>
          <Button 
            onClick={onClose}
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 h-full">
          <Print3DTab />
        </div>
      </div>
    </div>
  );
} 