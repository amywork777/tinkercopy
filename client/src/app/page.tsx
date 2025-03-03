import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Viewport } from "@/components/Viewport";
import { TransformControls } from "@/components/TransformControls";
import ToolBar from "@/components/ToolBar";
import { RightSidebar } from "@/components/RightSidebar";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function Home() {
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  
  return (
    <div className="flex flex-col h-screen">
      {/* ToolBar - Global controls at the top */}
      <ToolBar />
      
      <main className="flex flex-1 w-full overflow-hidden relative">
        {/* Sidebar - Left panel */}
        <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto h-full">
          <Sidebar />
        </div>
        
        {/* Main Viewport Area - Center panel */}
        <div className="flex-1 relative h-full">
          <Viewport />
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 w-[90%] md:w-auto">
            <TransformControls />
          </div>
          
          {/* 3D Print Button */}
          <div className="absolute top-4 right-4 z-10">
            <Button 
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
              onClick={() => setRightSidebarOpen(true)}
            >
              <Printer className="h-4 w-4 mr-2" />
              3D print with taiyaki
            </Button>
          </div>
        </div>
        
        {/* Right Sidebar - Overlay positioned */}
        {rightSidebarOpen && (
          <div className="absolute top-0 right-0 h-full z-20">
            <RightSidebar isOpen={rightSidebarOpen} onClose={() => setRightSidebarOpen(false)} />
          </div>
        )}
      </main>
    </div>
  );
} 