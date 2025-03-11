// API for interacting with Stripe through our backend
// Get API URL from environment variables or use localhost in development
const isDevelopment = window.location.hostname === 'localhost';
// Use fishcad.com domain explicitly for production to fix the checkout issue
const API_URL = isDevelopment 
  ? 'http://localhost:3001/api' 
  : (import.meta.env.VITE_API_URL || 'https://fishcad.com/api');

// Stripe price IDs from environment variables
export const STRIPE_PRICES = {
  MONTHLY: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1R1LlMCLoBz9jXRl3OQ5Q6kE',
  ANNUAL: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
};

// Helper to add cache-busting parameter
const addCacheBuster = (url: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
};

// Check if the server is responding properly
export const checkServerStatus = async (): Promise<boolean> => {
  try {
    const endpoint = addCacheBuster(`${API_URL}/status`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('Error checking server status:', error);
    return false;
  }
};

// Create a checkout session for a subscription
export const createCheckoutSession = async (
  priceId: string,
  userId: string,
  email: string
): Promise<{ url: string }> => {
  try {
    // Use fishcad.com domain explicitly if we're on that domain
    const isFishCad = window.location.hostname.includes('fishcad.com');
    const endpoint = addCacheBuster(`${isFishCad ? 'https://fishcad.com/api' : API_URL}/pricing/create-checkout-session`);
    
    console.log(`Making checkout request to ${endpoint} for user ${userId} with price ${priceId}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        priceId,
        userId,
        email,
        domain: window.location.hostname // Send the current domain to ensure correct redirect URLs
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Checkout session creation failed:', errorData);
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

// Function to retry a fetch operation with exponential backoff
const fetchWithRetry = async (
  url: string, 
  options: RequestInit, 
  retries = 3, 
  backoff = 300
): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    
    // Wait for the backoff period
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    // Retry with exponential backoff
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
};

// Get user subscription status with retry and fallback logic
export const getUserSubscription = async (userId: string): Promise<{
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
  downloadsThisMonth: number;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  subscriptionPlan: string;
  trialActive: boolean;
  trialEndDate: string | null;
}> => {
  try {
    // First try the optimized endpoint which is much lighter on server resources
    try {
      const optimizedEndpoint = addCacheBuster(`${API_URL}/pricing/optimize-subscription/${userId}`);
      console.log(`Trying optimized subscription endpoint for user: ${userId}`);
      
      const response = await fetchWithRetry(
        optimizedEndpoint,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          },
          // Add a reasonable timeout
          signal: AbortSignal.timeout(8000), // 8 second timeout
        },
        2, // Number of retries
        500 // Initial backoff in ms
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Optimized subscription data received:', data);
        
        // Return a complete object with defaults for missing fields
        return {
          isPro: data.isPro === true,
          modelsRemainingThisMonth: data.modelsRemainingThisMonth || 0,
          modelsGeneratedThisMonth: data.modelsGeneratedThisMonth || 0,
          downloadsThisMonth: data.downloadsThisMonth || 0,
          subscriptionStatus: data.subscriptionStatus || 'none',
          subscriptionEndDate: data.subscriptionEndDate || null,
          subscriptionPlan: data.subscriptionPlan || 'free',
          trialActive: data.trialActive === true,
          trialEndDate: data.trialEndDate || null,
        };
      }
      // If optimized endpoint fails, continue to legacy endpoint
      console.log('Optimized endpoint failed, falling back to legacy endpoint');
    } catch (optError) {
      console.warn('Error with optimized subscription endpoint:', optError);
      // Continue to legacy endpoint
    }
    
    // Try legacy endpoint as fallback
    const endpoint = addCacheBuster(`${API_URL}/pricing/user-subscription/${userId}`);
    console.log(`Fetching subscription for user: ${userId} from ${endpoint}`);
    
    const response = await fetchWithRetry(
      endpoint,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        // Add a reasonable timeout
        signal: AbortSignal.timeout(10000), // 10 second timeout
      },
      2, // Number of retries  
      300 // Initial backoff in ms
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: errorText || 'Unknown error' };
      }
      console.error('Error response from subscription API:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      throw new Error(errorData.error || `Failed to get user subscription (HTTP ${response.status})`);
    }

    const data = await response.json();
    console.log('Subscription data received:', data);
    
    // Make sure all required fields are present with appropriate defaults
    const result = {
      isPro: data.isPro === true,
      modelsRemainingThisMonth: data.modelsRemainingThisMonth || 0,
      modelsGeneratedThisMonth: data.modelsGeneratedThisMonth || 0,
      downloadsThisMonth: data.downloadsThisMonth || 0,
      subscriptionStatus: data.subscriptionStatus || 'none',
      subscriptionEndDate: data.subscriptionEndDate || null,
      subscriptionPlan: data.subscriptionPlan || 'free',
      trialActive: data.trialActive === true,
      trialEndDate: data.trialEndDate || null,
    };
    
    console.log('Normalized subscription data:', result);
    return result;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    throw error;
  }
};

// Cancel subscription
export const cancelSubscription = async (userId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const endpoint = addCacheBuster(`${API_URL}/pricing/cancel-subscription`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
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

// Verify subscription and update user status
export const verifySubscription = async (
  userId: string, 
  email: string, 
  sessionId?: string
): Promise<{ 
  success: boolean; 
  subscription: any; 
  message: string;
}> => {
  try {
    const endpoint = addCacheBuster(`${API_URL}/pricing/verify-subscription`);
    console.log(`Verifying subscription for user: ${userId}, session: ${sessionId || 'none'}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        userId,
        email,
        sessionId,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to verify subscription');
    }

    return data;
  } catch (error) {
    console.error('Error verifying subscription:', error);
    throw error;
  }
}; 