import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function MagicFishAI() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-1 relative overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">MagicFish AI</CardTitle>
          <CardDescription>Create detailed 3D models from images or text descriptions</CardDescription>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-5rem)]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading MagicFish AI...</span>
            </div>
          )}
          <iframe 
            src="https://magicfish.taiyaki.ai"
            className="w-full h-full border-0"
            title="MagicFish AI"
            onLoad={() => setIsLoading(false)}
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
          />
        </CardContent>
      </Card>
    </div>
  );
} 