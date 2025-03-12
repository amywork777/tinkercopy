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
    ANNUAL_PRICE: 'price_1QzyJNCLoBz9jXRlXE8bsC68'
  },
  // Test mode keys (from previous implementations)
  TEST: {
    PUBLISHABLE_KEY: 'pk_test_51QIaT9CLoBz9jXRlPLnbvmbMNLXKdHB3gNr3bQiaMKW2iaqZXiiYrgylWHwLI1bSM4QRYiCHUMT17YTrDim4gG2M00uXEYHwx0',
    MONTHLY_PRICE: 'price_1R1LlMCLoBz9jXRl3OQ5Q6kE',
    ANNUAL_PRICE: 'price_1R1LmRCLoBz9jXRlQcOuRZJd'
  }
};

// IMPORTANT: Set to true for test mode, false for live mode
const USE_TEST_MODE = false;

/**
 * Creates a checkout session via the server and redirects to Stripe
 * @param {string} planType - 'monthly' or 'annual'
 * @param {string} userEmail - User's email for prefilling
 * @param {string} userId - User ID for reference
 * @returns {Promise<void>}
 */
export async function directStripeCheckout(planType, userEmail, userId) {
  console.log('Starting simple checkout in ' + (USE_TEST_MODE ? 'TEST' : 'LIVE') + ' mode...');
  
  // Get the correct set of keys based on mode
  const keys = USE_TEST_MODE ? STRIPE_KEYS.TEST : STRIPE_KEYS.LIVE;
  
  // Get price ID based on plan
  const priceId = planType === 'monthly' 
    ? keys.MONTHLY_PRICE 
    : keys.ANNUAL_PRICE;
  
  console.log('Using price ID:', priceId);
  
  try {
    // FIRST ATTEMPT: Use the super simple checkout endpoint (most reliable)
    const simpleCheckoutUrl = new URL('/simple-checkout', window.location.origin);
    simpleCheckoutUrl.searchParams.append('plan', planType);
    
    console.log('Redirecting to simple checkout:', simpleCheckoutUrl.toString());
    window.location.href = simpleCheckoutUrl.toString();
    return;
  } catch (error) {
    console.error('Simple checkout redirect failed:', error);
    
    // SECOND ATTEMPT: Try the API endpoint with query parameters for GET
    try {
      const serverUrl = new URL('/api/pricing/create-checkout-session', window.location.origin);
      
      // Add query parameters
      serverUrl.searchParams.append('priceId', priceId);
      if (userId) serverUrl.searchParams.append('userId', userId);
      if (userEmail) serverUrl.searchParams.append('email', userEmail);
      
      console.log('Making server request to:', serverUrl.toString());
      
      // Make the request
      const response = await fetch(serverUrl.toString());
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      // Parse the response
      const data = await response.json();
      
      if (data.url) {
        console.log('Redirecting to Stripe checkout:', data.url);
        window.location.href = data.url;
        return;
      } else {
        throw new Error('Server did not return a checkout URL');
      }
    } catch (apiError) {
      console.error('API checkout failed:', apiError);
      
      // THIRD ATTEMPT: Fallback to POST request if GET fails
      try {
        console.log('Trying POST request fallback...');
        
        const response = await fetch('/api/pricing/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId,
            userId,
            email: userEmail
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.url) {
          console.log('Redirecting to Stripe checkout from POST:', data.url);
          window.location.href = data.url;
          return;
        } else {
          throw new Error('Server did not return a checkout URL from POST');
        }
      } catch (postError) {
        console.error('POST request failed:', postError);
        
        // LAST ATTEMPT: Fall back to legacy checkout endpoints
        try {
          console.log('Trying legacy checkout endpoints...');
          
          // Try each of these paths in order
          const possiblePaths = [
            '/pricing/create-checkout-session',
            '/create-checkout-session',
            '/stripe/create-checkout-session'
          ];
          
          for (const path of possiblePaths) {
            try {
              console.log(`Trying ${path}...`);
              const response = await fetch(`${path}?priceId=${priceId}`);
              
              if (response.ok) {
                const data = await response.json();
                if (data.url) {
                  console.log(`Success with ${path}! Redirecting to:`, data.url);
                  window.location.href = data.url;
                  return;
                }
              }
            } catch (e) {
              console.error(`Failed with ${path}:`, e);
              // Continue to next path
            }
          }
          
          throw new Error('All legacy paths failed');
        } catch (legacyError) {
          console.error('All server methods failed:', legacyError);
          
          // ABSOLUTE LAST RESORT: Direct URL (unlikely to work but worth a try)
          console.log('LAST RESORT: Trying direct URL approach...');
          
          // Use Stripe's hosted checkout page directly
          const params = new URLSearchParams();
          params.append('key', keys.PUBLISHABLE_KEY);
          params.append('line_items[0][price]', priceId);
          params.append('line_items[0][quantity]', '1');
          params.append('mode', 'subscription');
          params.append('success_url', `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`);
          params.append('cancel_url', `${window.location.origin}/pricing`);
          
          if (userEmail) {
            params.append('customer_email', userEmail);
          }
          
          if (userId) {
            params.append('client_reference_id', userId);
          }
          
          // Use the more reliable direct checkout URL format
          const checkoutUrl = USE_TEST_MODE 
            ? `https://checkout.stripe.com/c/pay/${priceId}?${params.toString()}`
            : `https://checkout.stripe.com/c/pay/${priceId}?${params.toString()}`;
            
          console.log('Last resort direct URL:', checkoutUrl);
          window.location.href = checkoutUrl;
        }
      }
    }
  }
} 