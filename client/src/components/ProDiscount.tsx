import React from 'react';
import { useSubscription } from '@/context/SubscriptionContext';
import PricingButton from './PricingButton';

interface ProDiscountProps {
  originalPrice: number;
  onDiscountedPrice?: (price: number) => void;
}

/**
 * Component that shows the price - no longer offers discounts for Pro users
 * Also triggers a callback with the price
 */
export function ProDiscount({ originalPrice, onDiscountedPrice }: ProDiscountProps) {
  const { subscription } = useSubscription();
  
  // No discount anymore - use original price for everyone
  const finalPrice = originalPrice;
  
  // Trigger the callback with the price
  React.useEffect(() => {
    if (onDiscountedPrice) {
      onDiscountedPrice(finalPrice);
    }
  }, [finalPrice, onDiscountedPrice]);
  
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <span className="font-medium">${originalPrice.toFixed(2)}</span>
      </div>
    </div>
  );
} 