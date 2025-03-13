// API for interacting with Stripe through our backend
// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'https://www.fishcad.com/api';

// Import the multi-endpoint functions
import { createSubscriptionCheckout, getUserSubscriptionData } from '../SimpleStripeCheckout';

// Stripe price IDs from environment variables
export const STRIPE_PRICES = {
  MONTHLY: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1R1LlMCLoBz9jXRl3OQ5Q6kE',
  ANNUAL: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || 'price_1R1LloCLoBz9jXRldumh2DNl',
};

// Create a checkout session for a subscription
export const createCheckoutSession = async (
  priceId: string,
  userId: string,
  email: string
): Promise<{ url: string }> => {
  try {
    // Use the multi-endpoint approach first
    try {
      console.log('Using multi-endpoint approach for subscription checkout');
      const checkoutUrl = await createSubscriptionCheckout(priceId, userId, email);
      if (checkoutUrl) {
        return { url: checkoutUrl as string };
      }
    } catch (multiEndpointError) {
      console.error('Multi-endpoint approach failed, falling back to original method:', multiEndpointError);
    }
    
    // Fall back to the original method
    const response = await fetch(`${API_URL}/pricing/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId,
        userId,
        email,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

// Get user subscription status
export const getUserSubscription = async (userId: string): Promise<{
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
  downloadsThisMonth: number;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  subscriptionPlan: string;
}> => {
  try {
    // Use the multi-endpoint approach first
    try {
      console.log('Using multi-endpoint approach for getting user subscription');
      const response = await getUserSubscriptionData(userId);
      if (response && response.success) {
        const subscription = response.subscription || {};
        return {
          isPro: !!subscription.status && subscription.status === 'active',
          modelsRemainingThisMonth: subscription.status === 'active' ? Infinity : 0,
          modelsGeneratedThisMonth: 0,
          downloadsThisMonth: 0,
          subscriptionStatus: subscription.status || 'none',
          subscriptionEndDate: subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000).toISOString() 
            : null,
          subscriptionPlan: subscription.items?.data?.[0]?.price?.nickname || 'free',
        };
      }
    } catch (multiEndpointError) {
      console.error('Multi-endpoint approach failed, falling back to original method:', multiEndpointError);
    }
    
    // Fall back to the original method
    const response = await fetch(`${API_URL}/pricing/user-subscription/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get user subscription');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting user subscription:', error);
    throw error;
  }
};

// Cancel subscription
export const cancelSubscription = async (userId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${API_URL}/pricing/cancel-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to cancel subscription');
    }

    return await response.json();
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
};

// Calculate discounted price for pro users - now always returns original price
export const calculateDiscountedPrice = async (
  basePrice: number,
  userId: string
): Promise<number> => {
  // No discount applied anymore - always return the original price
  return basePrice;
}; 