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
    console.log('Production environment detected - using fishcad.com');
    // Use main domain for production
    return 'https://fishcad.com/api';
  }
  
  // Fallback to environment variable or default
  const envApiUrl = import.meta.env.VITE_API_URL;
  const fallback = envApiUrl || 'https://fishcad.com/api';
  console.log(`Using fallback API URL: ${fallback}`);
  return fallback;
};

// Get the API URL
const API_URL = getApiUrl();
console.log(`API URL configured as: ${API_URL}`);

// PRODUCTION STRIPE KEYS
const STRIPE_PROD_KEYS = {
  PUBLISHABLE_KEY: 'pk_live_51QIaT9CLoBz9jXRlVEQ99Q6V4UiRSYy8ZS49MelsW8EfX1mEijh3K5JQEe5iysIL31cGtf2IsTVIyV1mivoUHCUI00aPpz3GMi',
  MONTHLY_PRICE: 'price_1R1jGiCLoBz9jXRlB1uLgvE9', // Pro Monthly
  ANNUAL_PRICE: 'price_1R1jGgCLoBz9jXRluMN6PsNw'  // Pro Yearly
};

// Export the publishable key directly
export const PUBLISHABLE_KEY = STRIPE_PROD_KEYS.PUBLISHABLE_KEY;

// Export STRIPE_KEYS for backward compatibility with existing components
export const STRIPE_KEYS = {
  PUBLISHABLE_KEY: STRIPE_PROD_KEYS.PUBLISHABLE_KEY,
  MONTHLY_PRICE: STRIPE_PROD_KEYS.MONTHLY_PRICE,
  ANNUAL_PRICE: STRIPE_PROD_KEYS.ANNUAL_PRICE
};

// Export STRIPE_PRICES directly for consistent access
export const STRIPE_PRICES = {
  MONTHLY: STRIPE_PROD_KEYS.MONTHLY_PRICE,
  ANNUAL: STRIPE_PROD_KEYS.ANNUAL_PRICE
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
      const hostname = window.location.hostname;
      const isProduction = hostname.includes('fishcad.com');
      
      console.log(`Checkout attempt ${attempt} - Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
      
      // Use a specific production endpoint for fishcad.com
      let endpoint;
      if (isProduction) {
        // IMPORTANT: Try direct request to the main domain instead of API path
        // This works around potential server configuration issues
        endpoint = 'https://fishcad.com/pricing/create-checkout-session';
        console.log(`Using simplified production endpoint: ${endpoint}`);
      } else {
        // For development, use the configured API URL
        const endpointPath = API_URL.includes('/api') 
          ? '/pricing/create-checkout-session' 
          : '/api/pricing/create-checkout-session';
        endpoint = `${API_URL}${endpointPath}`;
        console.log(`Using development endpoint: ${endpoint}`);
      }
      
      // Add cache buster
      endpoint = addCacheBuster(endpoint);
      
      console.log(`Attempt ${attempt}: Making request to ${endpoint} with price ID: ${priceId}`);
      
      // Proper fetch configuration for cross-origin requests
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        credentials: 'include', // Always include credentials for both dev and prod
        mode: 'cors', // Explicitly set CORS mode
        body: JSON.stringify({
          priceId,
          userId,
          email,
          // Force new customer on production to avoid test/live mode conflicts
          force_new_customer: isProduction
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
      
      console.log(`Attempt ${attempt}: Successfully created checkout session - Redirecting to: ${data.url}`);
      return data;
    } catch (error: unknown) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('Connection error - server may be rejecting the request or have CORS issues');
      }
      
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
    const hostname = window.location.hostname;
    const isProduction = hostname.includes('fishcad.com');
    
    // Use direct API URL for production
    let endpoint;
    if (isProduction) {
      // IMPORTANT: Try direct request to the main domain without the /api path
      endpoint = `https://fishcad.com/pricing/user-subscription/${userId}`;
      console.log(`Using simplified production subscription endpoint: ${endpoint}`);
    } else {
      const endpointPath = API_URL.includes('/api') 
        ? `/pricing/user-subscription/${userId}`
        : `/api/pricing/user-subscription/${userId}`;
      endpoint = `${API_URL}${endpointPath}`;
      console.log(`Using development subscription endpoint: ${endpoint}`);
    }
    
    // Add cache buster
    endpoint = addCacheBuster(endpoint);
    
    console.log(`Fetching subscription for user: ${userId} from ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'application/json',
        'Origin': window.location.origin
      },
      credentials: 'include', // Always include credentials
      mode: 'cors', // Explicitly set CORS mode
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
    const hostname = window.location.hostname;
    const isProduction = hostname.includes('fishcad.com');
    
    // Use direct API URL for production
    let endpoint;
    if (isProduction) {
      // IMPORTANT: Try direct request to the main domain without the /api path
      endpoint = 'https://fishcad.com/pricing/cancel-subscription';
      console.log(`Using simplified production cancel endpoint: ${endpoint}`);
    } else {
      const endpointPath = API_URL.includes('/api') 
        ? '/pricing/cancel-subscription' 
        : '/api/pricing/cancel-subscription';
      endpoint = `${API_URL}${endpointPath}`;
      console.log(`Using development cancel endpoint: ${endpoint}`);
    }
    
    // Add cache buster
    endpoint = addCacheBuster(endpoint);
    
    console.log(`Cancelling subscription for user: ${userId}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'application/json',
        'Origin': window.location.origin
      },
      credentials: 'include', // Always include credentials
      mode: 'cors', // Explicitly set CORS mode
      body: JSON.stringify({
        userId,
      }),
    });

    // Handle non-OK responses properly
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        // If not JSON, try getting the text
        const text = await response.text();
        errorData = { error: text || `HTTP error ${response.status}` };
      }
      
      throw new Error(errorData.error || `Failed to cancel subscription (HTTP ${response.status})`);
    }

    const data = await response.json();
    console.log('Cancellation response:', data);
    
    return data;
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
    const isProduction = hostname.includes('fishcad.com');
    
    // Use direct API URL for production
    let endpoint;
    if (isProduction) {
      // IMPORTANT: Try direct request to the main domain without the /api path
      endpoint = 'https://fishcad.com/pricing/verify-subscription';
      console.log(`Using simplified production verify endpoint: ${endpoint}`);
    } else {
      const endpointPath = API_URL.includes('/api') 
        ? '/pricing/verify-subscription' 
        : '/api/pricing/verify-subscription';
      endpoint = `${API_URL}${endpointPath}`;
      console.log(`Using development verify endpoint: ${endpoint}`);
    }
    
    // Add cache buster
    endpoint = addCacheBuster(endpoint);
    
    console.log(`Verifying subscription for user: ${userId}, session: ${sessionId || 'none'}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'application/json',
        'Origin': window.location.origin
      },
      credentials: 'include', // Always include credentials
      mode: 'cors', // Explicitly set CORS mode
      body: JSON.stringify({
        userId,
        email,
        sessionId,
      }),
    });

    // Handle non-OK responses properly
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        // If not JSON, try getting the text
        const text = await response.text();
        errorData = { error: text || `HTTP error ${response.status}` };
      }
      
      throw new Error(errorData.error || `Failed to verify subscription (HTTP ${response.status})`);
    }

    const data = await response.json();
    console.log('Verification response:', data);
    
    return data;
  } catch (error) {
    console.error('Error verifying subscription:', error);
    throw error;
  }
}; 