/**
 * Simple function to directly redirect to Stripe checkout
 * This is the most reliable method as it requires no server involvement
 */

// Hard-coded Stripe keys for checkout
const STRIPE_KEYS = {
  // Live mode keys
  LIVE: {
    PUBLISHABLE_KEY: 'pk_live_51QIaT9CLoBz9jXRlVEQ99Q6V4UiRSYy8ZS49MelsW8EfX1mEijh3K5JQEe5iysIL31cGtf2IsTVIyV1mivoUHCUI00aPpz3GMi',
    MONTHLY_PRICE: 'price_1R1jGiCLoBz9jXRlB1uLgvE9', 
    ANNUAL_PRICE: 'price_1R1jGgCLoBz9jXRluMN6PsNw'
  },
  // Test mode keys (from previous implementations)
  TEST: {
    PUBLISHABLE_KEY: 'pk_test_51QIaT9CLoBz9jXRlPLnbvmbMNLXKdHB3gNr3bQiaMKW2iaqZXiiYrgylWHwLI1bSM4QRYiCHUMT17YTrDim4gG2M00uXEYHwx0',
    MONTHLY_PRICE: 'price_1R1LlMCLoBz9jXRl3OQ5Q6kE',
    ANNUAL_PRICE: 'price_1R1LmRCLoBz9jXRlQcOuRZJd'
  }
};

// IMPORTANT: Set to true for test mode, false for live mode
const USE_TEST_MODE = true;

/**
 * Redirects directly to Stripe checkout
 * @param {string} planType - 'monthly' or 'yearly'
 * @param {string} userEmail - User's email for prefilling
 * @param {string} userId - User ID for reference
 */
export function directStripeCheckout(planType, userEmail, userId) {
  console.log('Starting DIRECT Stripe checkout in ' + (USE_TEST_MODE ? 'TEST' : 'LIVE') + ' mode...');
  console.log('Plan type:', planType);
  
  // Get the correct set of keys based on mode
  const keys = USE_TEST_MODE ? STRIPE_KEYS.TEST : STRIPE_KEYS.LIVE;
  
  // Get price ID based on plan
  const priceId = planType === 'monthly' 
    ? keys.MONTHLY_PRICE 
    : keys.ANNUAL_PRICE;
  
  console.log('Using price ID:', priceId);
  
  // Method 1: Use direct buy.stripe.com links (most reliable method)
  try {
    // These direct product links work even if other methods fail
    let directProductUrl;
    
    if (USE_TEST_MODE) {
      // Test mode direct links
      directProductUrl = planType === 'monthly'
        ? 'https://buy.stripe.com/test_28o5nBeWGcFG3iE5kk' // Monthly test product
        : 'https://buy.stripe.com/test_9AQdUn2ccdJK9D25kl'; // Annual test product
    } else {
      // Live mode direct links
      directProductUrl = planType === 'monthly'
        ? 'https://buy.stripe.com/28oe00cHF8R3fPOcMM' // Monthly live product
        : 'https://buy.stripe.com/00gaEu5d7gfnbXW28a'; // Annual live product
    }
    
    console.log('Using direct Stripe product URL:', directProductUrl);
    
    // Add customer email as a query parameter if available
    if (userEmail) {
      directProductUrl += `?prefilled_email=${encodeURIComponent(userEmail)}`;
    }
    
    // Open in a new tab
    const newTab = window.open(directProductUrl, '_blank');
    
    // If opening in a new tab fails (e.g., popup blockers), redirect the current page
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      console.log('Window.open failed, redirecting current page...');
      window.location.href = directProductUrl;
    }
    
    return;
  } catch (error) {
    console.error('Error with direct product URL:', error);
    // Continue to fallback methods
  }
  
  // Method 2: Use Stripe's redirectToCheckout API (requires loading Stripe.js)
  try {
    console.log('Attempting to load Stripe.js for redirectToCheckout...');
    
    // Load the Stripe.js script
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    document.head.appendChild(script);
    
    script.onload = () => {
      try {
        // Initialize Stripe
        const stripe = window.Stripe(keys.PUBLISHABLE_KEY);
        
        // Create checkout options
        const checkoutOptions = {
          lineItems: [{ price: priceId, quantity: 1 }],
          mode: 'subscription',
          successUrl: `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        };
        
        // Add customer email if available
        if (userEmail) {
          checkoutOptions.customerEmail = userEmail;
        }
        
        // Add client reference ID if available
        if (userId) {
          checkoutOptions.clientReferenceId = userId;
        }
        
        // Redirect to checkout
        stripe.redirectToCheckout(checkoutOptions)
          .then(function(result) {
            if (result.error) {
              console.error('Stripe redirectToCheckout failed:', result.error);
              // Fall through to Method 3
              useCheckoutUrl();
            }
          });
      } catch (stripeError) {
        console.error('Error initializing Stripe:', stripeError);
        // Fall through to Method 3
        useCheckoutUrl();
      }
    };
    
    script.onerror = () => {
      console.error('Failed to load Stripe.js');
      // Fall through to Method 3
      useCheckoutUrl();
    };
    
    // Don't return here - let the script load and execute
  } catch (error) {
    console.error('Error setting up Stripe.js:', error);
    // Fall through to Method 3
    useCheckoutUrl();
  }
  
  // Method 3: Use a constructed checkout URL as last resort
  function useCheckoutUrl() {
    try {
      console.log('Falling back to constructed checkout URL...');
      
      // Construct a URL for Stripe's checkout page
      const params = new URLSearchParams();
      
      // Add necessary parameters
      params.append('key', keys.PUBLISHABLE_KEY);
      params.append('success_url', `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`);
      params.append('cancel_url', `${window.location.origin}/pricing`);
      params.append('mode', 'subscription');
      
      // Add line items
      params.append('line_items[0][price]', priceId);
      params.append('line_items[0][quantity]', '1');
      
      // Add customer email if available
      if (userEmail) {
        params.append('customer_email', userEmail);
      }
      
      // Add client reference ID if available
      if (userId) {
        params.append('client_reference_id', userId);
      }
      
      // Use the correct URL format for Stripe checkout
      // Try multiple formats in case one doesn't work
      const checkoutUrls = [
        `https://checkout.stripe.com/checkout?${params.toString()}`,
        `https://checkout.stripe.com/c/pay?${params.toString()}`,
        `https://checkout.stripe.com/pay?${params.toString()}`
      ];
      
      // Try to open each URL until one works
      for (const url of checkoutUrls) {
        console.log('Trying checkout URL:', url);
        const newTab = window.open(url, '_blank');
        
        if (newTab && !newTab.closed && typeof newTab.closed !== 'undefined') {
          console.log('Successfully opened checkout in new tab');
          return;
        }
      }
      
      // If all window.open attempts fail, redirect the current page to the first URL
      console.log('All window.open attempts failed, redirecting current page...');
      window.location.href = checkoutUrls[0];
    } catch (error) {
      console.error('Error with all checkout methods:', error);
      // As an absolute last resort, alert the user
      alert('Could not open Stripe checkout. Please try again or contact support.');
    }
  }
} 