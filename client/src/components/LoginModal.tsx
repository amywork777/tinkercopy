import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from '@/context/AuthContext';
import { Lock, Loader2, X, RefreshCw, AlertCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { scheduleRefresh } from '@/lib/firebase';
import { toast } from 'sonner';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, isAuthenticating, resetAuthState } = useAuth();
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [authStuckTimer, setAuthStuckTimer] = useState<number | null>(null);
  const [authDuration, setAuthDuration] = useState(0);
  const [authStartTime, setAuthStartTime] = useState<number | null>(null);

  // Track authentication duration to show appropriate UI
  useEffect(() => {
    let timer: number | null = null;
    
    if (isAuthenticating) {
      // Set start time when authentication begins
      if (authStartTime === null) {
        setAuthStartTime(Date.now());
      }
      
      // Start a timer to update duration every second
      timer = window.setInterval(() => {
        if (authStartTime) {
          const duration = Math.floor((Date.now() - authStartTime) / 1000);
          setAuthDuration(duration);
        }
      }, 1000);
    } else {
      // Reset when not authenticating
      setAuthStartTime(null);
      setAuthDuration(0);
      setShowTroubleshooting(false);
      
      // Clear the timer
      if (timer) {
        window.clearInterval(timer);
      }
    }
    
    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [isAuthenticating, authStartTime]);

  // Show troubleshooting UI after delay
  useEffect(() => {
    // Show troubleshooting section if auth takes too long
    if (isAuthenticating && authDuration > 12 && !showTroubleshooting) {
      setShowTroubleshooting(true);
    }
  }, [isAuthenticating, authDuration, showTroubleshooting]);

  // Start timer to show troubleshooting after delay
  const handleLogin = () => {
    login();
    
    // Clear any existing timer
    if (authStuckTimer) {
      window.clearTimeout(authStuckTimer);
    }
    
    // After 30 seconds, offer to refresh the page
    const timerId = window.setTimeout(() => {
      if (isAuthenticating) {
        // If still authenticating after 30 seconds, consider refreshing the page
        toast.error("Sign-in is taking too long", {
          description: "Would you like to refresh the page and try again?",
          action: {
            label: "Refresh",
            onClick: () => scheduleRefresh(500)
          },
          duration: 10000
        });
      }
    }, 30000);
    
    setAuthStuckTimer(timerId);
  };
  
  const handleCancel = () => {
    // Clear timer if exists
    if (authStuckTimer) {
      window.clearTimeout(authStuckTimer);
      setAuthStuckTimer(null);
    }
    
    resetAuthState();
    setShowTroubleshooting(false);
    onClose();
  };
  
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          // Clear timer if exists
          if (authStuckTimer) {
            window.clearTimeout(authStuckTimer);
            setAuthStuckTimer(null);
          }
          
          if (isAuthenticating) {
            // If dialog is closing while authentication is in progress,
            // we should reset the auth state
            resetAuthState();
          }
          
          setShowTroubleshooting(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div className="absolute -z-10 inset-0 bg-gradient-to-tr from-primary/5 to-secondary/5 rounded-lg" />
        
        <DialogHeader className="space-y-3">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl text-center">Sign in to FishCAD</DialogTitle>
          <DialogDescription className="text-center px-4">
            Please sign in with Google to continue
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <div className="flex justify-center">
            <Button 
              onClick={handleLogin} 
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              disabled={isAuthenticating}
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Signing in... {authDuration > 5 ? `(${authDuration}s)` : ''}</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                    <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                      <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                      <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                      <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                      <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                    </g>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </Button>
          </div>
          
          {/* Show troubleshooting or cancel button depending on state */}
          {isAuthenticating && (
            <div className="text-center space-y-2">
              {showTroubleshooting ? (
                <div className="bg-muted/50 p-3 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">Sign in taking longer than expected ({authDuration}s)</p>
                  </div>
                  
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="troubleshooting">
                      <AccordionTrigger className="text-sm py-2">
                        <span>Troubleshooting options</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 py-2">
                          <p className="text-sm text-muted-foreground">
                            Try these solutions:
                          </p>
                          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                            <li>Check if pop-ups are blocked in your browser</li>
                            <li>Try using a different browser</li>
                            <li>Clear browser cookies and cache</li>
                            <li>Disable extensions that might interfere with sign-in</li>
                          </ul>
                          <div className="pt-2 space-x-2 flex items-center justify-center">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={handleReload}
                              className="flex items-center gap-1"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Reload Page</span>
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={handleCancel}
                              className="flex items-center gap-1"
                            >
                              <X className="h-3 w-3" />
                              <span>Cancel</span>
                            </Button>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Google sign-in window should appear shortly
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={handleCancel}
                    className="mt-2"
                    size="sm"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Sign-in
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter className="sm:justify-start">
          <div className="w-full text-center sm:text-left text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 