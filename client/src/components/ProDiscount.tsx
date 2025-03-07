import React from 'react';
import { useSubscription } from '@/context/SubscriptionContext';
import PricingButton from './PricingButton';
import { Badge } from '@/components/ui/badge';

interface ProDiscountProps {
  originalPrice: number;
  onDiscountedPrice?: (price: number) => void;
}

/**
 * Component that shows the original price and discounted price for Pro users
 * Also triggers a callback with the discounted price
 */
export function ProDiscount({ originalPrice, onDiscountedPrice }: ProDiscountProps) {
  const { subscription } = useSubscription();
  
  // Calculate the discounted price (10% off for Pro users)
  const discountedPrice = subscription.isPro 
    ? Number((originalPrice * 0.9).toFixed(2)) 
    : originalPrice;
  
  // Trigger the callback with the discounted price
  React.useEffect(() => {
    if (onDiscountedPrice) {
      onDiscountedPrice(discountedPrice);
    }
  }, [discountedPrice, onDiscountedPrice]);
  
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        {subscription.isPro ? (
          <>
            <span className="text-muted-foreground line-through">${originalPrice.toFixed(2)}</span>
            <span className="font-medium">${discountedPrice.toFixed(2)}</span>
            <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
              Pro Discount
            </Badge>
          </>
        ) : (
          <>
            <span className="font-medium">${originalPrice.toFixed(2)}</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Pro users save 10%</span>
              <PricingButton 
                variant="link" 
                size="sm" 
                className="p-0 h-auto text-xs" 
                showIcon={false}
              >
                Upgrade
              </PricingButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 