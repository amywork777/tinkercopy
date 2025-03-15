import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { STRIPE_PRICES } from '@/lib/stripeApi';
import { MODEL_LIMITS, PRICING_PLANS } from '@/lib/constants';
import { useSubscription } from '@/context/SubscriptionContext';
import { CrownIcon } from 'lucide-react';

export default function PricingPage() {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [discountCode, setDiscountCode] = useState<string>('');
  
  // Parse URL parameters to set default plan if specified
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const plan = params.get('plan');
    
    if (plan === PRICING_PLANS.PRO_ANNUAL) {
      setBillingInterval('yearly');
    }
    
    // Force a repaint to ensure the modal is visible
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [location]);

  const handleSubscribe = async (priceId: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to subscribe.",
        variant: "destructive"
      });
      navigate('/login?redirect=/pricing');
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('Creating checkout session with:', {
        priceId,
        userId: user.id,
        email: user.email,
        discountCode: discountCode || undefined
      });
      
      console.log('⚠️ Using test endpoint to bypass authentication issues');
      
      // Use a relative URL that will work across any port - for both development and production
      // For development, the Vite proxy will route this to port 3005
      // In production, this will go to the same domain (e.g., fishcad.com/api/...)
      const testEndpoint = `/api/test-stripe-checkout?_t=${Date.now()}`;
      console.log('Making request to relative URL:', testEndpoint);
      
      const response = await fetch(testEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({
          priceId,
          userId: user.id,
          email: user.email,
          discountCode: discountCode || undefined
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      
      // More detailed error message
      let errorMessage = 'There was a problem processing your subscription. Please try again.';
      
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        errorMessage += ` (${error.message})`;
        
        // Check for network errors
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Network error: Could not connect to the payment server. Please check your internet connection and try again.';
        }
        
        // Check for CORS errors
        if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
          errorMessage = 'CORS error: The browser blocked the request due to security restrictions. Please try again later.';
        }
      }
      
      toast({
        title: 'Subscription error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactUs = () => {
    window.location.href = 'mailto:contact@fishcad.com?subject=Enterprise%20Solutions';
  };

  // Determine if user is on Pro plan
  const isProUser = user && subscription?.isPro;

  return (
    <div className="flex min-h-screen bg-background/95 flex-col items-center justify-center p-4 md:p-8 relative">
      {/* Semi-transparent background overlay */}
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm z-10" onClick={() => navigate('/')}></div>
      
      {/* Main content container */}
      <div className="bg-background rounded-xl shadow-xl border max-w-5xl w-full z-20 overflow-hidden relative">
        {/* Close button moved inside the card */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-4 right-4 z-20"
          onClick={() => navigate('/')}
        >
          <X className="h-5 w-5" />
        </Button>
        
        {/* User subscription indicator */}
        {user && (
          <div className="absolute top-4 left-4 z-20 flex items-center">
            {isProUser ? (
              <Badge className="bg-primary text-white flex items-center">
                <CrownIcon className="h-3 w-3 mr-1" />
                <span>Pro</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Free Plan</Badge>
            )}
          </div>
        )}
        
        <div className="p-6 md:p-8">
          <div className="mx-auto text-center max-w-3xl">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Choose Your Plan</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Start for free or unlock powerful features with Pro.
            </p>
          </div>
          
          <div className="mt-6 md:mt-8">
            <Tabs 
              defaultValue={billingInterval} 
              className="w-full" 
              onValueChange={(value) => setBillingInterval(value as 'monthly' | 'yearly')}
            >
              <div className="flex justify-center mb-6">
                <TabsList className="grid w-72 grid-cols-2">
                  <TabsTrigger value="monthly" className="text-sm py-2">Monthly</TabsTrigger>
                  <TabsTrigger value="yearly" className="text-sm py-2 relative">
                    <span>Yearly</span>
                    <Badge variant="outline" className="ml-1.5 absolute top-0 right-1 -translate-y-1/2 bg-primary text-primary-foreground text-xs px-1.5 py-0">Save 20%</Badge>
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <div className="grid gap-5 md:grid-cols-3">
                {/* Free Tier */}
                <Card className={`flex flex-col h-full ${!isProUser && user ? 'ring-2 ring-muted' : ''}`}>
                  <CardHeader className="pb-3">
                    <CardTitle>Free Tier</CardTitle>
                    <CardDescription>Perfect for trying things out. No commitment, no cost—just endless possibilities.</CardDescription>
                    {!isProUser && user && (
                      <Badge variant="outline" className="mt-2 self-start">Current Plan</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 pb-4">
                    <div className="text-2xl font-bold">$0</div>
                    <div className="text-sm text-muted-foreground">/month</div>
                    
                    <ul className="mt-4 space-y-3">
                      <li className="flex items-start">
                        <Check className="mr-2 h-4 w-4 text-primary mt-1 flex-shrink-0" />
                        <span>One-hour Pro trial upon signup</span>
                      </li>
                      <li className="flex items-start">
                        <Check className="mr-2 h-4 w-4 text-primary mt-1 flex-shrink-0" />
                        <span>Unlimited 3D Print Requests</span>
                      </li>
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      onClick={() => navigate('/')}
                      variant="outline"
                    >
                      Get Started for Free
                    </Button>
                  </CardFooter>
                </Card>
                
                {/* Pro Tier */}
                <Card className={`flex flex-col h-full ${isProUser ? 'ring-2 ring-primary' : 'border-primary'} relative`}>
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <Badge className="bg-primary text-white">MOST POPULAR</Badge>
                  </div>
                  <CardHeader className="pb-3">
                    <CardTitle>Pro Tier</CardTitle>
                    <CardDescription>Unlock more power and save with our annual plan.</CardDescription>
                    {isProUser && (
                      <Badge className="bg-primary text-white mt-2 self-start">Current Plan</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 pb-4">
                    <TabsContent value="monthly" className="mt-0 p-0">
                      <div className="text-2xl font-bold">$20</div>
                      <div className="text-sm text-muted-foreground">/month</div>
                    </TabsContent>
                    <TabsContent value="yearly" className="mt-0 p-0">
                      <div className="text-2xl font-bold">$192</div>
                      <div className="text-sm text-muted-foreground">/year <span className="text-xs font-medium text-green-500">(save 20%)</span></div>
                    </TabsContent>
                    
                    <ul className="mt-4 space-y-3">
                      <li className="flex items-start">
                        <Check className="mr-2 h-4 w-4 text-primary mt-1 flex-shrink-0" />
                        <span>Unlimited Model Generations</span>
                      </li>
                      <li className="flex items-start">
                        <Check className="mr-2 h-4 w-4 text-primary mt-1 flex-shrink-0" />
                        <span>Unlimited 3D Print Requests</span>
                      </li>
                      <li className="flex items-start">
                        <Check className="mr-2 h-4 w-4 text-primary mt-1 flex-shrink-0" />
                        <span>Full Access to Assets Library</span>
                      </li>
                      {billingInterval === 'yearly' && (
                        <li className="flex items-start">
                          <Check className="mr-2 h-4 w-4 text-primary mt-1 flex-shrink-0" />
                          <span>Save 20% with Annual Billing</span>
                        </li>
                      )}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isProUser ? (
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => navigate('/account')}
                      >
                        Manage Subscription
                      </Button>
                    ) : (
                      <Button 
                        className="w-full" 
                        onClick={() => handleSubscribe(
                          billingInterval === 'monthly' ? STRIPE_PRICES.MONTHLY : STRIPE_PRICES.ANNUAL
                        )}
                        disabled={isLoading}
                      >
                        {!user ? 'Sign in to Subscribe' : (isLoading ? 'Processing...' : 'Upgrade to Pro')}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
                
                {/* Enterprise Tier */}
                <Card className="flex flex-col h-full">
                  <CardHeader className="pb-3">
                    <CardTitle>Enterprise Solutions</CardTitle>
                    <CardDescription>Looking for more? We offer custom solutions for businesses.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 pb-4">
                    <div className="text-2xl font-bold">Custom</div>
                    <div className="text-sm text-muted-foreground">Contact us for pricing</div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={handleContactUs}
                    >
                      Contact Us
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </Tabs>
          </div>
          
          {/* Discount Code Input */}
          <div className="mt-6 md:mt-8 flex flex-col items-center justify-center">
            <div className="flex items-center gap-2 w-full max-w-md">
              <input
                type="text"
                placeholder="Discount code (optional)"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Enter a valid discount code to get special pricing on your subscription
            </p>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              {user ? (
                <>
                  {isProUser ? 
                    'Thank you for being a Pro user!' : 
                    'Upgrade to Pro for more model generations and features!'
                  }
                </>
              ) : (
                <>
                  Not sure which plan is right for you?
                  <br />
                  Start with the Free Tier—upgrade anytime!
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 