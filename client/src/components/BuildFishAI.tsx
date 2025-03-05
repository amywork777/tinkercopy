import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function BuildFishAI() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-1 relative overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">BuildFish AI</CardTitle>
          <CardDescription>Generate precise 3D designs from text descriptions</CardDescription>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-5rem)]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading BuildFish AI...</span>
            </div>
          )}
          <iframe 
            src="https://buildfish.taiyaki.ai"
            className="w-full h-full border-0"
            title="BuildFish AI"
            onLoad={() => setIsLoading(false)}
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
          />
        </CardContent>
      </Card>
    </div>
  );
} 