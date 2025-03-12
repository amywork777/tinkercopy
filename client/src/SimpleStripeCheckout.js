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
  console.log('Starting checkout with simplified approach...');
  
  try {
    // FIRST ATTEMPT: Use the direct checkout page (most reliable)
    const directCheckoutUrl = new URL('/direct-checkout', window.location.origin);
    directCheckoutUrl.searchParams.append('plan', planType);
    
    // Add optional parameters if available
    if (userEmail) directCheckoutUrl.searchParams.append('email', userEmail);
    if (userId) directCheckoutUrl.searchParams.append('userId', userId);
    
    console.log('Redirecting to direct checkout page:', directCheckoutUrl.toString());
    window.location.href = directCheckoutUrl.toString();
    return;
  } catch (error) {
    console.error('Direct checkout redirect failed, trying fallback:', error);
    
    // FALLBACK: Try the simple checkout endpoint
    try {
      const simpleCheckoutUrl = new URL('/simple-checkout', window.location.origin);
      simpleCheckoutUrl.searchParams.append('plan', planType);
      
      console.log('Redirecting to simple checkout:', simpleCheckoutUrl.toString());
      window.location.href = simpleCheckoutUrl.toString();
      return;
    } catch (fallbackError) {
      console.error('All checkout methods failed:', fallbackError);
      alert('Unable to start checkout process. Please try refreshing the page or contact support.');
    }
  }
} 