import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Package 
} from "lucide-react";

export interface OrderSummaryProps {
  // Price information
  basePrice: number;
  materialCost?: number;
  printingCost?: number;
  shippingCost?: number;
  finalPrice: number;
  complexityFactor?: number;
  printability?: {
    factor: number;
    category: string;
    hasOverhangs: boolean;
    hasThinWalls: boolean;
    hasFloatingIslands: boolean;
  };
  
  // Status information
  priceSource: 'api' | 'estimate';
  isPriceCalculating: boolean;
  isPreparing: boolean;
  
  // Model information
  selectedModelName: string | null;
  selectedFilament: string;
  quantity: number;
  
  // Actions
  onCalculatePrice: () => void;
  
  // Formatting
  formatPrice: (amount: number) => string;
}

export function OrderSummary({
  // Price information
  basePrice,
  materialCost,
  printingCost,
  shippingCost,
  finalPrice,
  complexityFactor = 1.0,
  printability,
  
  // Status information
  priceSource,
  isPriceCalculating,
  isPreparing,
  
  // Model information
  selectedModelName,
  selectedFilament,
  quantity,
  
  // Actions
  onCalculatePrice,
  
  // Formatting
  formatPrice
}: OrderSummaryProps) {
  // Local state for API connection attempts
  const [connectionAttempts, setConnectionAttempts] = React.useState(0);
  
  // Update connection attempts when price calculation starts
  React.useEffect(() => {
    if (isPriceCalculating) {
      setConnectionAttempts(prev => prev + 1);
    }
  }, [isPriceCalculating]);
  
  const connectionStatus = React.useMemo(() => {
    if (priceSource === 'api') {
      return 'success';
    }
    
    if (isPriceCalculating || isPreparing) {
      return 'connecting';
    }
    
    if (connectionAttempts >= 3) {
      return 'failed';
    } else if (connectionAttempts > 0) {
      return 'retrying';
    }
    
    return 'pending';
  }, [priceSource, isPriceCalculating, isPreparing, connectionAttempts]);
  
  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Order Summary</CardTitle>
            {connectionStatus === 'success' ? (
              <CardDescription className="flex items-center text-primary">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Volume-based pricing calculation
              </CardDescription>
            ) : connectionStatus === 'connecting' ? (
              <CardDescription className="flex items-center text-amber-500">
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {connectionAttempts > 1 
                  ? `Calculating from model dimensions (${connectionAttempts})...` 
                  : 'Analyzing model geometry...'}
              </CardDescription>
            ) : connectionStatus === 'retrying' ? (
              <CardDescription className="flex items-center text-amber-500">
                <AlertCircle className="h-4 w-4 mr-1" />
                Refining calculation...
              </CardDescription>
            ) : connectionStatus === 'failed' ? (
              <CardDescription className="flex items-center text-amber-500">
                <AlertCircle className="h-4 w-4 mr-1" />
                Using standard pricing
              </CardDescription>
            ) : (
              <CardDescription className="flex items-center text-muted-foreground">
                <AlertCircle className="h-4 w-4 mr-1" />
                Estimated based on item count
              </CardDescription>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onCalculatePrice}
            disabled={isPriceCalculating || isPreparing}
            className="h-8 px-2"
          >
            {isPriceCalculating || isPreparing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            <span className="ml-1 text-xs">
              {isPriceCalculating ? 'Calculating...' : 
               isPreparing ? 'Preparing...' : 'Calculate Price'}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <span>Model:</span>
          <span>
            {selectedModelName || 'No model selected'}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span>Material:</span>
          <span className="capitalize">
            {selectedFilament || 'None'}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span>Quantity:</span>
          <span>{quantity} {quantity === 1 ? 'item' : 'items'}</span>
        </div>
        
        {complexityFactor > 1.05 && (
          <div className="flex justify-between items-center">
            <span>Complexity:</span>
            <span className={complexityFactor > 1.3 ? "text-amber-600 font-medium" : ""}>
              {complexityFactor >= 1.5 ? "Very High" : 
               complexityFactor >= 1.3 ? "High" : 
               complexityFactor >= 1.2 ? "Medium" : "Low"}
              {complexityFactor > 1.3 && " (+price)"}
            </span>
          </div>
        )}
        
        <Separator className="my-2" />
        
        <div className="flex justify-between items-center text-sm">
          <span>Per Item:</span>
          <span>{formatPrice(basePrice / quantity)}</span>
        </div>
        
        <div className="flex justify-between items-center text-md mt-1">
          <span>Subtotal ({quantity} {quantity === 1 ? 'item' : 'items'}):</span>
          <span>{formatPrice(basePrice)}</span>
        </div>
        
        <div className="flex justify-between items-center text-sm mt-1">
          <span>Shipping:</span>
          <span>{basePrice > 50 ? '$10.00' : '$5.00'}</span>
        </div>
        
        <Separator className="my-2" />
        
        <div className="flex justify-between items-center font-semibold">
          <span>Total Price:</span>
          <span>{formatPrice(finalPrice)}</span>
        </div>
        
        {(isPriceCalculating || isPreparing) && (
          <div className="flex items-center justify-center py-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">
              {isPreparing ? 'Preparing model...' : 'Calculating dimensions...'}
            </span>
          </div>
        )}
        
        {connectionStatus === 'failed' && !isPriceCalculating && !isPreparing && (
          <div className="bg-amber-50 p-2 rounded-md text-xs text-amber-800 mt-2">
            <p className="flex items-start">
              <AlertCircle className="h-4 w-4 mr-1 shrink-0 mt-0.5" />
              <span>
                Using standard pricing based on quantity.
                {connectionAttempts > 1 && (
                  <span className="block mt-1">
                    For more accurate pricing, view your model in the 3D viewer first.
                  </span>
                )}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 