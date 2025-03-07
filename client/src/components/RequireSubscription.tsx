import React from 'react';
import { useSubscription } from '@/context/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FEATURES } from '@/lib/constants';

interface RequireSubscriptionProps {
  feature: keyof typeof FEATURES;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component that checks if a user has access to a feature based on their subscription.
 * If they don't have access, it shows a fallback UI or redirects to the pricing page.
 * 
 * @example
 * <RequireSubscription feature="fullAssetsLibrary">
 *   <FullAssetsLibrary />
 * </RequireSubscription>
 */
export default function RequireSubscription({ 
  feature, 
  children, 
  fallback 
}: RequireSubscriptionProps) {
  const { hasAccess, subscription } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Show loading state while subscription status is loading
  if (subscription.loading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 space-y-4 h-40">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        <p className="text-muted-foreground">Checking subscription...</p>
      </div>
    );
  }
  
  // If user has access to the feature, show the children
  if (hasAccess(feature)) {
    return <>{children}</>;
  }
  
  // If a fallback is provided, show it
  if (fallback) {
    return <>{fallback}</>;
  }
  
  // Default fallback UI for prompting upgrades
  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-4 border rounded-lg bg-muted/20">
      <h3 className="text-lg font-medium">Upgrade Required</h3>
      
      {feature === FEATURES.MODEL_GENERATION && (
        <p className="text-muted-foreground text-center">
          You've used all your free model generations this month.
          <br />
          Upgrade to Pro for 20 generations per month.
        </p>
      )}
      
      {feature === FEATURES.FULL_ASSETS_LIBRARY && (
        <p className="text-muted-foreground text-center">
          Full access to the asset library is available for Pro users.
          <br />
          Upgrade to unlock all assets.
        </p>
      )}
      
      {feature === FEATURES.PRINT_DISCOUNT && (
        <p className="text-muted-foreground text-center">
          Pro users receive a 10% discount on all 3D printing orders.
          <br />
          Upgrade to start saving.
        </p>
      )}
      
      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
        <Button 
          variant="default" 
          className="flex-1"
          onClick={() => navigate('/pricing')}
        >
          Upgrade to Pro
        </Button>
        
        {!user && (
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => navigate('/login?redirect=/pricing')}
          >
            Sign In
          </Button>
        )}
      </div>
    </div>
  );
} 