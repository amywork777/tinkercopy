import React from "react";
import { Sidebar } from "@/components/Sidebar";
import { Viewport } from "@/components/Viewport";
import { TransformControls } from "@/components/TransformControls";
import ToolBar from "@/components/ToolBar";

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col md:flex-row">
      {/* ToolBar - Global controls */}
      <ToolBar />
      
      {/* Sidebar - Left panel for mobile, takes full width */}
      <div className="w-full md:w-80 flex-shrink-0 border-r border-border overflow-y-auto">
        <Sidebar />
      </div>
      
      {/* Main Viewport Area - Right panel */}
      <div className="flex-1 flex flex-col h-screen md:h-auto relative">
        <div className="flex-1 relative">
          <Viewport />
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 w-[90%] md:w-auto">
            <TransformControls />
          </div>
        </div>
      </div>
    </main>
  );
} 