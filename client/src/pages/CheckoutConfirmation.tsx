import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, ArrowLeft, Download, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderDetails {
  orderId: string;
  modelName: string;
  color: string;
  quantity: number;
  finalPrice: number;
  paymentStatus: string;
  stlFileName?: string;
  stlFileUrl?: string;
  stlStoragePath?: string;
  stlFileData?: string;
  stlFile?: {
    downloadUrl?: string;
    downloadLink?: string;
    fileName?: string;
    fileSize?: string;
    storagePath?: string;
  };
  orderDetails?: {
    modelName?: string;
    color?: string;
    quantity?: number;
    finalPrice?: number;
  };
  amountTotal?: number;
}

const CheckoutConfirmation = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const fetchOrderDetails = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      // Implement retry logic
      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        attempt++;
        try {
          console.log(`Attempt ${attempt} to fetch order details for session: ${sessionId}`);
          
          // Fetch order details from the backend
          const response = await fetch(`/api/order-details?session_id=${sessionId}`);
          const data = await response.json();

          if (data.success && data.order) {
            console.log(`Successfully retrieved order details on attempt ${attempt}:`, data.order);
            setOrderDetails(data.order);
            success = true;
            
            // Show confirmation toast
            toast({
              title: "Order confirmed",
              description: "Your order has been placed successfully!",
              variant: "default"
            });
          } else {
            console.warn(`Failed to get order details on attempt ${attempt}:`, data.message);
            
            if (attempt === maxRetries) {
              toast({
                title: "Failed to load order details",
                description: data.message || "Please try refreshing the page or contact support if this persists",
                variant: "destructive"
              });
            } else {
              // Wait longer between each retry
              const delay = attempt * 1000; // 1s, 2s, 3s...
              console.log(`Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        } catch (error) {
          console.error(`Error fetching order details (attempt ${attempt}):`, error);
          
          if (attempt === maxRetries) {
            toast({
              title: "Error",
              description: "Failed to load your order details. Please try refreshing the page.",
              variant: "destructive"
            });
          } else {
            // Wait longer between each retry
            const delay = attempt * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      setLoading(false);
    };

    fetchOrderDetails();
  }, [sessionId, toast]);

  // Function to download STL file if available
  const handleDownloadSTL = () => {
    if (orderDetails?.stlFileUrl) {
      window.open(orderDetails.stlFileUrl, '_blank');
    } else if (orderDetails?.stlFile?.downloadUrl) {
      window.open(orderDetails.stlFile.downloadUrl, '_blank');
    } else if (orderDetails?.stlFile?.downloadLink) {
      window.open(orderDetails.stlFile.downloadLink, '_blank');
    } else {
      toast({
        title: "Download unavailable",
        description: "STL file download link is not available",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-muted-foreground">Loading order details...</p>
              </div>
            </CardContent>
          </Card>
        ) : !orderDetails ? (
          <Card>
            <CardHeader>
              <CardTitle>Order Not Found</CardTitle>
              <CardDescription>
                We couldn't find your order details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                This could be because:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>The session ID is invalid or expired</li>
                <li>Your payment is still processing</li>
                <li>There was an error with the payment</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild>
                <Link to="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Home
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <CardTitle className="text-2xl">Order Successful!</CardTitle>
              <CardDescription>
                Your 3D print order has been received and is being processed.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Order ID:</span>
                  <span className="font-medium">{orderDetails.orderId}</span>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="font-semibold">Order Summary</h3>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{orderDetails.modelName}</p>
                      </div>
                      <Badge variant="outline" className="bg-green-50">
                        {orderDetails.paymentStatus}
                      </Badge>
                    </div>
                    
                    <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Color</span>
                        <span className="font-medium">
                          {orderDetails.color || (orderDetails.orderDetails?.color) || 'Not specified'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Quantity</span>
                        <span className="font-medium">
                          {orderDetails.quantity || (orderDetails.orderDetails?.quantity) || 1}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between font-medium text-lg">
                    <span>Total:</span>
                    <span>
                      ${(orderDetails.finalPrice || orderDetails.orderDetails?.finalPrice || orderDetails.amountTotal || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="font-semibold">What's Next?</h3>
                  
                  <p className="text-sm text-muted-foreground">
                    We'll start working on your 3D printing order right away. You'll receive an email 
                    confirmation with all details, and we'll keep you updated on the printing progress.
                  </p>
                  
                  {(orderDetails.stlFileUrl || orderDetails.stlFile?.downloadUrl || orderDetails.stlFile?.downloadLink) && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleDownloadSTL}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Your 3D Model
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex flex-col space-y-4">
              <Button asChild className="w-full">
                <Link to="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Home
                </Link>
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                If you have any questions, please contact our customer support.
              </p>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CheckoutConfirmation; 