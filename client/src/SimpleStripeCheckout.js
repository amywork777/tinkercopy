/**
 * Simple Stripe Checkout Integration
 * This file handles direct Stripe checkout functionality with fallbacks
 */

// Get correct API URL based on environment
const getBaseUrl = () => {
  // Use VITE_API_URL if available, otherwise default to relative path
  const configuredUrl = import.meta.env.VITE_API_URL;
  if (configuredUrl) return configuredUrl;
  
  // If we're in production, use www.fishcad.com to avoid CORS issues
  if (import.meta.env.PROD) {
    // Always use www.fishcad.com to prevent CORS redirect issues
    // Return domain only, not including /api to prevent double api in paths
    return 'https://www.fishcad.com';
  }
  
  // If we're in development (using Vite dev server), use empty prefix for proxy setup
  if (import.meta.env.DEV) return '';
  
  // For any other case, fallback to empty path (API is at same origin)
  return '';
};

// Stripe price IDs - using environment variables with fallbacks
export const STRIPE_PRICES = {
  MONTHLY: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ',
  ANNUAL: import.meta.env.VITE_STRIPE_PRICE_ANNUAL || 'price_1QzyJNCLoBz9jXRlXE8bsC68',
};

/**
 * Create a checkout session for subscription
 * @param {string} priceId - The Stripe Price ID
 * @param {string} userId - The user's ID
 * @param {string} email - The user's email
 * @returns {Promise<string>} - Checkout URL
 */
export const createSubscriptionCheckout = async (
  priceId,
  userId,
  email
) => {
  // Log the request details for debugging
  console.log('Creating subscription checkout:', { priceId, userId, email });
  
  // Prepare the request payload
  const payload = {
    priceId,
    userId,
    email,
    type: 'subscription', // Add type to distinguish from 3D print checkout
    // Add timestamp to prevent caching issues
    timestamp: new Date().getTime()
  };
  
  // Create a list of endpoints to try (in order of preference)
  const baseUrl = getBaseUrl();
  const endpoints = [
    // Try direct www endpoints first for most reliable connection
    'https://www.fishcad.com/api/pricing/create-checkout-session',
    // Then try relative paths which may work in some environments
    `/api/pricing/create-checkout-session`,
    // Then try explicit baseUrl construction (prevent double /api/ by checking if baseUrl ends with /api)
    `${baseUrl}${baseUrl.endsWith('/api') ? '' : '/api'}/pricing/create-checkout-session`,
    // Fallback to alternative paths
    `/api/create-checkout-session`,
    `${baseUrl}${baseUrl.endsWith('/api') ? '' : '/api'}/create-checkout-session`
  ];
  
  // Log the endpoints we're going to try
  console.log('Attempting checkout with these endpoints:', endpoints);
  
  // Try each endpoint until one works
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`Attempting checkout with endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      
      // Log response status for debugging
      console.log(`${endpoint} response status:`, response.status);
      
      // Check if the response is valid
      if (response.ok) {
        const data = await response.json();
        console.log('Checkout response:', data);
        
        // Return the checkout URL
        if (data.url) {
          console.log('✅ Checkout URL obtained:', data.url);
          return data.url;
        } else {
          console.error('Response missing URL property:', data);
        }
      } else {
        // Try to get error details
        try {
          const errorData = await response.json();
          console.error(`Error response from ${endpoint}:`, errorData);
        } catch (e) {
          console.error(`Error parsing error response from ${endpoint}:`, e);
        }
      }
    } catch (error) {
      console.error(`Error with endpoint ${endpoint}:`, error);
      lastError = error;
      // Continue to the next endpoint
    }
  }
  
  // If we get here, all endpoints failed
  throw new Error(lastError ? 
    `Failed to create checkout session: ${lastError.message}` : 
    'Failed to create checkout session with all available endpoints'
  );
};

/**
 * Create checkout session for 3D printing with STL file storage
 * @param {Object} options - Checkout options
 * @param {string} options.modelName - Name of the 3D model
 * @param {string} options.color - Color for printing
 * @param {number} options.quantity - Quantity to print
 * @param {number} options.price - Price in USD
 * @param {string} options.userId - User ID
 * @param {string} options.email - User email
 * @param {string} [options.stlFileData] - STL file data as base64 string
 * @param {string} [options.stlFileName] - STL file name
 * @returns {Promise<{url: string, sessionId: string}>} - Checkout session info
 */
export const createPrintCheckout = async ({
  modelName,
  color,
  quantity,
  price,
  userId,
  email,
  stlFileData,
  stlFileName
}) => {
  // Log checkout request (without the actual STL data for brevity)
  console.log('Creating print checkout:', { 
    modelName, color, quantity, price, userId, email,
    hasStlFile: !!stlFileData,
    stlFileName
  });
  
  // Prepare the request payload
  const payload = {
    modelName,
    color,
    quantity,
    finalPrice: price,
    userId,
    email,
    timestamp: new Date().getTime(),
    type: '3d_print' // Add type to distinguish from subscription checkout
  };
  
  // Add STL file data if available
  if (stlFileData && stlFileName) {
    payload.stlFileData = stlFileData;
    payload.stlFileName = stlFileName;
  }
  
  // Create a list of endpoints to try (in order of preference)
  const baseUrl = getBaseUrl();
  const endpoints = [
    `/api/checkout`,
    `/api/create-checkout-session`,
    // Fallback options with explicit base URL
    `${baseUrl}/api/checkout`,
    `${baseUrl}/api/create-checkout-session`
  ];
  
  // Try each endpoint until one works
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`Attempting print checkout with endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      
      // Check if the response is valid
      if (response.ok) {
        const data = await response.json();
        console.log('Print checkout response:', data);
        
        // Return the checkout URL and session ID
        if (data.url) {
          console.log('✅ Print Checkout URL obtained:', data.url);
          return {
            url: data.url,
            sessionId: data.sessionId || ''
          };
        }
      } else {
        try {
          const errorData = await response.json();
          console.error(`Error response from ${endpoint}:`, errorData);
        } catch (e) {
          console.error(`Error parsing error response from ${endpoint}:`, e);
        }
      }
    } catch (error) {
      console.error(`Error with endpoint ${endpoint}:`, error);
      lastError = error;
      // Continue to the next endpoint
    }
  }
  
  // If we get here, all endpoints failed
  throw new Error(lastError ? 
    `Failed to create print checkout: ${lastError.message}` : 
    'Failed to create print checkout with all available endpoints'
  );
};

