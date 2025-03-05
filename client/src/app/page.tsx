import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Viewport } from "@/components/Viewport";
import { TransformControls } from "@/components/TransformControls";
import ToolBar from "@/components/ToolBar";
import { RightSidebar } from "@/components/RightSidebar";
import { Button } from "@/components/ui/button";
import { Printer, PanelLeft } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { initTaiyakiMessageListener } from "@/lib/iframeInterceptor";
import MobileWarning from "@/components/MobileWarning";

export default function Home() {
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  
  // Initialize the Taiyaki message listener when the component mounts
  useEffect(() => {
    // Set up the message listener and get the cleanup function
    const cleanup = initTaiyakiMessageListener();
    
    // Log that the listener is active
    console.log("Taiyaki STL import message listener initialized");
    
    // Return the cleanup function to be called when the component unmounts
    return cleanup;
  }, []);
  
  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen">
        {/* Mobile Warning Overlay */}
        <MobileWarning />
        
        {/* Header bar */}
        <div className="w-full h-12 bg-background border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-primary">taiyaki.ai</h1>
          </div>
          <div className="flex items-center space-x-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Main content area */}
        <main className="flex flex-1 w-full overflow-hidden relative">
          {/* Sidebar - Left panel */}
          {leftSidebarOpen ? (
            <div className="w-96 flex-shrink-0 border-r border-border overflow-y-auto h-full">
              <Sidebar onClose={() => setLeftSidebarOpen(false)} />
            </div>
          ) : (
            <div className="absolute top-4 left-4 z-10">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setLeftSidebarOpen(true)}
                className="h-10 w-10 bg-background/80 backdrop-blur-sm"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
            </div>
          )}
          
          {/* Main Viewport Area - Center panel */}
          <div className="flex-1 relative h-full">
            <Viewport />
            
            {/* Floating ToolBar positioned */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 w-[90%] md:w-auto">
              <ToolBar />
            </div>
            
            {/* Transform Controls */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 w-[90%] md:w-auto">
              <TransformControls />
            </div>
            
            {/* 3D Print Button */}
            <div className="absolute top-4 right-4 z-10">
              <Button 
                variant="primary"
                onClick={() => setRightSidebarOpen(true)}
              >
                <Printer className="h-4 w-4" />
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
    </TooltipProvider>
  );
} 