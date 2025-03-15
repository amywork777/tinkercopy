/**
 * Stripe checkout implementation using server-side session creation
 * This is more reliable than direct URLs
 */

// Hard-coded Stripe keys for checkout
const STRIPE_KEYS = {
  // Live mode keys
  LIVE: {
    PUBLISHABLE_KEY: 'pk_live_51QIaT9CLoBz9jXRlVEQ99Q6V4UiRSYy8ZS49MelsW8EfX1mEijh3K5JQEe5iysIL31cGtf2IsTVIyV1mivoUHCUI00aPpz3GMi',
    MONTHLY_PRICE: 'price_1QzyJ0CLoBz9jXRlwdxlAQKZ', 
    // Annual price removed - only using monthly plan
  },
  // Test mode keys (from previous implementations)
  TEST: {
    PUBLISHABLE_KEY: 'pk_test_51QIaT9CLoBz9jXRlPLnbvmbMNLXKdHB3gNr3bQiaMKW2iaqZXiiYrgylWHwLI1bSM4QRYiCHUMT17YTrDim4gG2M00uXEYHwx0',
    MONTHLY_PRICE: 'price_1R1LlMCLoBz9jXRl3OQ5Q6kE',
    // Annual price removed - only using monthly plan
  }
};

// Configuration settings
const API_CONFIG = {
  BASE_URL: '/api',
  DIRECT_URL: 'http://localhost:9090/api', // Fallback direct URL if relative paths fail
  CHECKOUT_ENDPOINT: '/pricing/create-checkout-session',
  ALT_CHECKOUT_ENDPOINT: '/create-checkout-session',
  HEALTH_CHECK_ENDPOINT: '/health-check'
};

// IMPORTANT: Set to true for test mode, false for live mode
const USE_TEST_MODE = false;

/**
 * Creates a checkout session via the server and redirects to Stripe
 * @param {string} planType - 'monthly' or 'annual' (always uses monthly regardless of input)
 * @param {string} userEmail - User's email for prefilling
 * @param {string} userId - User ID for reference
 * @returns {Promise<void>}
 */
export async function directStripeCheckout(planType, userEmail, userId) {
  console.log('Starting checkout with simplified approach...');
  
  // Input validation
  if (!userEmail) {
    console.error('Email is required for checkout');
    alert('Please log in to continue with checkout.');
    return;
  }
  
  // Enforce userId being available - if not, create a temporary one
  // This prevents server-side issues with empty user IDs
  const safeUserId = userId && userId.trim() !== '' 
    ? userId.trim()
    : `temp_user_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  console.log('Using user ID for checkout:', safeUserId);
  
  // Always use monthly plan
  const actualPlanType = 'monthly';
  const priceId = STRIPE_KEYS.LIVE.MONTHLY_PRICE;
  
  // Helper function to attempt both relative and direct URLs
  const fetchWithFallback = async (endpoint, options) => {
    // Try relative URL first
    try {
      const relativeUrl = `${API_CONFIG.BASE_URL}${endpoint}`;
      console.log('Attempting fetch with relative URL:', relativeUrl);
      const response = await fetch(relativeUrl, options);
      
      if (response.ok) {
        return response;
      }
      
      console.warn(`Relative URL failed with status ${response.status}, trying direct URL`);
    } catch (error) {
      console.warn('Relative URL fetch failed:', error.message);
    }
    
    // Fall back to direct URL
    const directUrl = `${API_CONFIG.DIRECT_URL}${endpoint}`;
    console.log('Attempting fetch with direct URL:', directUrl);
    return fetch(directUrl, options);
  };
  
  try {
    // First try direct API call to server checkout endpoint
    console.log('Creating checkout session with:', {
      priceId,
      userId: safeUserId,
      email: userEmail
    });
    
    // Make the API call to create a checkout session
    const response = await fetchWithFallback(API_CONFIG.CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        priceId,
        userId: safeUserId,
        email: userEmail,
        testMode: false, // Ensure we use live mode, not test mode
        domain: window.location.origin
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server error response:', errorText);
      throw new Error(`Server responded with status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Checkout session created successfully:', data);
    
    if (data.success && data.checkoutUrl) {
      console.log('Redirecting to Stripe checkout:', data.checkoutUrl);
      window.location.href = data.checkoutUrl;
      return;
    } else if (data.url) {
      console.log('Redirecting to Stripe checkout:', data.url);
      window.location.href = data.url;
      return;
    } else {
      throw new Error(data.error || 'Failed to create checkout session');
    }
  } catch (error) {
    console.error('Direct checkout failed:', error);
    
    // Try alternative method - direct API call to /api/create-checkout-session
    try {
      console.log('Attempting alternative checkout endpoint...');
      const altResponse = await fetchWithFallback(API_CONFIG.ALT_CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          userId: safeUserId,
          email: userEmail,
          testMode: false, // Ensure we use live mode here too
          success_url: `${window.location.origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/pricing`
        }),
      });
      
      if (!altResponse.ok) {
        const errorText = await altResponse.text();
        console.error('Alternative endpoint error:', errorText);
        throw new Error(`Alternative endpoint failed with status ${altResponse.status}: ${errorText}`);
      }
      
      const altData = await altResponse.json();
      if (altData.url) {
        console.log('Redirecting to Stripe checkout from alt endpoint:', altData.url);
        window.location.href = altData.url;
        return;
      }
      
      throw new Error('Alternative endpoint response missing checkout URL');
    } catch (altError) {
      console.error('All checkout methods failed:', altError);
      alert('Unable to connect to the payment server. Please try again later or contact support if the issue persists.');
      
      // For better debugging, check if we can connect to the server at all
      try {
        fetchWithFallback(API_CONFIG.HEALTH_CHECK_ENDPOINT)
          .then(response => {
            console.log('Server health check:', response.status);
          })
          .catch(err => {
            console.error('Server appears to be offline:', err);
          });
      } catch (e) {
        console.error('Failed to even check server health:', e);
      }
    }
  }
} 