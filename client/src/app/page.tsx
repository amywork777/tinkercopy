import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Viewport } from "@/components/Viewport";
import { TransformControls } from "@/components/TransformControls";
import ToolBar from "@/components/ToolBar";
import { RightSidebar } from "@/components/RightSidebar";
import { Button } from "@/components/ui/button";
import { Printer, PanelLeft, PanelRight, Menu, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useDevice } from "@/lib/hooks/use-device";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Home() {
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const { isMobile, isTablet } = useDevice();
  const isSmallScreen = isMobile || isTablet;
  
  // Mobile navigation state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen">
        {/* Header bar */}
        <div className="w-full h-12 bg-background border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {isSmallScreen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(true)}
                className="mr-2 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-xl font-bold text-primary">taiyaki.ai</h1>
          </div>
          <div className="flex items-center space-x-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Main content area */}
        <main className="flex flex-1 w-full overflow-hidden relative">
          {/* Mobile Menu Sheet */}
          {isSmallScreen && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetContent side="left" className="p-0 w-[85%] sm:max-w-sm">
                <div className="h-full overflow-y-auto">
                  <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="font-semibold">taiyaki.ai</h2>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <Sidebar onClose={() => setMobileMenuOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          )}
          
          {/* Desktop Sidebar - Left panel */}
          {!isSmallScreen && leftSidebarOpen && (
            <div className="w-96 flex-shrink-0 border-r border-border overflow-y-auto h-full">
              <Sidebar onClose={() => setLeftSidebarOpen(false)} />
            </div>
          )}
          
          {/* Desktop Sidebar Toggle Button */}
          {!isSmallScreen && !leftSidebarOpen && (
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
            <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-10 ${isSmallScreen ? 'w-[95%]' : 'w-[90%] md:w-auto'}`}>
              <ToolBar />
            </div>
            
            {/* Transform Controls - Adapt for mobile */}
            <div className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 ${isSmallScreen ? 'w-[95%]' : 'w-[90%] md:w-auto'}`}>
              <TransformControls />
            </div>
            
            {/* 3D Print Button - Hide on very small screens, show compact version on tablet */}
            {(!isMobile || (isTablet && !rightSidebarOpen)) && (
              <div className="absolute top-4 right-4 z-10">
                <Button 
                  variant="primary"
                  onClick={() => setRightSidebarOpen(true)}
                  className={isTablet ? "px-2" : ""}
                >
                  <Printer className="h-4 w-4" />
                  {!isTablet && "3D print with taiyaki"}
                </Button>
              </div>
            )}
          </div>
          
          {/* Right Sidebar - Full screen on mobile, overlay on desktop */}
          {rightSidebarOpen && (
            <div className={`${isSmallScreen ? 'fixed inset-0 z-50' : 'absolute top-0 right-0 h-full z-20'}`}>
              <RightSidebar isOpen={rightSidebarOpen} onClose={() => setRightSidebarOpen(false)} />
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
} 