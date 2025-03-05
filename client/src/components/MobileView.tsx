import React, { useState, useEffect } from "react";
import { useScene } from "@/hooks/use-scene";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ComputerIcon, 
  UploadIcon, 
  ZoomInIcon, 
  ZoomOutIcon, 
  RotateCcw, 
  MaximizeIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  Box,
  RefreshCw,
  ExternalLinkIcon,
  InfoIcon,
  XIcon
} from "lucide-react";
import { toast } from "sonner";

const MobileView: React.FC = () => {
  const { 
    scene, 
    camera, 
    renderer, 
    models, 
    loadSTL, 
    selectedModelIndex,
    selectModel, 
    applyTransform
  } = useScene();
  
  const [showInstructions, setShowInstructions] = useState(true);
  const [showBanner, setShowBanner] = useState(true);

  useEffect(() => {
    // Make sure the renderer fills the mobile screen
    if (renderer && camera) {
      const resize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      
      resize();
      window.addEventListener('resize', resize);
      
      // Add the renderer element to the container
      const container = document.getElementById('mobile-viewport');
      if (container) {
        // Clear container first
        while (container.firstChild) {
          container.firstChild.remove();
        }
        
        // Add the renderer's canvas
        container.appendChild(renderer.domElement);
        
        // Position camera for mobile view
        camera.position.set(0, 10, 20);
        camera.lookAt(0, 0, 0);
        
        // Render scene
        renderer.render(scene, camera);
      }
      
      return () => window.removeEventListener('resize', resize);
    }
  }, [renderer, camera, scene]);

  const handleImportModel = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        await loadSTL(file);
        toast.success(`Loaded ${file.name}`);
        // Select the newly added model
        selectModel(models.length - 1);
      } catch (error) {
        toast.error("Failed to load model");
      }
    };
    input.click();
  };

  const handleTransform = (operation: string, direction: 1 | -1) => {
    if (selectedModelIndex === null) {
      toast.error("No model selected");
      return;
    }
    applyTransform(operation as any, direction);
  };

  const handleReset = () => {
    if (camera) {
      camera.position.set(0, 10, 20);
      camera.lookAt(0, 0, 0);
      if (renderer) renderer.render(scene, camera);
    }
  };

  const handleSwitchToDesktop = () => {
    // Set sessionStorage flag to skip the mobile warning for this session
    sessionStorage.setItem("temp-use-desktop", "true");
    // Reload the page to get the desktop version
    window.location.reload();
  };

  const closeInstructions = () => {
    setShowInstructions(false);
  };
  
  const closeBanner = () => {
    setShowBanner(false);
  };
  
  const returnToTaiyaki = () => {
    window.location.href = "https://taiyaki.ai";
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col relative">
      {/* The 3D viewport takes the full screen */}
      <div id="mobile-viewport" className="flex-1 w-full">
        {/* Renderer attaches here automatically */}
      </div>

      {/* Persistent banner at the top */}
      {showBanner && (
        <div className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground p-2 flex justify-between items-center z-30">
          <div className="flex items-center text-xs">
            <InfoIcon className="h-3 w-3 mr-1" />
            <span>FishCAD Mobile Viewer (Limited)</span>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={returnToTaiyaki} 
              className="h-6 px-2 text-xs text-primary-foreground"
            >
              <ExternalLinkIcon className="h-3 w-3 mr-1" />
              taiyaki.ai
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={closeBanner} 
              className="h-6 w-6 p-0 text-primary-foreground"
            >
              <XIcon className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-background/70 backdrop-blur-sm z-10">
        <h1 className="text-lg font-bold text-primary">FishCAD</h1>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleSwitchToDesktop} 
          className="flex items-center text-xs"
        >
          <ComputerIcon className="h-3 w-3 mr-1" />
          Switch to Desktop
        </Button>
      </div>
      
      {/* Mobile controls at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
        <Card className="bg-background/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
          <div className="grid grid-cols-4 gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={handleImportModel}>
              <UploadIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleTransform('scaleX', 1)}>
              <ZoomInIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleTransform('scaleX', -1)}>
              <ZoomOutIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full mb-2"
                onClick={() => handleTransform('translateX', -1)}
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="col-span-1 flex flex-col gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleTransform('translateZ', 1)}
              >
                <ArrowUpIcon className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleTransform('translateZ', -1)}
              >
                <ArrowDownIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="col-span-1">
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full mb-2"
                onClick={() => handleTransform('translateX', 1)}
              >
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="text-xs text-center mt-2 text-muted-foreground">
            {models.length > 0 
              ? `${models.length} model(s) - ${selectedModelIndex !== null ? 'Model ' + (selectedModelIndex + 1) + ' selected' : 'No selection'}`
              : 'Tap ↑ to import a 3D model'
            }
          </div>
        </Card>
      </div>
      
      {/* Mobile instructions modal */}
      {showInstructions && (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-4">
          <Card className="max-w-xs p-4 relative">
            <div className="flex items-center mb-2">
              <AlertCircleIcon className="h-5 w-5 text-primary mr-2" />
              <h2 className="text-lg font-bold">FishCAD Mobile Viewer</h2>
            </div>
            
            <p className="text-sm mb-3">
              You're using the simplified mobile viewer with limited functionality.
            </p>
            
            <ul className="text-xs space-y-2 mb-4">
              <li className="flex items-start">
                <Box className="h-3 w-3 mr-1 mt-0.5 text-primary" />
                <span>Touch and drag to rotate the model</span>
              </li>
              <li className="flex items-start">
                <MaximizeIcon className="h-3 w-3 mr-1 mt-0.5 text-primary" />
                <span>Pinch with two fingers to zoom</span>
              </li>
              <li className="flex items-start">
                <UploadIcon className="h-3 w-3 mr-1 mt-0.5 text-primary" />
                <span>Use the buttons to import and move models</span>
              </li>
            </ul>
            
            <div className="flex justify-between gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs flex-1"
                onClick={returnToTaiyaki}
              >
                <ExternalLinkIcon className="h-3 w-3 mr-1" />
                taiyaki.ai
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                className="text-xs flex-1"
                onClick={closeInstructions}
              >
                Continue
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MobileView; 