// API for interacting with Stripe through our backend
// Get API URL from environment variables or use localhost in development

// Function to get the appropriate API URL based on the environment
const getApiUrl = (): string => {
  // Log hostname to debug
  const hostname = window.location.hostname;
  console.log(`Current hostname: ${hostname}`);
  
  // Check if development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  
  // Production environments - fishcad.com
  if (hostname.includes('fishcad.com')) {
    // Check if we're on the www subdomain or main domain
    if (hostname === 'www.fishcad.com' || hostname === 'fishcad.com') {
      // API might be on a separate subdomain
      return 'https://api.fishcad.com';
    }
  }
  
  // Fallback to environment variable or default
  const envApiUrl = import.meta.env.VITE_API_URL;
  const fallback = envApiUrl || 'https://api.fishcad.com';
  console.log(`Using fallback API URL: ${fallback}`);
  return fallback;
};

// Get the API URL
const API_URL = getApiUrl();
console.log(`API URL configured as: ${API_URL}`);

// Stripe price IDs from environment variables or fallback to the ones in server .env
export const STRIPE_PRICES = {
  MONTHLY: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ',
  ANNUAL: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
};

// Helper to add cache-busting parameter
const addCacheBuster = (url: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
};

// Utility function to check API connectivity before performing operations
export const checkApiConnectivity = async (): Promise<boolean> => {
  try {
    // Try an OPTIONS request to the API base URL to check connectivity
    const apiUrl = API_URL;
    
    // Add a timestamp to avoid caching
    const endpoint = addCacheBuster(`${apiUrl}/health-check`);
    
    console.log(`Checking API connectivity at ${endpoint}`);
    
    // Use fetch with a timeout to check connectivity
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(endpoint, {
      method: 'OPTIONS',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // If we get any response, consider it a success
    console.log(`API connectivity check result: ${response.status}`);
    return response.status < 500; // Consider it a success if not a server error
  } catch (error) {
    console.error('API connectivity check failed:', error);
    return false;
  }
};

// Create a checkout session for a subscription
export const createCheckoutSession = async (
  priceId: string,
  userId: string,
  email: string
): Promise<{ url: string }> => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second
  
  // Helper function to wait
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper function for the fetch operation
  const attemptFetch = async (attempt: number = 1): Promise<{ url: string }> => {
    try {
      // Construct the appropriate endpoint based on the API URL structure
      let endpoint = API_URL;
      
      // API_URL might already include /api, so don't add it twice
      const endpointPath = API_URL.includes('/api') 
        ? '/pricing/create-checkout-session' 
        : '/api/pricing/create-checkout-session';
      
      // Complete endpoint with cache buster
      endpoint = addCacheBuster(`${endpoint}${endpointPath}`);
      
      console.log(`Attempt ${attempt}: Making request to ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        credentials: 'include',
        body: JSON.stringify({
          priceId,
          userId,
          email,
          // Add force_new_customer flag to ensure we don't try to reuse a test customer in live mode
          force_new_customer: true 
        }),
      });

      // Handle non-OK responses
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If not JSON, try getting the text
          const text = await response.text();
          errorData = { error: text || `HTTP error ${response.status}` };
        }
        
        console.error(`Attempt ${attempt}: Checkout session creation failed:`, {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        
        // For specific error cases, we may want to retry
        if (response.status >= 500 || response.status === 429) {
          // Server error or rate limiting - retry
          if (attempt < MAX_RETRIES) {
            console.log(`Retrying in ${RETRY_DELAY}ms...`);
            await wait(RETRY_DELAY);
            return attemptFetch(attempt + 1);
          }
        }
        
        throw new Error(errorData.error || `Failed to create checkout session (HTTP ${response.status})`);
      }
      
      // Success case
      const data = await response.json();
      if (!data?.url) {
        throw new Error("API response is missing the checkout URL");
      }
      
      console.log(`Attempt ${attempt}: Successfully created checkout session`);
      return data;
    } catch (error: unknown) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      // Only retry for network errors or if explicitly marked as retryable
      if (attempt < MAX_RETRIES && 
          ((error instanceof TypeError) || // Network error
           (error instanceof Error && error.message?.includes('failed to fetch')))) {
        console.log(`Network error, retrying in ${RETRY_DELAY}ms...`);
        await wait(RETRY_DELAY);
        return attemptFetch(attempt + 1);
      }
      
      throw error;
    }
  };
  
  // Start the fetch attempt chain
  return attemptFetch();
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
  trialActive: boolean;
  trialEndDate: string | null;
}> => {
  try {
    const endpoint = addCacheBuster(`${API_URL}/pricing/user-subscription/${userId}`);
    console.log(`Fetching subscription for user: ${userId} from ${endpoint}`);
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      // Add a reasonable timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

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