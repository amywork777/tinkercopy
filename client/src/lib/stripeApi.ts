// API for interacting with Stripe through our backend
// Get API URL from environment variables or use localhost in development
const isDevelopment = window.location.hostname === 'localhost';

// Use the current origin (including www if present) for production to avoid CORS issues
// This ensures we use the same domain as the page is loaded from
const API_URL = isDevelopment 
  ? 'http://localhost:3001/api' 
  : `${window.location.origin}/api`;

// Explicitly specify whether we're in production mode based on hostname
const isProduction = window.location.hostname.includes('fishcad.com') || 
                     window.location.hostname.includes('taiyaki-test1.web.app');

// Log the environment mode for debugging
console.log(`Running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
console.log(`Using API URL: ${API_URL}`);

// PRODUCTION STRIPE KEYS
const STRIPE_PROD_KEYS = {
  PUBLISHABLE_KEY: 'pk_live_51QIaT9CLoBz9jXRlVEQ99Q6V4UiRSYy8ZS49MelsW8EfX1mEijh3K5JQEe5iysIL31cGtf2IsTVIyV1mivoUHCUI00aPpz3GMi',
  MONTHLY_PRICE: 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ', // Pro Monthly
  ANNUAL_PRICE: 'price_1QzyJNCLoBz9jXRlXE8bsC68'  // Pro Yearly
};

// TEST MODE STRIPE KEYS
const STRIPE_TEST_KEYS = {
  PUBLISHABLE_KEY: 'pk_test_51QIaT9CLoBz9jXRlLe4qRgojwW0MQ1anBfsTIVMjpxXjUUMPhkNbXcgHmPaySCZjoqiOJDQbCskQOzlvEUrGvQjz00UUcr3Qrm',
  MONTHLY_PRICE: 'price_1QzyJ4Jj6v6u5YGCJq4e5YQG',
  ANNUAL_PRICE: 'price_1QzyJTUe3gfr8Gy6qP52J3Th'
};

// Use production or test keys based on environment
// On fishcad.com, use production keys, otherwise use test keys
export const STRIPE_KEYS = isProduction ? STRIPE_PROD_KEYS : STRIPE_TEST_KEYS;

// Stripe price IDs based on environment
export const STRIPE_PRICES = {
  MONTHLY: STRIPE_KEYS.MONTHLY_PRICE,
  ANNUAL: STRIPE_KEYS.ANNUAL_PRICE,
};

// Log the Stripe Price IDs being used
console.log('Using Stripe Price IDs:', STRIPE_PRICES);
console.log('Using publishable key:', STRIPE_KEYS.PUBLISHABLE_KEY);

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
    // Get current hostname for logging
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    const isLocalhost = hostname === 'localhost';
    
    console.log(`Creating checkout session on domain ${hostname} for user ${userId} in ${isLocalhost ? 'LOCAL' : 'PRODUCTION'} mode`);
    
    // Always use the current origin for API requests to avoid CORS issues
    const endpoint = isLocalhost
      ? addCacheBuster(`http://localhost:3001/api/pricing/create-checkout-session`) 
      : addCacheBuster(`${origin}/api/pricing/create-checkout-session`);
    
    console.log(`Making checkout request to ${endpoint}`);
    
    // Create headers with appropriate cache control
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    
    // Create request options - different for local dev vs production
    const requestOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify({
        priceId,
        userId,
        email,
        domain: hostname,
        origin: origin
      }),
      signal: controller.signal
    };
    
    // CRITICAL: Only include credentials in production environment
    // We must NEVER include credentials for localhost to avoid CORS issues
    if (!isLocalhost) {
      requestOptions.credentials = 'include';
    } else {
      // Explicitly set credentials to 'omit' for localhost to ensure they're never sent
      requestOptions.credentials = 'omit';
    }
    
    console.log(`Attempt: Making checkout request to ${endpoint} ${isLocalhost ? 'without' : 'with'} credentials`);
    
    // For localhost, retry without credentials if first attempt fails
    let retryCount = 0;
    const maxRetries = isLocalhost ? 1 : 3; // Only retry once for localhost
    
    while (retryCount <= maxRetries) {
      try {
        retryCount++;
        
        // Log retry attempt if this isn't the first try
        if (retryCount > 1) {
          console.log(`Attempt ${retryCount}/${maxRetries + 1}: Making checkout request to ${endpoint}`);
        }
        
        const response = await fetch(endpoint, requestOptions);
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText || 'Unknown error' };
          }
          
          console.error(`Attempt ${retryCount}: Checkout session creation failed:`, {
            status: response.status,
            statusText: response.statusText,
            errorData
          });
          
          // Special handling for 503 Service Unavailable errors
          if (response.status === 503) {
            console.log(`Attempt ${retryCount} failed with 503 Service Unavailable`);
            if (retryCount <= maxRetries) {
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue; // Retry the request
            }
          }
          
          throw new Error(errorData.error || `Failed to create checkout session (HTTP ${response.status})`);
        }
        
        const data = await response.json();
        console.log('Checkout session created successfully:', data);
        clearTimeout(timeoutId);
        return data;
      } catch (fetchError) {
        // If this was our last retry, or it's a network error in development, throw the error
        if (retryCount > maxRetries || (isLocalhost && fetchError instanceof TypeError)) {
          console.error(`Attempt ${retryCount} failed:`, fetchError);
          throw fetchError;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // If we get here without returning or throwing, something went wrong
    throw new Error('Failed to create checkout session after multiple attempts');
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error creating checkout session:', error);
    
    // Provide more specific error messages
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Checkout request timed out. Please try again or contact support.');
    }
    
    // Check for CORS errors specifically
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      if (window.location.hostname === 'localhost') {
        throw new Error('The API server appears to be unavailable. Please ensure your local API server is running at http://localhost:3001');
      } else {
        throw new Error('Connection to checkout service failed. Please check your internet connection and try again.');
      }
    }
    
    // Handle 503 Service Unavailable errors
    if (error instanceof Error && 
        (error.message.includes('503') || 
         error.message.includes('Service Unavailable'))) {
      throw new Error('The checkout service is temporarily unavailable. Please try again in a few moments.');
    }
    
    // Detect other connection issues
    if (error instanceof Error && 
        (error.message.includes('fetch failed') || 
         error.message.includes('network') || 
         error.message.includes('ERR_CONNECTION_') ||
         error.message.includes('offline'))) {
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
      const hostname = window.location.hostname;
      const origin = window.location.origin;
      const isLocalhost = hostname === 'localhost';
      
      const optimizedEndpoint = isLocalhost
        ? addCacheBuster(`http://localhost:3001/api/pricing/optimize-subscription/${userId}`)
        : addCacheBuster(`${origin}/api/pricing/optimize-subscription/${userId}`);
      
      console.log(`Trying optimized subscription endpoint for user: ${userId} at ${optimizedEndpoint}`);
      
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
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    const isLocalhost = hostname === 'localhost';
    
    const endpoint = isLocalhost
      ? addCacheBuster(`http://localhost:3001/api/pricing/user-subscription/${userId}`)
      : addCacheBuster(`${origin}/api/pricing/user-subscription/${userId}`);
    
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
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    const isLocalhost = hostname === 'localhost';
    
    const endpoint = isLocalhost
      ? addCacheBuster(`http://localhost:3001/api/pricing/cancel-subscription`)
      : addCacheBuster(`${origin}/api/pricing/cancel-subscription`);
    
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
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    const isLocalhost = hostname === 'localhost';
    
    const endpoint = isLocalhost
      ? addCacheBuster(`http://localhost:3001/api/pricing/verify-subscription`)
      : addCacheBuster(`${origin}/api/pricing/verify-subscription`);
    
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