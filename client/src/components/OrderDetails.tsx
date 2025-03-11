import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Download, Check, ExternalLink } from "lucide-react";

interface OrderDetailsProps {
  // Define any props here if needed
}

interface OrderData {
  orderId: string;
  stripeSessionId: string;
  customerEmail: string;
  customerName: string;
  shippingAddress: string;
  paymentStatus: string;
  amountTotal: number;
  orderDetails: {
    modelName: string;
    color: string;
    quantity: number;
    finalPrice: number;
  };
  stlFile?: {
    fileName: string;
    downloadUrl?: string;
    publicUrl?: string;
    storagePath?: string;
    fileSize?: number;
    dataPreview?: string;
    downloadLink?: string;
  };
  orderStatus: string;
  orderDate: string;
  fulfillmentStatus: string;
  estimatedShippingDate: string;
}

const OrderDetails: React.FC<OrderDetailsProps> = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (orderId) {
      fetchOrderDetails(orderId);
    } else {
      setError("No order ID provided");
      setLoading(false);
    }
  }, [orderId]);
  
  const fetchOrderDetails = async (id: string) => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/order-details/${id}`);
      
      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.order) {
        setOrder(data.order);
        console.log('Loaded order details:', data.order);
      } else {
        throw new Error(data.message || 'Failed to load order details');
      }
    } catch (err: any) {
      console.error('Error fetching order details:', err);
      setError(err.message || 'Failed to load order details');
      
      toast({
        title: "Error loading order",
        description: err.message || "Could not load order details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };
  
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };
  
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'completed':
      case 'shipped':
        return 'text-green-600 bg-green-100 border-green-200';
      case 'pending':
      case 'processing':
        return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'cancelled':
      case 'failed':
        return 'text-red-600 bg-red-100 border-red-200';
      default:
        return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };
  
  const downloadStlFile = () => {
    if (order?.stlFile?.downloadLink) {
      window.open(order.stlFile.downloadLink, '_blank');
      
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
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading order details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert variant="destructive" className="max-w-3xl mx-auto my-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <div className="mt-4">
          <Link to="/">
            <Button variant="outline">Return to Homepage</Button>
          </Link>
        </div>
      </Alert>
    );
  }
  
  if (!order) {
    return (
      <Alert className="max-w-3xl mx-auto my-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Order Not Found</AlertTitle>
        <AlertDescription>The order you're looking for could not be found.</AlertDescription>
        <div className="mt-4">
          <Link to="/">
            <Button variant="outline">Return to Homepage</Button>
          </Link>
        </div>
      </Alert>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Order Details</h1>
      <p className="text-muted-foreground mb-6">Order ID: {order.orderId}</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Order Summary */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
            <CardDescription>Placed on {formatDate(order.orderDate)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="font-medium">Status</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.orderStatus)}`}>
                  {order.orderStatus.toUpperCase()}
                </span>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-2">Items</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex flex-col md:flex-row justify-between">
                    <div>
                      <p className="font-medium">{order.orderDetails.modelName}</p>
                      <p className="text-sm text-muted-foreground">
                        Color: {order.orderDetails.color} • 
                        Quantity: {order.orderDetails.quantity}
                      </p>
                    </div>
                    <div className="mt-2 md:mt-0">
                      <p className="font-medium">{formatCurrency(order.orderDetails.finalPrice)}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(order.orderDetails.finalPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>Included</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>{formatCurrency(order.amountTotal)}</span>
                </div>
              </div>
              
              <Separator />
              
              {/* STL File Information */}
              {order.stlFile && (
                <div className="space-y-2">
                  <h3 className="font-medium">3D Model File</h3>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">{order.stlFile.fileName}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatFileSize(order.stlFile.fileSize)}
                      </span>
                    </div>
                    
                    {order.stlFile.downloadLink ? (
                      <Button 
                        onClick={downloadStlFile}
                        className="w-full"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download STL File
                      </Button>
                    ) : (
                      <Button variant="outline" disabled className="w-full">
                        <AlertCircle className="mr-2 h-4 w-4" />
                        STL File Unavailable
                      </Button>
                    )}
                    
                    {order.stlFile.storagePath && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Storage path: {order.stlFile.storagePath}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-1">Customer</h3>
                <p>{order.customerName}</p>
                <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-1">Shipping Address</h3>
                <p className="whitespace-pre-line">{order.shippingAddress}</p>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-1">Estimated Shipping Date</h3>
                <p>{formatDate(order.estimatedShippingDate)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Status: <span className="font-medium">{order.fulfillmentStatus}</span>
                </p>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-1">Payment Details</h3>
                <div className="flex items-center">
                  <Check className="h-4 w-4 text-green-500 mr-1" />
                  <span>{order.paymentStatus.toUpperCase()}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Stripe Session: {order.stripeSessionId}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link to="/" className="w-full">
              <Button variant="outline" className="w-full">
                <ExternalLink className="mr-2 h-4 w-4" />
                Return to Homepage
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default OrderDetails; 