/**
 * Direct Stripe checkout helper for subscription plans
 * @param {('MONTHLY'|'ANNUAL')} plan - Subscription plan
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<boolean>} - Success status
 */
export const directStripeCheckout = async (plan, userId, email) => {
  try {
    // Get the price ID for the selected plan
    const priceId = STRIPE_PRICES[plan];
    if (!priceId) {
      throw new Error(`Price ID not found for plan: ${plan}`);
    }
    
    // Log debugging information
    console.log(`Starting checkout for ${plan} plan:`, {
      priceId,
      userId,
      email,
      env: import.meta.env.MODE,
      isDev: import.meta.env.DEV,
      apiBase: getBaseUrl()
    });
    
    // Create checkout session and get URL
    const checkoutUrl = await createSubscriptionCheckout(priceId, userId, email);
    
    // Redirect to Stripe checkout
    window.location.href = checkoutUrl;
    
    return true;
  } catch (error) {
    console.error('Stripe checkout failed:', error);
    
    // Try the fallback URL approach (for browsers that don't support fetch)
    try {
      console.log('Attempting fallback checkout method...');
      
      // Determine base URL
      const baseUrl = getBaseUrl();
      const fallbackUrl = `${baseUrl}/direct-checkout?plan=${plan.toLowerCase()}&userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`;
      
      console.log(`Redirecting to fallback URL: ${fallbackUrl}`);
      window.location.href = fallbackUrl;
      
      return true;
    } catch (fallbackError) {
      console.error('Fallback checkout method failed:', fallbackError);
      return false;
    }
  }
};

/**
 * Get user subscription data with multiple endpoint fallbacks
 * @param {string} userId - The user's ID
 * @returns {Promise<Object>} - Subscription data
 */
export const getUserSubscriptionData = async (userId) => {
  // Log debugging information
  console.log('Fetching subscription data for user:', userId);
  
  // Create a list of endpoints to try (in order of preference)
  const baseUrl = getBaseUrl();
  const endpoints = [
    // Try direct www endpoint first for most reliable connection
    `https://www.fishcad.com/api/pricing/user-subscription/${userId}`,
    // Then try relative paths which may work in some environments  
    `/api/pricing/user-subscription/${userId}`,
    // Then try explicit baseUrl construction (prevent double /api/ by checking if baseUrl ends with /api)
    `${baseUrl}${baseUrl.endsWith('/api') ? '' : '/api'}/pricing/user-subscription/${userId}`
  ];
  
  // Log the endpoints we're going to try
  console.log('Attempting to fetch subscription data with these endpoints:', endpoints);
  
  // Try each endpoint until one works
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`Attempting to fetch subscription with endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include'
      });
      
      // Log response status for debugging
      console.log(`${endpoint} response status:`, response.status);
      
      // Check if the response is valid
      if (response.ok) {
        const data = await response.json();
        console.log('Subscription data response:', data);
        return data;
      } else {
        // Try to get error details
        try {
          const errorData = await response.json();
          console.error(`Error response from ${endpoint}:`, errorData);
        } catch (e) {
          console.error(`Error parsing error response from ${endpoint}:`, e);
        }
      }
    } catch (error) {
      console.error(`Error with endpoint ${endpoint}:`, error);
      lastError = error;
      // Continue to the next endpoint
    }
  }
  
  // If we get here, all endpoints failed
  throw new Error(lastError ? 
    `Failed to fetch subscription data: ${lastError.message}` : 
    'Failed to fetch subscription data with all available endpoints'
  );
};

// Export the direct checkout function as default
export default directStripeCheckout; 