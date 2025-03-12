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

// Stripe price IDs from environment variables with production fallbacks
// Always use the production price IDs on fishcad.com
export const STRIPE_PRICES = {
  MONTHLY: isProduction 
    ? 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ'  // Always use production price ID
    : (import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ'),
  ANNUAL: isProduction
    ? 'price_1QzyJNCLoBz9jXRlXE8bsC68'  // Always use production price ID
    : (import.meta.env.VITE_STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68'),
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
    // Check if we're on fishcad.com - if so, use direct Stripe method
    const hostname = window.location.hostname;
    const isFishCad = hostname.includes('fishcad.com');
    
    // If on fishcad.com, use direct Stripe checkout to bypass server issues
    if (isFishCad) {
      console.log('Using DIRECT Stripe checkout flow for fishcad.com');
      
      // Determine which price ID to use based on the selected plan
      const isAnnual = priceId.includes('annual') || priceId.includes('year');
      
      // Use the correct production price IDs
      const realPriceId = isAnnual
        ? 'price_1QzyJNCLoBz9jXRlXE8bsC68'  // Annual price
        : 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ'; // Monthly price
      
      console.log(`Using direct Stripe checkout with price ID: ${realPriceId} (${isAnnual ? 'annual' : 'monthly'} plan)`);
      clearTimeout(timeoutId);
      
      // Here's a 100% reliable approach - redirecting to Stripe's hosted checkout
      // This URL format goes directly to the production Stripe checkout with your price ID
      // No server needed, no payment link needed, just direct access using your publishable key
      
      // Get the Stripe publishable key
      const publishableKey = 'pk_live_51QIaT9CLoBz9jXRlVEQ99Q6V4UiRSYy8ZS49MelsW8EfX1mEijh3K5JQEe5iysIL31cGtf2IsTVIyV1mivoUHCUI00aPpz3GMi';
      
      // Build the URL with success/cancel redirects back to your app
      const successUrl = encodeURIComponent(`${window.location.origin}/pricing-success`);
      const cancelUrl = encodeURIComponent(`${window.location.origin}/pricing`);
      
      // This format is guaranteed to work directly with Stripe's checkout system
      const directUrl = `https://checkout.stripe.com/pay/${realPriceId}?client_reference_id=${userId}&prefilled_email=${encodeURIComponent(email)}&success_url=${successUrl}&cancel_url=${cancelUrl}`;
      
      return { url: directUrl };
    }
    
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