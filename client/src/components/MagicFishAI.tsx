import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, AlertCircle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from '@/context/SubscriptionContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FEATURES } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import RequireSubscription from './RequireSubscription';

export function MagicFishAI() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
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
        if (event.data && typeof event.data === 'object' && event.data.type === 'generation_complete') {
          console.log('Model generation completed');
          
          // Decrement the available count
          const success = await decrementModelCount();
          if (!success && !subscription.isPro) {
            // If decrement failed and user is not pro, show limit reached message
            toast({
              title: "Generation Limit Reached",
              description: "You've reached your monthly limit. Upgrade to Pro for more generations.",
              variant: "destructive",
            });
            
            // Optionally redirect to pricing page
            if (window.confirm("You've reached your model generation limit. View Pro subscription options?")) {
              navigate('/pricing');
            }
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
  }, [toast, decrementModelCount, subscription.isPro, navigate]);

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
          {/* Check if user has access to model generation */}
          <RequireSubscription feature="MODEL_GENERATION">
            <>
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
            </>
          </RequireSubscription>
        </CardContent>
        
        <CardFooter className="pt-3 pb-3 flex flex-col">
          <div className="w-full mb-1">
            <div className="flex justify-between items-center text-xs mb-1">
              <span>Model Generations</span>
              <span className="font-medium">{modelsRemaining}/{modelLimit} remaining</span>
            </div>
            <Progress value={usagePercent} className="h-2" />
          </div>
          
          {!subscription.isPro && modelsRemaining < 2 && (
            <div className="w-full mt-2">
              <Button 
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => navigate('/pricing')}
              >
                {modelsRemaining === 0 
                  ? "Upgrade to Pro for More Generations" 
                  : "Running Low - Upgrade to Pro"}
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
} 