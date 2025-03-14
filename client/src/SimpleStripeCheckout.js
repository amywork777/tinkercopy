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
  
  // Use the new Stripe Checkout v3 URL format
  let checkoutUrl;
  
  // Try using the newer Checkout API if possible
  try {
    // Create parameters for Stripe checkout URL
    const params = new URLSearchParams();
    
    // Add Stripe publishable key
    params.append('key', keys.PUBLISHABLE_KEY);
    
    // Add line items (what the customer is buying)
    // Note: Stripe's hosted checkout expects line_items[0][price] format
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    
    // Set subscription mode
    params.append('mode', 'subscription');
    
    // Add success and cancel URLs
    params.append('success_url', `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${window.location.origin}/pricing`);
    
    // Add customer email if provided
    if (userEmail) {
      params.append('customer_email', userEmail);
    }
    
    // Add client reference ID if provided
    if (userId) {
      params.append('client_reference_id', userId);
    }
    
    // Build the final URL - use correct checkout endpoint
    // Fix: Using the correct Stripe checkout URL format
    checkoutUrl = `https://checkout.stripe.com/c/pay?${params.toString()}`;
    console.log('Redirecting to Stripe checkout v3:', checkoutUrl);
    
    // Try to open immediately to test if it works
    window.open(checkoutUrl, '_blank') || window.location.assign(checkoutUrl);
    return;
  } catch (error) {
    console.error('Error building checkout URL:', error);
    
    // Fallback to direct URL format
    try {
      console.log('Trying fallback direct checkout URL...');
      checkoutUrl = `https://buy.stripe.com/${USE_TEST_MODE ? '0gwe00cHF8R3fPOcMM' : '28oe00cHF8R3fPOcMM'}`;
      console.log('Using fallback direct URL:', checkoutUrl);
      
      window.open(checkoutUrl, '_blank') || window.location.assign(checkoutUrl);
      return;
    } catch (fallbackError) {
      console.error('Fallback URL also failed:', fallbackError);
      
      // Legacy v2 fallback as last resort
      checkoutUrl = `https://checkout.stripe.com/v2/checkout.js?key=${keys.PUBLISHABLE_KEY}&amount=2000&currency=usd&name=FishCAD+Pro&description=${planType === 'monthly' ? 'Monthly' : 'Annual'}+Subscription&locale=auto&zipCode=true&billingAddress=false&panelLabel=Subscribe&label=FishCAD&allowRememberMe=true&recurrent=true`;
      
      if (userEmail) {
        checkoutUrl += `&email=${encodeURIComponent(userEmail)}`;
      }
      
      console.log('Falling back to legacy checkout:', checkoutUrl);
    }
  }
  
  // First try to open in a new tab
  const newTab = window.open(checkoutUrl, '_blank');
  
  // If that failed (popup blockers), redirect the current page
  if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
    console.log('Window.open failed, redirecting current page...');
    window.location.href = checkoutUrl;
  }
} 