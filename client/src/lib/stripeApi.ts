// API for interacting with Stripe through our backend
// Get API URL from environment variables or use localhost in development
const isDevelopment = window.location.hostname === 'localhost';
// Use fishcad.com domain explicitly for production to fix the checkout issue
const API_URL = isDevelopment 
  ? 'http://localhost:3001/api' 
  : (import.meta.env.VITE_API_URL || 'https://fishcad.com/api');

// Explicitly specify whether we're in production mode based on hostname
const isProduction = window.location.hostname.includes('fishcad.com') || 
                     window.location.hostname.includes('taiyaki-test1.web.app');

// Log the environment mode for debugging
console.log(`Running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
console.log(`Using API URL: ${API_URL}`);

// TEMPORARY FIX: Always use test mode keys for checkout
// These are the Stripe test mode keys and prices
const STRIPE_TEST_KEYS = {
  PUBLISHABLE_KEY: 'pk_test_51QIaT9CLoBz9jXRlLe4qRgojwW0MQ1anBfsTIVMjpxXjUUMPhkNbXcgHmPaySCZjoqiOJDQbCskQOzlvEUrGvQjz00UUcr3Qrm',
  MONTHLY_PRICE: 'price_1QzyJ4Jj6v6u5YGCJq4e5YQG',
  ANNUAL_PRICE: 'price_1QzyJTUe3gfr8Gy6qP52J3Th'
};

// Stripe price IDs - USE TEST KEYS EVERYWHERE FOR NOW
export const STRIPE_PRICES = {
  MONTHLY: STRIPE_TEST_KEYS.MONTHLY_PRICE,
  ANNUAL: STRIPE_TEST_KEYS.ANNUAL_PRICE,
};

// Log the Stripe Price IDs being used
console.log('Using Stripe Price IDs:', STRIPE_PRICES);

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    // SPECIAL HANDLING FOR FISHCAD.COM DOMAIN
    // Check if we're on fishcad.com - use appropriate approach
    const hostname = window.location.hostname;
    const isFishCad = hostname.includes('fishcad.com');
    
    // For non-fishcad.com domains, continue with the regular checkout flow
    // Set up endpoints - try with and without subdirectories
    let checkoutApiUrl: string;
    let currentAttempt = 1;
    let maxAttempts = 3;
    let lastError: Error | null = null;
    
    console.log(`Creating checkout session on domain ${hostname} for user ${userId}`);
    
    // Try different API endpoints until one works or we run out of attempts
    while (currentAttempt <= maxAttempts) {
      try {
        // Different endpoints to try
        if (currentAttempt === 1) {
          // First try the standard endpoint
          checkoutApiUrl = isFishCad 
            ? 'https://fishcad.com/api' 
            : API_URL;
        } else if (currentAttempt === 2) {
          // Second attempt: try the www subdomain for fishcad
          checkoutApiUrl = isFishCad 
            ? 'https://www.fishcad.com/api' 
            : API_URL;
        } else {
          // Last attempt: try a direct checkout server endpoint
          checkoutApiUrl = isFishCad 
            ? 'https://fishcad.com' 
            : API_URL;
        }
        
        const endpoint = addCacheBuster(`${checkoutApiUrl}/pricing/create-checkout-session`);
        
        console.log(`Attempt ${currentAttempt}/${maxAttempts}: Making checkout request to ${endpoint}`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Origin': window.location.origin
          },
          body: JSON.stringify({
            priceId,
            userId,
            email,
            domain: hostname,
            origin: window.location.origin
          }),
          signal: controller.signal,
          // Add credentials to ensure cookies are sent
          credentials: 'include'
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText || 'Unknown error' };
          }
          
          console.error(`Attempt ${currentAttempt}: Checkout session creation failed:`, {
            status: response.status,
            statusText: response.statusText,
            errorData
          });
          
          throw new Error(errorData.error || `Failed to create checkout session (HTTP ${response.status})`);
        }

        const data = await response.json();
        console.log('Checkout session created successfully:', data);
        clearTimeout(timeoutId);
        return data;
        
      } catch (error) {
        console.error(`Attempt ${currentAttempt} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        currentAttempt++;
        
        // Don't retry on abort/timeout
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Checkout request timed out. Please try again.');
        }
        
        // Wait before retry (only if not the last attempt)
        if (currentAttempt <= maxAttempts) {
          console.log(`Waiting before retry attempt ${currentAttempt}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // If we get here, all attempts failed
    throw lastError || new Error('Failed to create checkout session after multiple attempts');
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error creating checkout session:', error);
    
    // Provide more specific error messages
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Checkout request timed out. Please try again or contact support.');
    }
    
    // Detect connection issues
    if (error instanceof Error && 
        (error.message.includes('fetch failed') || 
         error.message.includes('network') || 
         error.message.includes('ERR_CONNECTION_'))) {
      throw new Error('Connection to checkout service failed. Please check your internet connection and try again.');
    }
    
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
    // Don't retry if abort was requested (e.g., timeout)
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Fetch aborted (timeout or manual cancel)');
      throw error;
    }
    
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
export const getUserSubscription = async (
  userId: string,
  signal?: AbortSignal
): Promise<{
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
      
      // Create options with signal if provided
      const options: RequestInit = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      };
      
      // Add signal if provided, otherwise use a default timeout
      if (signal) {
        options.signal = signal;
      } else {
        options.signal = AbortSignal.timeout(8000); // 8 second timeout by default
      }
      
      const response = await fetchWithRetry(
        optimizedEndpoint,
        options,
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
    
    // Create options with signal if provided
    const options: RequestInit = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    };
    
    // Add signal if provided, otherwise use a default timeout
    if (signal) {
      options.signal = signal;
    } else {
      options.signal = AbortSignal.timeout(10000); // 10 second timeout by default
    }
    
    const response = await fetchWithRetry(
      endpoint,
      options,
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