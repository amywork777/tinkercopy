/**
 * Simple function to directly redirect to Stripe checkout
 * This is the most reliable method as it requires no server involvement
 */

// Hard-coded Stripe keys for direct checkout
const STRIPE_KEYS = {
  PUBLISHABLE_KEY: 'pk_live_51QIaT9CLoBz9jXRlVEQ99Q6V4UiRSYy8ZS49MelsW8EfX1mEijh3K5JQEe5iysIL31cGtf2IsTVIyV1mivoUHCUI00aPpz3GMi',
  MONTHLY_PRICE: 'price_1R1jGiCLoBz9jXRlB1uLgvE9', 
  ANNUAL_PRICE: 'price_1R1jGgCLoBz9jXRluMN6PsNw'
};

/**
 * Redirects directly to Stripe checkout
 * @param {string} planType - 'monthly' or 'annual'
 * @param {string} userEmail - User's email for prefilling
 * @param {string} userId - User ID for reference
 */
export function directStripeCheckout(planType, userEmail, userId) {
  console.log('Starting DIRECT Stripe checkout...');
  
  // Get price ID based on plan
  const priceId = planType === 'monthly' 
    ? STRIPE_KEYS.MONTHLY_PRICE 
    : STRIPE_KEYS.ANNUAL_PRICE;
  
  // Create parameters for Stripe checkout URL
  const params = new URLSearchParams();
  
  // Add Stripe publishable key
  params.append('key', STRIPE_KEYS.PUBLISHABLE_KEY);
  
  // Add line items (what the customer is buying)
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
  
  // Build the final URL
  const url = `https://checkout.stripe.com/pay?${params.toString()}`;
  
  console.log('Redirecting to Stripe checkout:', url);
  
  // First try to open in a new tab
  const newTab = window.open(url, '_blank');
  
  // If that failed (popup blockers), redirect the current page
  if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
    console.log('Window.open failed, redirecting current page...');
    window.location.href = url;
  }
} 