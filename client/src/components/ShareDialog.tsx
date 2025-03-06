import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Download, Mail, Twitter, Linkedin, Camera, X, Clipboard, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useScene } from "@/hooks/use-scene";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ShareDialog() {
  const { toast } = useToast();
  const { exportSelectedModelAsSTL, selectedModelIndex, models, scene, camera, renderer } = useScene();
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copying, setCopying] = useState(false);

  // Take a screenshot of the current view
  const takeScreenshot = () => {
    if (!renderer) {
      toast({
        title: "Screenshot Failed",
        description: "Unable to capture the viewport",
        variant: "destructive",
      });
      return null;
    }

    try {
      // Preserve the current renderer size
      const originalSize = {
        width: renderer.domElement.width,
        height: renderer.domElement.height
      };

      // Ensure we're rendering at a good resolution for sharing
      renderer.setSize(1920, 1080);
      // Render the scene
      renderer.render(scene, camera);
      
      // Get the data URL from the renderer
      const dataUrl = renderer.domElement.toDataURL('image/png');
      
      // Restore the original size
      renderer.setSize(originalSize.width, originalSize.height);
      renderer.render(scene, camera);

      // Set the screenshot URL for display and sharing
      setScreenshotUrl(dataUrl);

      toast({
        title: "Screenshot Captured",
        description: "Your design has been captured and is ready to share",
      });

      return dataUrl;
    } catch (error) {
      console.error("Error taking screenshot:", error);
      toast({
        title: "Screenshot Failed",
        description: "Failed to capture screenshot",
        variant: "destructive",
      });
      return null;
    }
  };

  // Add this function for copying reminder text to clipboard
  const copyReminderToClipboard = () => {
    const reminderText = "Remember to attach the downloaded screenshot (taiyaki-design-screenshot.png) from your Downloads folder!";
    navigator.clipboard.writeText(reminderText).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
      
      toast({
        title: "Copied to clipboard",
        description: "Reminder text copied. Paste it in your message.",
      });
    }).catch(err => {
      toast({
        title: "Failed to copy",
        description: "Please remember to attach the screenshot manually.",
        variant: "destructive",
      });
    });
  };

  // Add this function for copying the image to clipboard
  const copyImageToClipboard = async () => {
    if (!screenshotUrl) {
      toast({
        title: "No Screenshot",
        description: "Please capture a screenshot first",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert dataURL to blob
      const response = await fetch(screenshotUrl);
      const blob = await response.blob();

      // Try to use the modern clipboard API
      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          [blob.type]: blob
        });
        
        await navigator.clipboard.write([clipboardItem]);
        
        toast({
          title: "Image Copied to Clipboard",
          description: "You can now paste the image directly into your application",
        });
      } else {
        // Fallback for browsers that don't support clipboard.write()
        toast({
          title: "Copy Not Supported",
          description: "Your browser doesn't support copying images. Please use the download option instead.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error copying image to clipboard:", error);
      toast({
        title: "Copy Failed",
        description: "Failed to copy image to clipboard. Try downloading instead.",
        variant: "destructive",
      });
    }
  };

  // Handle sharing via email, Twitter, or LinkedIn
  const handleShare = async (platform: 'email' | 'twitter' | 'linkedin') => {
    // For screenshot sharing, ensure we have a screenshot
    let screenshot = screenshotUrl;
    if (!screenshot) {
      screenshot = takeScreenshot();
      if (!screenshot) return;
    }

    const title = "Check out my 3D model!";
    const text = "Check out my 3D model created with Taiyaki.ai!";
    
    // Try to use Web Share API first if available
    if (navigator.share && platform !== 'email') {
      try {
        // Convert data URL to blob
        const response = await fetch(screenshot);
        const blob = await response.blob();
        const file = new File([blob], "taiyaki-design-screenshot.png", { type: "image/png" });
        
        await navigator.share({
          title: title,
          text: text,
          files: [file]
        });
        
        toast({
          title: "Shared Successfully",
          description: "Your screenshot has been shared!",
        });
        
        return;
      } catch (error) {
        console.error("Error using Web Share API:", error);
        // Fall back to clipboard copy method
      }
    }
    
    // For all platforms, try to copy the image to clipboard first
    if (navigator.clipboard && navigator.clipboard.write) {
      try {
        // Convert data URL to blob
        const response = await fetch(screenshot);
        const blob = await response.blob();
        
        // Copy image to clipboard
        const clipboardItem = new ClipboardItem({
          [blob.type]: blob
        });
        
        await navigator.clipboard.write([clipboardItem]);
        
        let shareUrl = '';
        let description = '';
        
        switch (platform) {
          case 'email':
            shareUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}%0A%0A(Paste the screenshot from your clipboard)`;
            description = "Paste the image into your email after your email client opens";
            break;
          case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
            description = "Paste the image when composing your tweet";
            break;
          case 'linkedin':
            shareUrl = `https://www.linkedin.com/sharing/share-offsite/`;
            description = "Paste the image when composing your LinkedIn post";
            break;
        }
        
        toast({
          title: "Image Copied to Clipboard",
          description: description,
        });
        
        // Open sharing platform
        if (platform === 'email') {
          window.location.href = shareUrl;
        } else {
          window.open(shareUrl, '_blank', 'width=600,height=400');
        }
        
        return;
      } catch (error) {
        console.error(`Error copying image to clipboard for ${platform}:`, error);
        // Continue with traditional method as fallback
      }
    }
    
    // Traditional sharing method as fallback (download + open)
    const link = document.createElement('a');
    link.href = screenshot;
    link.download = 'taiyaki-design-screenshot.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    let shareUrl = '';
    switch (platform) {
      case 'email':
        // For email, provide clearer instructions
        shareUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}%0A%0A(Please attach the downloaded screenshot manually)`;
        
        toast({
          title: "Screenshot Downloaded",
          description: "Please attach the downloaded image to your email manually after the email client opens.",
          action: (
            <Button variant="outline" size="sm" onClick={copyReminderToClipboard}>
              {copying ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            </Button>
          ),
        });
        break;
      case 'twitter': // X/Twitter
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        
        toast({
          title: "Screenshot Downloaded",
          description: "Please attach the downloaded image when composing your tweet.",
          action: (
            <Button variant="outline" size="sm" onClick={copyReminderToClipboard}>
              {copying ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            </Button>
          ),
        });
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/`;
        
        toast({
          title: "Screenshot Downloaded",
          description: "Please attach the downloaded image when composing your LinkedIn post.",
          action: (
            <Button variant="outline" size="sm" onClick={copyReminderToClipboard}>
              {copying ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            </Button>
          ),
        });
        break;
    }
    
    if (platform === 'email') {
      window.location.href = shareUrl;
    } else {
      window.open(shareUrl, '_blank', 'width=600,height=400');
    }
  };

  // Handle model export
  const handleExport = () => {
    if (selectedModelIndex === null) {
      toast({
        title: "No model selected",
        description: "Please select a model to export",
        variant: "destructive",
      });
      return;
    }

    try {
      const blob = exportSelectedModelAsSTL();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const modelName = models[selectedModelIndex].name || 'model';
        const safeModelName = modelName.replace(/[^\w\-\.]/g, '_');
        link.download = `${safeModelName}.stl`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: "Export Successful",
          description: "Model exported as STL",
        });
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export the model",
        variant: "destructive",
      });
    }
  };

  // Download screenshot
  const handleDownloadScreenshot = () => {
    if (!screenshotUrl) {
      const newScreenshotUrl = takeScreenshot();
      if (!newScreenshotUrl) return;
    }
    
    const link = document.createElement('a');
    link.href = screenshotUrl || '';
    link.download = 'taiyaki-design-screenshot.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Screenshot Downloaded",
      description: "Your design screenshot has been saved",
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-10 w-10 md:h-8 md:w-8">
          <Share2 className="h-5 w-5 md:h-4 md:w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[425px] p-4" align="end">
        <div className="space-y-4">
          <h4 className="font-medium leading-none mb-2">Share & Export</h4>
          <Tabs defaultValue="screenshot" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="screenshot">Share Screenshot</TabsTrigger>
              <TabsTrigger value="export">Export STL</TabsTrigger>
            </TabsList>
            
            <TabsContent value="screenshot" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Share a screenshot of your current design view.</p>
                </div>
                
                <div className="flex justify-center mb-2">
                  {screenshotUrl ? (
                    <div className="relative w-full border rounded-md overflow-hidden">
                      <img 
                        src={screenshotUrl} 
                        alt="Design Screenshot" 
                        className="w-full h-auto max-h-48 object-contain"
                      />
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-1 right-1 h-6 w-6 bg-background/80 rounded-full hover:bg-background"
                        onClick={() => setScreenshotUrl(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={takeScreenshot} className="w-full">
                      <Camera className="mr-2 h-4 w-4" />
                      Capture Screenshot
                    </Button>
                  )}
                </div>
                
                {screenshotUrl && (
                  <>
                    <div className="flex space-x-2 mb-2">
                      <Button onClick={handleDownloadScreenshot} className="flex-1">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                      <Button onClick={copyImageToClipboard} className="flex-1">
                        <Clipboard className="mr-2 h-4 w-4" />
                        Copy Image
                      </Button>
                    </div>
                    
                    <p className="text-xs text-muted-foreground text-center mb-2">
                      Clicking the options below will copy the image to your clipboard and open the sharing platform.
                    </p>
                    
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleShare('email')}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Email
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleShare('twitter')}
                      >
                        <Twitter className="mr-2 h-4 w-4" />
                        X/Twitter
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleShare('linkedin')}
                      >
                        <Linkedin className="mr-2 h-4 w-4" />
                        LinkedIn
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="export" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Export your model in STL format, compatible with most 3D printing software.</p>
                </div>
                
                <Button
                  className="w-full"
                  onClick={handleExport}
                  disabled={selectedModelIndex === null}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export as STL
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </PopoverContent>
    </Popover>
  );
} 