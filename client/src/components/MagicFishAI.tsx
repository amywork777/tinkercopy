import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, AlertCircle, Crown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from '@/context/SubscriptionContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FEATURES } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MagicFishAI() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showLimitReachedDialog, setShowLimitReachedDialog] = useState(false);
  const { toast } = useToast();
  const { hasAccess, subscription, decrementModelCount } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Calculate model limits and percentages
  const modelLimit = subscription.isPro ? 20 : 3;
  const modelsRemaining = subscription.modelsRemainingThisMonth;
  const modelsUsed = modelLimit - modelsRemaining;
  const usagePercent = Math.min(100, Math.round((modelsUsed / modelLimit) * 100));

  // Add event handler for the iframe messages, including generation count
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Only handle messages from the iframe origin
      if (event.origin !== "https://magic.taiyaki.ai") return;
      
      console.log('Received message from Taiyaki AI:', event.data);
      
      try {
        // Check if the message indicates an error
        if (event.data && typeof event.data === 'object' && event.data.type === 'error') {
          console.error('Error from Taiyaki AI iframe:', event.data.message);
          toast({
            title: "Taiyaki AI Error",
            description: "There was an issue with the AI service. Please try again later.",
            variant: "destructive",
          });
          return;
        }
        
        // Track model generation when a model is created
        if (event.data && typeof event.data === 'object' && 
            (event.data.type === 'generation_complete' || 
             event.data.type === 'modelGenerated' || 
             event.data.action === 'modelGenerated')) {
          console.log('Model generation completed');
          
          // Decrement the available count
          const success = await decrementModelCount();
          
          if (!success && !subscription.isPro) {
            // If decrement failed and user is not pro, show limit reached message
            toast({
              title: "Generation Limit Reached",
              description: "You've reached your monthly limit of 3 generations as a free user.",
              variant: "destructive",
            });
            
            // Show the dialog instead of a confirm dialog
            setShowLimitReachedDialog(true);
          } else {
            // Successful generation
            toast({
              title: "Model Generated",
              description: `You have ${modelsRemaining - 1} generations remaining this month.`,
              variant: "default",
            });
          }
        }
      } catch (error) {
        console.error('Error processing message from iframe:', error);
      }
    };

    // Add event listener for messages from the iframe
    window.addEventListener('message', handleMessage);
    
    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [toast, decrementModelCount, subscription.isPro, navigate, modelsRemaining]);

  // Configure iframe on load
  useEffect(() => {
    const configureIframe = () => {
      const iframe = document.querySelector('iframe[src="https://magic.taiyaki.ai"]') as HTMLIFrameElement;
      if (!iframe || !iframe.contentWindow) return;
      
      try {
        // Send subscription status to iframe
        iframe.contentWindow.postMessage(
          { 
            type: 'configure', 
            isPro: subscription.isPro,
            modelsRemaining: modelsRemaining,
            modelLimit: modelLimit
          },
          "https://magic.taiyaki.ai"
        );
        
        console.log('Sent configuration to Taiyaki AI:', { 
          isPro: subscription.isPro,
          modelsRemaining,
          modelLimit
        });
      } catch (error) {
        console.error('Error configuring iframe:', error);
      }
    };
    
    // Configure iframe when it loads
    if (!isLoading && !hasError) {
      configureIframe();
    }
  }, [isLoading, hasError, subscription.isPro, modelsRemaining, modelLimit]);

  // Handle iframe load errors
  const handleIframeError = () => {
    setHasError(true);
    setIsLoading(false);
    toast({
      title: "Connection Error",
      description: "Could not connect to Taiyaki AI service. Please try again later.",
      variant: "destructive",
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-1 relative overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-lg">Taiyaki AI</CardTitle>
              <CardDescription>Create and edit 3D models using AI</CardDescription>
            </div>
            {subscription.isPro && (
              <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full flex items-center">
                <Crown className="h-3 w-3 mr-1" />
                Pro
              </span>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-0 h-[calc(100%-9rem)]">
          {/* Show the AI interface for everyone, but track usage limits */}
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading Taiyaki AI...</span>
            </div>
          )}
          
          {hasError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 p-4 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Connection Error</h3>
              <p className="text-muted-foreground mb-4">Could not connect to the Taiyaki AI service. The service might be temporarily unavailable.</p>
              <Button onClick={() => {
                setIsLoading(true);
                setHasError(false);
                // Force iframe to reload
                const iframe = document.querySelector('iframe[src="https://magic.taiyaki.ai"]') as HTMLIFrameElement;
                if (iframe) {
                  iframe.src = iframe.src;
                }
              }}>
                Try Again
              </Button>
            </div>
          ) : (
            <iframe 
              src="https://magic.taiyaki.ai"
              className="w-full h-full border-0"
              title="Taiyaki AI"
              onLoad={() => setIsLoading(false)}
              onError={handleIframeError}
              allow="microphone; clipboard-write; camera; clipboard-read; display-capture"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals allow-presentation allow-popups-to-escape-sandbox"
            />
          )}

          {/* Show a warning overlay when generation limit is reached */}
          {!subscription.isPro && modelsRemaining <= 0 && !isLoading && !hasError && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 p-6 text-center">
              <Crown className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-lg font-medium mb-2">Generation Limit Reached</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                You've used all {modelLimit} of your free AI generations this month. 
                Upgrade to Pro for {subscription.isPro ? 20 : 17} more generations per month!
              </p>
              <Button onClick={() => navigate('/pricing')}>
                Upgrade to Pro
              </Button>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="pt-3 pb-3 flex flex-col">
          <div className="w-full mb-1">
            <div className="flex justify-between items-center text-xs mb-1">
              <span>Model Generations</span>
              <span className="font-medium">{modelsRemaining}/{modelLimit} remaining</span>
            </div>
            <Progress value={usagePercent} className="h-2" />
          </div>
          
          <div className="flex items-center w-full mt-2 justify-between">
            <div className="flex items-center text-xs text-muted-foreground">
              <Info className="h-3 w-3 mr-1" />
              {subscription.isPro 
                ? "Pro: 20 generations per month" 
                : "Free: 3 generations per month"}
            </div>
            
            {!subscription.isPro && (
              <>
                <Button 
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => navigate('/pricing')}
                >
                  <Crown className="h-3 w-3 mr-1" />
                  Upgrade to Pro
                </Button>
              </>
            )}
          </div>

          {!subscription.isPro && (
            <div className="w-full mt-2">
              <div className="flex items-center gap-1 bg-primary/10 text-primary text-xs p-2 rounded">
                <Crown className="h-3 w-3 shrink-0" />
                <p className="text-xs">
                  <span className="font-semibold">Free Account:</span> You have access to the AI model generation tool, but are limited to 3 generations per month. Upgrade to Pro for 20 generations monthly.
                </p>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>

      {/* Limit reached dialog */}
      <Dialog open={showLimitReachedDialog} onOpenChange={setShowLimitReachedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generation Limit Reached</DialogTitle>
            <DialogDescription>
              You've used all {modelLimit} of your free AI generations this month. 
              Upgrade to Pro for {subscription.isPro ? 20 : 17} more generations!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitReachedDialog(false)}>
              Maybe Later
            </Button>
            <Button onClick={() => {
              setShowLimitReachedDialog(false);
              navigate('/pricing');
            }}>
              Upgrade to Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 