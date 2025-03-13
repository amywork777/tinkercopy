// API for interacting with Stripe through our backend
// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'https://www.fishcad.com/api';

// Stripe price IDs from environment variables
export const STRIPE_PRICES = {
  MONTHLY: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ',
  ANNUAL: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
};

// Create a checkout session for a subscription
export const createCheckoutSession = async (
  priceId: string,
  userId: string,
  email: string
): Promise<{ url: string }> => {
  try {
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