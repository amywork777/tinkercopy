import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Crown, Info, Lock } from "lucide-react";
import { useSubscription } from '@/context/SubscriptionContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import { FEATURES } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';

export function TaiyakiLibrary() {
  const [isLoading, setIsLoading] = useState(true);
  const { subscription, hasAccess, decrementModelCount, refreshSubscription } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Display subscription status for debugging
  useEffect(() => {
    console.log('TaiyakiLibrary - Current subscription status:', {
      isPro: subscription.isPro,
      status: subscription.subscriptionStatus,
      plan: subscription.subscriptionPlan,
      loading: subscription.loading
    });
    
    // Force refresh subscription data when component loads
    if (user && user.id) {
      console.log('Forcing subscription refresh in TaiyakiLibrary');
      refreshSubscription().then(() => {
        console.log('Subscription refreshed in TaiyakiLibrary, new status:', {
          isPro: subscription.isPro,
          status: subscription.subscriptionStatus,
          plan: subscription.subscriptionPlan
        });
      }).catch(err => {
        console.error('Error refreshing subscription in TaiyakiLibrary:', err);
      });
    }
  }, [user, refreshSubscription]);
  
  // Calculate model limits and percentages (reuse the same counters as AI)
  const modelLimit = subscription.isPro ? 20 : 2;
  const modelsRemaining = subscription.modelsRemainingThisMonth;
  const modelsUsed = modelLimit - modelsRemaining;
  const usagePercent = Math.min(100, Math.round((modelsUsed / modelLimit) * 100));
  
  // Configure iframe for downloads - this is the critical part for enabling downloads
  const configureIframe = () => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    
    try {
      console.log('🔄 Configuring Taiyaki Library iframe');
      
      // Only enable downloads for pro users
      // For free users, we'll still allow viewing but not interaction
      iframeRef.current.contentWindow.postMessage(
        { 
          type: 'configure', 
          isPro: subscription.isPro, // Set based on subscription status
          disableDownloads: !subscription.isPro, // Disable downloads for non-pro users
          allowDownloads: subscription.isPro, // Only allow downloads for pro users
          enableDownloads: subscription.isPro, // Only enable downloads for pro users
          downloadEnabled: subscription.isPro, // Only enable downloads for pro users
          modelsRemaining: modelsRemaining,
          modelLimit: modelLimit,
          userId: user?.id || '',
          subscriptionPlan: subscription.subscriptionPlan || 'free',
          debug: true // Enable debug mode
        },
        "https://library.taiyaki.ai"
      );
      
      console.log('✅ Configuration message sent to Taiyaki Library');
    } catch (error) {
      console.error('❌ Error configuring iframe:', error);
    }
  };
  
  // Use multiple useEffects to ensure downloads work
  useEffect(() => {
    // Configure iframe when it's ready
    if (!isLoading && iframeRef.current) {
      console.log('🔧 Initial iframe configuration');
      configureIframe();
      
      // Try again after a delay to ensure it's received
      setTimeout(configureIframe, 1000);
      setTimeout(configureIframe, 3000);
    }
  }, [isLoading, subscription.isPro, modelsRemaining, modelLimit, user?.id, subscription.subscriptionPlan]);
  
  // Add a separate effect to reconfigure on subscription changes
  useEffect(() => {
    if (iframeRef.current && !isLoading) {
      console.log('🔄 Reconfiguring iframe due to subscription change');
      configureIframe();
    }
  }, [subscription.isPro, subscription.subscriptionPlan]);
  
  // Enhanced direct download function
  const directDownloadFromUrl = async (downloadUrl: string, fileName: string) => {
    console.log('📥 Starting direct download', { downloadUrl, fileName });
    
    if (!user?.id) {
      console.error('❌ No user ID available for download authentication');
      toast({
        title: "Download Failed",
        description: "You must be logged in to download files.",
        variant: "destructive",
      });
      return false;
    }
    
    try {
      // Create a proxy URL that includes user authentication
      const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(downloadUrl)}&userId=${user.id}`;
      console.log('🔗 Using proxy URL:', proxyUrl);
      
      // Use fetch to get the file through the proxy
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Server returned ${response.status}: ${errorText}`);
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      // Get the blob data
      const blob = await response.blob();
      console.log('✅ Received file data, size:', blob.size);
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a link element and trigger the download
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }, 100);
      
      toast({
        title: "Download Started",
        description: `Your file "${fileName}" is being downloaded.`,
        variant: "default",
      });
      
      console.log('✅ Download process completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Download failed:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "There was a problem downloading the file.",
        variant: "destructive",
      });
      return false;
    }
  };
  
  // Enhanced message handler for downloads
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Only handle messages from the library iframe origin
      if (event.origin !== "https://library.taiyaki.ai") return;
      
      console.log('📨 Received message from Taiyaki Library:', event.data);
      
      try {
        if (event.data && typeof event.data === 'object') {
          // Handle all possible download-related messages
          if (
            event.data.type === 'download_stl' || 
            event.data.type === 'download' || 
            event.data.action === 'download' ||
            event.data.type === 'download_request' ||
            event.data.type === 'download_model' ||
            (event.data.action === 'message' && event.data.message?.includes('download')) ||
            (event.data.message && typeof event.data.message === 'string' && event.data.message.includes('download'))
          ) {
            console.log('🔄 Download requested - processing now', event.data);
            
            // Only allow downloads for pro users, otherwise show a toast prompting upgrade
            if (!subscription.isPro) {
              console.log('⛔ Download blocked - user does not have Pro subscription');
              // Remove the toast notification
              
              // Send a message to deny the download
              if (iframeRef.current && iframeRef.current.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                  { 
                    type: 'download_denied',
                    reason: 'pro_required',
                    message: 'Pro subscription required for downloads'
                  },
                  "https://library.taiyaki.ai"
                );
              }
              return;
            }
            
            // Allow downloads for pro users
            if (iframeRef.current && iframeRef.current.contentWindow) {
              console.log('✅ Sending download_allowed message back to iframe');
              iframeRef.current.contentWindow.postMessage(
                { 
                  type: 'download_allowed',
                  allowDownload: true,
                  downloadUrl: event.data.downloadUrl || event.data.url,
                  fileName: event.data.fileName || 'download.stl',
                  isPro: true, // Always send true to enable downloads
                  status: 'approved'
                },
                "https://library.taiyaki.ai"
              );
              
              // Send a second more general approval message
              iframeRef.current.contentWindow.postMessage(
                { 
                  type: 'allow_download',
                  allowed: true,
                  status: 'approved'
                },
                "https://library.taiyaki.ai"
              );
            }
            
            // Use our own download method if URL is available
            if (event.data.downloadUrl || event.data.url) {
              const downloadUrl = event.data.downloadUrl || event.data.url;
              const fileName = event.data.fileName || 'taiyaki-model.stl';
              
              console.log('📥 Initiating direct download', { downloadUrl, fileName });
              await directDownloadFromUrl(downloadUrl, fileName);
            } else {
              console.log('⚠️ No download URL provided in the message:', event.data);
            }
          }
          
          // Handle other messages like "clicked on download button" events
          if (event.data.action === 'message' && 
              (event.data.message?.includes('clicked on download') || 
               event.data.message?.includes('download button'))) {
            console.log('🖱️ Download button clicked in iframe');
            // Immediately reconfigure to ensure downloads are enabled
            configureIframe();
          }
        }
      } catch (error) {
        console.error('❌ Error handling message from Taiyaki Library:', error);
      }
    };
    
    // Add the event listener
    window.addEventListener('message', handleMessage);
    
    // Return cleanup function
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [user?.id, subscription.isPro, directDownloadFromUrl]);

  // This function will monitor download attempts directly for browser downloads
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // If a free user attempts to download, we should prevent it
      if (!subscription.isPro && event.target !== window && modelsRemaining <= 0) {
        // We don't show a notification anymore
        console.log('Download attempt by non-pro user detected in beforeunload');
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [subscription.isPro, modelsRemaining]);

  // Function to handle upgrade button click
  const handleUpgradeClick = () => {
    console.log('Upgrade to Pro button clicked, navigating to pricing page');
    navigate('/pricing');
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-1 relative overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-lg">Taiyaki Library</CardTitle>
              <CardDescription>
                Browse and download models from the Taiyaki library
              </CardDescription>
            </div>
            {subscription.isPro && (
              <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full flex items-center">
                <Crown className="h-3 w-3 mr-1" />
                Pro
              </span>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-0 h-[calc(100%-12rem)]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading Taiyaki Library...</span>
            </div>
          )}

          {/* Transparent overlay for non-Pro users that prevents interaction but allows viewing */}
          {!subscription.isPro && !isLoading && (
            <div 
              className="absolute inset-0 z-20 pointer-events-auto cursor-not-allowed" 
              style={{ background: 'transparent' }}
              onClick={() => {
                // Navigate to pricing page directly on first click
                console.log('Library overlay clicked, navigating to pricing page');
                navigate('/pricing');
              }}
            />
          )}
          
          <iframe 
            ref={iframeRef}
            src="https://library.taiyaki.ai"
            className="w-full h-full border-0"
            title="Taiyaki Library"
            onLoad={() => {
              console.log('Taiyaki Library iframe loaded');
              setIsLoading(false);
              
              // Force refresh subscription when iframe loads
              if (user && user.id) {
                refreshSubscription();
              }
              
              // Configure the iframe immediately after load
              setTimeout(configureIframe, 500);
            }}
            allow="clipboard-write; clipboard-read; downloads; fullscreen; display-capture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals allow-presentation allow-popups-to-escape-sandbox"
          />
        </CardContent>
        
        <CardFooter className="p-3 flex-col" style={{minHeight: "80px"}}>
          {/* Pro feature indicator */}
          <div className="w-full flex items-center justify-center">
            {subscription.isPro ? (
              <div className="flex items-center">
                <Info className="h-3 w-3 text-muted-foreground mr-1" />
                <span className="text-xs text-muted-foreground">
                  {subscription.trialActive 
                    ? "Pro Trial: Enjoy full access during your trial period" 
                    : "Pro Feature: Full access to Taiyaki Library"}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-xs text-muted-foreground">Upgrade to Pro for full access to the library</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs z-30" // Add z-30 to ensure it's above the overlay
                  onClick={handleUpgradeClick}
                >
                  <Crown className="h-3 w-3 mr-1" />
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
} 