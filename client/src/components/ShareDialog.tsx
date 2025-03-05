import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Download, Mail, Twitter, Linkedin, Camera, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useScene } from "@/hooks/use-scene";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ShareDialog() {
  const { toast } = useToast();
  const { exportSelectedModelAsSTL, selectedModelIndex, models, scene, camera, renderer } = useScene();
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle sharing via email, Twitter, or LinkedIn
  const handleShare = async (platform: 'email' | 'twitter' | 'linkedin') => {
    // For screenshot sharing, ensure we have a screenshot
    let screenshot = screenshotUrl;
    if (!screenshot) {
      screenshot = takeScreenshot();
      if (!screenshot) return;
    }

    const title = "Check out my 3D model!";
    const text = encodeURIComponent("Check out my 3D model created with Taiyaki.ai!");
    
    let shareUrl = '';
    switch (platform) {
      case 'email':
        // For emails with screenshots, we'll prepare the image for download
        // since most email clients don't support direct image sharing via mailto:
        const link = document.createElement('a');
        link.href = screenshot;
        link.download = 'taiyaki-design-screenshot.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Then open an email with link
        shareUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${text}%0A%0A(Screenshot attached)`;
        break;
      case 'twitter': // X/Twitter
        // For screenshots, we need to download them first since Twitter doesn't support direct image URLs
        const twitterLink = document.createElement('a');
        twitterLink.href = screenshot;
        twitterLink.download = 'taiyaki-design-screenshot.png';
        document.body.appendChild(twitterLink);
        twitterLink.click();
        document.body.removeChild(twitterLink);
        
        shareUrl = `https://twitter.com/intent/tweet?text=${text}`;
        
        toast({
          title: "Screenshot Downloaded",
          description: "Upload the downloaded image to X/Twitter when the share page opens",
        });
        break;
      case 'linkedin':
        // For screenshots, download first since LinkedIn doesn't support direct image URLs
        const linkedinLink = document.createElement('a');
        linkedinLink.href = screenshot;
        linkedinLink.download = 'taiyaki-design-screenshot.png';
        document.body.appendChild(linkedinLink);
        linkedinLink.click();
        document.body.removeChild(linkedinLink);
        
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/`;
        
        toast({
          title: "Screenshot Downloaded",
          description: "Upload the downloaded image to LinkedIn when the share page opens",
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
                    <Button onClick={handleDownloadScreenshot} className="w-full mb-2">
                      <Download className="mr-2 h-4 w-4" />
                      Download Screenshot
                    </Button>
                    
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