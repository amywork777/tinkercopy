import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, X } from "lucide-react";
import Print3DTab from "./Print3DTab";
import { useScene } from "@/hooks/use-scene";
import { Button } from "./ui/button";

export function RightSidebar({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [activeTab, setActiveTab] = useState("print3d");

  if (!isOpen) return null;

  return (
    <div className="w-80 flex-shrink-0 border-l border-border overflow-y-auto h-full bg-background">
      <Tabs defaultValue="print3d" className="h-full flex flex-col" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="print3d" className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              <span>3D Print with taiyaki</span>
            </TabsTrigger>
          </TabsList>
          <Button 
            onClick={onClose}
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <TabsContent value="print3d" className="flex-1 overflow-y-auto p-4 h-full">
          <Print3DTab />
        </TabsContent>
      </Tabs>
    </div>
  );
} 