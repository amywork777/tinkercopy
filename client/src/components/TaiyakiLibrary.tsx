import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Crown, Info } from "lucide-react";
import { useSubscription } from '@/context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TaiyakiLibrary() {
  const [isLoading, setIsLoading] = useState(true);
  const { subscription, hasAccess } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Listen for download requests from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from the library iframe origin
      if (event.origin !== "https://library.taiyaki.ai") return;
      
      try {
        if (event.data && typeof event.data === 'object') {
          // If this is a download request
          if (event.data.type === 'download_stl') {
            // Check if user has Pro access
            if (!subscription.isPro) {
              // Block download if not a Pro user
              toast({
                title: "Pro Feature",
                description: "STL downloads are available for Pro users only. Upgrade to download.",
                variant: "default",
              });
              
              // Respond to iframe that download is not allowed
              if (iframeRef.current && iframeRef.current.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                  { type: 'download_blocked', requiresUpgrade: true },
                  "https://library.taiyaki.ai"
                );
              }
              
              // Ask if they want to upgrade
              if (window.confirm("STL downloads are a Pro feature. Would you like to upgrade?")) {
                navigate('/pricing');
              }
              
              return;
            }
            
            // If Pro user, allow the download
            if (iframeRef.current && iframeRef.current.contentWindow) {
              iframeRef.current.contentWindow.postMessage(
                { type: 'download_allowed' },
                "https://library.taiyaki.ai"
              );
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
  }, [subscription.isPro, toast, navigate]);

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-1 relative overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-lg">Taiyaki Library</CardTitle>
              <CardDescription>Browse and import models from the Taiyaki library</CardDescription>
            </div>
            {subscription.isPro && (
              <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full flex items-center">
                <Crown className="h-3 w-3 mr-1" />
                Pro
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-7rem)]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading Taiyaki Library...</span>
            </div>
          )}
          <iframe 
            ref={iframeRef}
            src="https://library.taiyaki.ai"
            className="w-full h-full border-0"
            title="Taiyaki Library"
            onLoad={() => setIsLoading(false)}
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
          />
        </CardContent>
        <CardFooter className="pt-3 pb-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center text-xs text-muted-foreground">
                  <Info className="h-3 w-3 mr-1" />
                  {subscription.isPro 
                    ? "Pro users can download STL files directly" 
                    : "STL downloads require Pro subscription"}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  {subscription.isPro 
                    ? "As a Pro user, you can download any model as STL directly from the library" 
                    : "You can use models in the editor, but STL downloads require a Pro subscription"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {!subscription.isPro && (
            <Button 
              variant="outline"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => navigate('/pricing')}
            >
              <Crown className="h-3 w-3 mr-1" />
              Upgrade to Pro
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
} 