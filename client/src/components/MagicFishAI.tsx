import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function MagicFishAI() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { toast } = useToast();

  // Add error handling for the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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
  }, [toast]);

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
          <CardTitle className="text-lg">Taiyaki AI</CardTitle>
          <CardDescription>Create and edit 3D models using AI</CardDescription>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-5rem)]">
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
        </CardContent>
      </Card>
    </div>
  );
} 