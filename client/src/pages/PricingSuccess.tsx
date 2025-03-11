import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { verifySubscription } from '@/lib/stripeApi';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function PricingSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { user } = useAuth();
  const { refreshSubscription } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Verifying your subscription...');
  
  useEffect(() => {
    const verifyPayment = async () => {
      if (!user || !sessionId) {
        setStatus('error');
        setMessage('Missing user information or session ID. Please try again.');
        return;
      }
      
      try {
        // Verify the subscription with our backend
        const result = await verifySubscription(
          user.id,
          user.email || '',
          sessionId
        );
        
        if (result.success) {
          // Successfully verified
          setStatus('success');
          setMessage('Your subscription has been activated successfully!');
          
          // Refresh the subscription context
          await refreshSubscription();
          
          // Show success toast
          toast({
            title: 'Subscription Activated',
            description: 'Your Pro subscription has been successfully activated.',
            variant: 'default',
          });
        } else {
          // Verification failed but not an error
          setStatus('error');
          setMessage(result.message || 'Could not verify your subscription. Please contact support.');
        }
      } catch (error) {
        // Error during verification
        console.error('Subscription verification error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
        
        toast({
          title: 'Verification Error',
          description: 'There was an error verifying your subscription. Please contact support.',
          variant: 'destructive',
        });
      }
    };
    
    verifyPayment();
  }, [user, sessionId, toast, refreshSubscription]);
  
  return (
    <div className="container max-w-3xl py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Subscription Status</CardTitle>
          <CardDescription>
            {status === 'loading' ? 'Verifying your subscription payment...' : 
             status === 'success' ? 'Your subscription is now active!' : 
             'Subscription verification issue'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center justify-center space-y-6 text-center">
          {status === 'loading' && (
            <div className="flex flex-col items-center space-y-4 py-6">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-lg">{message}</p>
            </div>
          )}
          
          {status === 'success' && (
            <div className="flex flex-col items-center space-y-4 py-6">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg">{message}</p>
              <div className="mt-4 space-y-2">
                <p className="font-medium">You now have access to:</p>
                <ul className="list-disc list-inside text-left">
                  <li>Generate unlimited models</li>
                  <li>Priority customer support</li>
                  <li>Access to all premium features</li>
                </ul>
              </div>
            </div>
          )}
          
          {status === 'error' && (
            <div className="flex flex-col items-center space-y-4 py-6">
              <XCircle className="h-16 w-16 text-red-500" />
              <p className="text-lg">{message}</p>
              <p className="mt-2 text-muted-foreground">
                If you believe this is a mistake, please contact our support team.
              </p>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-center">
          <Button 
            onClick={() => navigate('/')} 
            className="mr-4"
          >
            Go to Dashboard
          </Button>
          {status === 'error' && (
            <Button 
              variant="outline" 
              onClick={() => navigate('/pricing')}
            >
              Back to Pricing
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
} 