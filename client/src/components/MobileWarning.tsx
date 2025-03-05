import React, { useEffect, useState } from "react";
import { ComputerIcon, SmartphoneIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MobileWarning: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check localStorage first for user preference
    const hasUserDismissed = localStorage.getItem("mobile-warning-dismissed");
    if (hasUserDismissed === "true") {
      setDismissed(true);
    }

    // More comprehensive mobile detection
    const checkMobile = () => {
      // Get user agent string
      const userAgent = 
        navigator.userAgent || navigator.vendor || (window as any).opera;
      
      // Check for mobile width (less than 768px is typically considered mobile)
      const isMobileWidth = window.innerWidth < 768;
      
      // Check for mobile user agent patterns
      const isMobileUserAgent = 
        /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent.toLowerCase()
        );
      
      // Check for touch capability (most mobile devices have touch)
      const hasTouchCapability = 
        'ontouchstart' in window || 
        navigator.maxTouchPoints > 0 || 
        (navigator as any).msMaxTouchPoints > 0;
        
      // Consider tablets as mobile for this warning too (include iPad)
      const isTablet = 
        /ipad/i.test(userAgent.toLowerCase()) ||
        (/tablet|ipad/i.test(userAgent.toLowerCase()) && !(/mobile/i.test(userAgent.toLowerCase())));
      
      // Set as mobile if any of these conditions are true
      setIsMobile(isMobileWidth || isMobileUserAgent || isTablet || (hasTouchCapability && isMobileWidth));
    };

    // Check immediately on mount
    checkMobile();

    // Check again if window is resized
    window.addEventListener("resize", checkMobile);
    
    // Clean up event listener
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Dismiss the warning and remember the choice
  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("mobile-warning-dismissed", "true");
  };

  // User clicked the "continue to desktop version" button
  const handleContinue = () => {
    // Just dismiss without saving preference so it shows again next visit
    setDismissed(true);
  };

  if (!isMobile || dismissed) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-card shadow-lg rounded-lg p-6 max-w-md flex flex-col items-center space-y-4 border relative">
        {/* Close button */}
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="flex items-center space-x-3 mb-2">
          <SmartphoneIcon className="h-8 w-8 text-destructive" />
          <span className="text-xl font-bold">Mobile Device Detected</span>
        </div>
        
        <p className="text-md mb-2">
          This CAD application requires a computer for the best experience.
        </p>
        
        <div className="bg-muted p-4 rounded-md mb-2">
          <p className="text-sm">
            CAD modeling requires precise inputs and interactions that are 
            difficult on mobile devices. For the full functionality and best experience, 
            please use a desktop or laptop computer.
          </p>
        </div>
        
        <div className="flex items-center justify-center my-2">
          <SmartphoneIcon className="h-10 w-10 text-destructive mx-4" />
          <span className="text-xl">→</span>
          <ComputerIcon className="h-12 w-12 text-primary mx-4" />
        </div>
        
        <div className="flex flex-col w-full space-y-2 mt-2">
          <Button onClick={handleContinue} variant="default">
            Continue to Desktop Version Anyway
          </Button>
          
          <Button onClick={handleDismiss} variant="outline">
            Don't Show Again
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MobileWarning; 