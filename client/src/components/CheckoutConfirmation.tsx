import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Package, ArrowRight, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderDetails {
  orderId: string;
  customerName: string;
  orderDetails: {
    modelName: string;
    color: string;
    quantity: number;
    finalPrice: number;
  };
  stlFile?: {
    fileName: string;
    downloadUrl?: string;
    storagePath?: string;
    downloadLink?: string;
  };
}

const CheckoutConfirmation = () => {
  const location = useLocation();
  const { toast } = useToast();
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Parse the URL for the session ID
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
      fetchOrderDetails(sessionId);
    } else {
      setError('No checkout session ID found in the URL');
      setLoading(false);
    }
  }, [location]);

  const fetchOrderDetails = async (sessionId: string) => {
    try {
      setLoading(true);
      
      // Add retry logic for the server to catch up - may need a moment to process the order
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      let responseData = null;
      
      while (attempts < maxAttempts && !success) {
        try {
          console.log(`Attempt ${attempts + 1} to fetch order details for session: ${sessionId}`);
          
          const response = await fetch(`/api/checkout-confirmation?session_id=${sessionId}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.log(`Server returned error (attempt ${attempts + 1}):`, response.status, errorText);
            throw new Error(`Server returned error: ${response.status}`);
          }
          
          responseData = await response.json();
          
          if (responseData.success && responseData.order) {
            success = true;
            console.log('Order details retrieval successful:', responseData);
          } else {
            throw new Error(responseData.message || 'Failed to load order details');
          }
        } catch (attemptError) {
          console.log(`Attempt ${attempts + 1} failed:`, attemptError);
          attempts++;
          
          if (attempts < maxAttempts) {
            // Wait before retrying (increasing delay for each attempt)
            const delay = 1000 * attempts; // 1s, 2s, 3s
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (success && responseData) {
        setOrderDetails(responseData.order);
        console.log('Order details:', responseData.order);
        console.log('Source:', responseData.source);
        
        // Show success message
        toast({
          title: "Order confirmed!",
          description: "Your 3D print order has been successfully placed.",
        });
      } else {
        throw new Error('All attempts to fetch order details failed');
      }
    } catch (error: any) {
      console.error('Error fetching order details:', error);
      setError(error.message || 'Failed to load order details');
      
      toast({
        title: "Error loading order",
        description: "Could not load your order details. Please try refreshing the page or contact support.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const downloadStlFile = () => {
    if (orderDetails?.stlFile?.downloadLink) {
      window.open(orderDetails.stlFile.downloadLink, '_blank');
      
      toast({
        title: "Download started",
        description: "Your STL file download has started in a new tab",
      });
    } else {
      toast({
        title: "Download unavailable",
        description: "STL file download link is not available for this order",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-3xl">
      <Card className="shadow-lg">
        <CardHeader className="text-center border-b pb-6">
          <div className="mb-4 flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-3xl mb-2">Order Confirmed!</CardTitle>
          <p className="text-gray-500">
            Thank you for your order. We've received your payment and are processing your 3D print.
          </p>
        </CardHeader>
        
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-500">Loading your order details...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <Link to="/">
                <Button>Return to Home</Button>
              </Link>
            </div>
          ) : orderDetails ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Order Summary</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex flex-col md:flex-row justify-between mb-4">
                    <div>
                      <p className="font-medium">{orderDetails.orderDetails.modelName}</p>
                      <p className="text-sm text-gray-500">
                        Color: {orderDetails.orderDetails.color} • 
                        Quantity: {orderDetails.orderDetails.quantity}
                      </p>
                    </div>
                    <div className="mt-2 md:mt-0">
                      <p className="font-medium">
                        {formatCurrency(orderDetails.orderDetails.finalPrice)}
                      </p>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="text-right font-medium">
                    Total: {formatCurrency(orderDetails.orderDetails.finalPrice)}
                  </div>
                </div>
              </div>
              
              {orderDetails.stlFile && (
                <div>
                  <h3 className="text-lg font-medium mb-2">Your 3D Model File</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="mb-2"><span className="font-medium">File:</span> {orderDetails.stlFile.fileName}</p>
                    
                    {orderDetails.stlFile.storagePath && (
                      <p className="text-sm text-gray-500 mb-3">
                        Your STL file has been securely stored in our system
                      </p>
                    )}
                    
                    {orderDetails.stlFile.downloadLink && (
                      <Button
                        onClick={downloadStlFile}
                        variant="outline"
                        className="w-full mb-2"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download STL File
                      </Button>
                    )}
                  </div>
                </div>
              )}
              
              <div>
                <h3 className="text-lg font-medium mb-2">What's Next?</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                  <div className="flex items-start">
                    <Package className="h-5 w-5 text-primary mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Manufacturing Your Print</p>
                      <p className="text-sm text-gray-500">
                        We'll begin processing your 3D print immediately. Most orders are produced within 2-3 business days.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <FileText className="h-5 w-5 text-primary mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Order Updates</p>
                      <p className="text-sm text-gray-500">
                        You'll receive email updates as your order progresses. You can also check your order status anytime.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {orderDetails.orderId && (
                <div className="text-center pt-4">
                  <p className="text-sm text-gray-500 mb-2">
                    Order ID: <span className="font-mono">{orderDetails.orderId}</span>
                  </p>
                  <Link to={`/order/${orderDetails.orderId}`}>
                    <Button variant="outline" className="w-full">
                      View Order Details
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-gray-500 mb-4">No order details found</p>
              <Link to="/">
                <Button>Return to Home</Button>
              </Link>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="border-t pt-6 flex justify-center">
          <Link to="/">
            <Button>
              Continue Shopping
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default CheckoutConfirmation; 