import React from 'react';
import { useSubscription } from '@/context/SubscriptionContext';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { MODEL_LIMITS } from '@/lib/constants';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * Component to display the user's subscription status and model generation limits
 */
export default function SubscriptionStatus() {
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  
  // If subscription is loading, show a skeleton UI
  if (subscription.loading) {
    return (
      <div className="space-y-2 rounded-md p-3 border animate-pulse">
        <div className="h-5 bg-muted rounded w-1/3"></div>
        <div className="h-3 bg-muted rounded w-full mt-2"></div>
        <div className="h-3 bg-muted rounded-full w-full mt-1"></div>
      </div>
    );
  }
  
  // Calculate the total allowed models based on subscription
  const totalModels = subscription.isPro ? MODEL_LIMITS.PRO : MODEL_LIMITS.FREE;
  
  // Calculate percentage used
  const usedPercentage = Math.min(
    100,
    Math.round(
      ((totalModels - subscription.modelsRemainingThisMonth) / totalModels) * 100
    )
  );
  
  return (
    <div className="space-y-2 rounded-md p-3 border">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm">Subscription</h4>
        {subscription.isPro ? (
          <Badge variant="default" className="bg-primary">Pro</Badge>
        ) : (
          <Badge variant="secondary">Free</Badge>
        )}
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Model Generations</span>
          <span>
            {totalModels - subscription.modelsRemainingThisMonth}/{totalModels} used
          </span>
        </div>
        <Progress value={usedPercentage} className="h-2" />
      </div>
      
      {!subscription.isPro && subscription.modelsRemainingThisMonth < 2 && (
        <div className="mt-3">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => navigate('/pricing')}
          >
            {subscription.modelsRemainingThisMonth === 0
              ? 'Upgrade for More Models'
              : 'Running Low - Upgrade Now'}
          </Button>
        </div>
      )}
      
      {subscription.isPro && (
        <div className="text-xs text-muted-foreground mt-1">
          {subscription.subscriptionStatus === 'active' ? (
            <span>
              Your Pro subscription is active. Renews {
                subscription.subscriptionEndDate
                  ? new Date(subscription.subscriptionEndDate).toLocaleDateString()
                  : 'soon'
              }.
            </span>
          ) : (
            <span>
              Subscription status: {subscription.subscriptionStatus}
            </span>
          )}
        </div>
      )}
    </div>
  );
} 