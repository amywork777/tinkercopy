import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/context/SubscriptionContext';
import { ArrowRight, Star } from 'lucide-react';

interface PricingButtonProps extends ButtonProps {
  showIcon?: boolean;
  showLabel?: boolean;
  hideIfPro?: boolean;
}

/**
 * A button that redirects to the pricing page
 * Can be customized to show/hide icon, label, and whether to hide when the user is on Pro plan
 */
export default function PricingButton({ 
  showIcon = true,
  showLabel = true,
  hideIfPro = true,
  className,
  variant = "default",
  size = "default",
  ...props
}: PricingButtonProps) {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  
  // Hide the button if the user is on Pro plan and hideIfPro is true
  if (hideIfPro && subscription.isPro) {
    return null;
  }
  
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => navigate('/pricing')}
      {...props}
    >
      {showIcon && <Star className="h-4 w-4 mr-2" />}
      {showLabel && 'Upgrade to Pro'}
      {!showLabel && !showIcon && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
} 