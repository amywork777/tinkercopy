import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Loader2 } from "lucide-react";

interface SessionDetails {
  id: string;
  amount_total: number;
  customer_email: string;
  metadata: {
    modelName: string;
    color: string;
    quantity: string;
    finalPrice: string;
  };
  payment_status: string;
}

const SuccessPage = () => {
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSessionDetails = async () => {
      try {
        const sessionId = searchParams.get('session_id');
        
        if (!sessionId) {
          setLoading(false);
          return;
        }
        
        // Fetch session details from the server
        const response = await fetch(`/api/checkout-sessions/${sessionId}`);
        const data = await response.json();
        
        if (data.success && data.session) {
          setSession(data.session);
        } else {
          toast({
            title: "Error retrieving order",
            description: data.message || "Could not find your order details",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error fetching session details:', error);
        toast({
          title: "Error",
          description: "Failed to load your order details",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchSessionDetails();
  }, [searchParams, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4">Loading your order details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-xl mx-auto px-4 py-10">
      <div className="text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-3xl font-bold mb-2">
          Thank You for Your Order!
        </h2>
        
        <p className="text-muted-foreground mb-6">
          Your 3D print order has been placed successfully.
        </p>
        
        {session ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="font-medium">Model:</span>
                <span>{session.metadata?.modelName || 'Custom Model'}</span>
              </div>
              <Separator />
              
              <div className="flex justify-between">
                <span className="font-medium">Color:</span>
                <span>{session.metadata?.color || 'Standard'}</span>
              </div>
              <Separator />
              
              <div className="flex justify-between">
                <span className="font-medium">Quantity:</span>
                <span>{session.metadata?.quantity || '1'}</span>
              </div>
              <Separator />
              
              <div className="flex justify-between">
                <span className="font-medium">Total Price:</span>
                <span>${(session.amount_total / 100).toFixed(2)}</span>
              </div>
              <Separator />
              
              <div className="flex justify-between">
                <span className="font-medium">Payment Status:</span>
                <span className="text-green-500">
                  {session.payment_status === 'paid' ? 'Paid' : 'Processing'}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardContent className="py-6">
              <p className="text-center">
                Your order has been placed, but we couldn't retrieve the details.
                Check your email for a confirmation message.
              </p>
            </CardContent>
          </Card>
        )}
        
        <p className="mb-6">
          We've sent a confirmation email with all the details.
          Your 3D print will be manufactured and shipped soon!
        </p>
        
        <div className="space-y-4">
          <Button asChild className="w-full">
            <Link to="/">Return to Home</Link>
          </Button>
          
          <Button asChild variant="outline" className="w-full">
            <Link to="/print">Order Another 3D Print</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SuccessPage; 