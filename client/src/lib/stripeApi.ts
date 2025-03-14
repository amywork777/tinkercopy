// API for interacting with Stripe through our backend
// Get API URL from environment variables
const API_URL = '/api';

// Stripe price IDs - hardcoded for consistency
export const STRIPE_PRICES = {
  MONTHLY: 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ',
  ANNUAL: 'price_1QzyJNCLoBz9jXRlXE8bsC68',
};

// Create a checkout session for a subscription using a simple approach
export const createCheckoutSession = async (
  priceId: string,
  userId: string,
  email: string,
  promoCode?: string
): Promise<{ url: string }> => {
  try {
    console.log('Creating checkout session with:', {
      priceId,
      userId,
      email,
      promoCode: promoCode || 'none'
    });

    const response = await fetch(`${API_URL}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId,
        userId,
        email,
        promoCode,
        type: 'subscription' // Flag to indicate this is a subscription checkout
      }),
    });

    // Handle response
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Checkout error:', errorData);
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    const data = await response.json();
    if (!data.url) {
      throw new Error('No checkout URL returned from server');
    }

    return { url: data.url };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

// Get user subscription status - simplified
export const getUserSubscription = async (userId: string): Promise<{
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
  downloadsThisMonth: number;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  subscriptionPlan: string;
}> => {
  // If no userId, return free tier immediately
  if (!userId) {
    return {
      isPro: false,
      modelsRemainingThisMonth: 2, // Free tier limit
      modelsGeneratedThisMonth: 0,
      downloadsThisMonth: 0,
      subscriptionStatus: 'none',
      subscriptionEndDate: null,
      subscriptionPlan: 'free',
    };
  }
  
  try {
    // Simple, direct API call
    const response = await fetch(`${API_URL}/pricing/user-subscription/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      // Return free tier if API fails
      return {
        isPro: false,
        modelsRemainingThisMonth: 2,
        modelsGeneratedThisMonth: 0,
        downloadsThisMonth: 0,
        subscriptionStatus: 'none',
        subscriptionEndDate: null,
        subscriptionPlan: 'free',
      };
    }

    // Return the subscription data
    return await response.json();
  } catch (error) {
    console.error('Error getting user subscription:', error);
    // Return free tier as fallback on error
    return {
      isPro: false,
      modelsRemainingThisMonth: 2,
      modelsGeneratedThisMonth: 0,
      downloadsThisMonth: 0,
      subscriptionStatus: 'none',
      subscriptionEndDate: null,
      subscriptionPlan: 'free',
    };
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
      body: JSON.stringify({ userId }),
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