import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Download, Mail, Twitter, Linkedin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useScene } from "@/hooks/use-scene";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ShareDialog() {
  const { toast } = useToast();
  const { exportSelectedModelAsSTL, selectedModelIndex, models } = useScene();
  const [isPrivate, setIsPrivate] = useState(false);

  // Generate a shareable URL for the current model
  const getShareableUrl = () => {
    if (selectedModelIndex === null || !models[selectedModelIndex]) {
      return window.location.origin;
    }
    // Using the current URL as the base and adding the model ID as a query parameter
    const url = new URL(window.location.href);
    url.searchParams.set('model', models[selectedModelIndex].id);
    return url.toString();
  };

  // Copy URL to clipboard
  const handleCopyUrl = async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "URL Copied",
        description: "Share link has been copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy URL to clipboard",
        variant: "destructive",
      });
    }
  };

  // Handle sharing via email, Twitter, or LinkedIn
  const handleShare = (platform: 'email' | 'twitter' | 'linkedin') => {
    const url = encodeURIComponent(getShareableUrl());
    const title = "Check out my 3D model!";
    const text = encodeURIComponent("Check out my 3D model created with Taiyaki.ai!");
    
    let shareUrl = '';
    switch (platform) {
      case 'email':
        shareUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${text}%0A%0A${url}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
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
        link.download = `model-export.stl`;
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
          <Tabs defaultValue="share" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="share">Share</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>
            
            <TabsContent value="share" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="private">Private Link</Label>
                  <Switch
                    id="private"
                    checked={isPrivate}
                    onCheckedChange={setIsPrivate}
                  />
                </div>
                
                <div className="flex space-x-2">
                  <Input
                    readOnly
                    value={getShareableUrl()}
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                
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
                    Twitter
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