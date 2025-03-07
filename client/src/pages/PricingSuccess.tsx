import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, X, CrownIcon } from 'lucide-react';
import { getUserSubscription } from '@/lib/stripeApi';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';

export default function PricingSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);
  
  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);
  
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (!user) return;
      
      try {
        const userSubscription = await getUserSubscription(user.id);
        setSubscription(userSubscription);
      } catch (error) {
        console.error('Error fetching subscription status:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSubscriptionStatus();
  }, [user]);

  // If not logged in, don't render anything (handled by the redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background/95 flex-col items-center justify-center p-4 md:p-8 relative">
      {/* Semi-transparent background overlay */}
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-0" onClick={() => navigate('/')}></div>
      
      {/* Main content container */}
      <Card className="w-full max-w-md z-10 shadow-xl border rounded-xl overflow-hidden relative">
        {/* Pro Badge */}
        <div className="absolute top-4 left-4 z-20 flex items-center">
          <Badge className="bg-primary text-white flex items-center">
            <CrownIcon className="h-3 w-3 mr-1" />
            <span>Pro</span>
          </Badge>
        </div>
        
        {/* Close button moved inside the card */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-4 right-4 z-20"
          onClick={() => navigate('/')}
        >
          <X className="h-5 w-5" />
        </Button>
        
        <CardHeader className="text-center bg-primary/5 pb-6 pt-6">
          <div className="mx-auto w-20 h-20 flex items-center justify-center rounded-full bg-primary/10 mb-4">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl mb-2">Thank You!</CardTitle>
          <CardDescription className="text-base">
            Your subscription to FishCAD Pro is now active.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-primary/5 p-4 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Subscription Status</p>
                <p className="text-lg font-medium capitalize">
                  {subscription?.subscriptionStatus || 'Active'}
                </p>
                {subscription?.subscriptionEndDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Renews on {new Date(subscription.subscriptionEndDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              
              <div>
                <p className="text-sm font-medium mb-3">
                  Your Pro account includes:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm">20 Model Generations per Month</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm">Full Access to Assets Library</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm">10% Discount on 3D Print Orders</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm">Priority Support</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex flex-col space-y-3 pt-2 pb-6">
          <Button 
            className="w-full" 
            onClick={() => navigate('/')}
          >
            Start Creating
          </Button>
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => navigate('/account')}
          >
            Manage Subscription
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 