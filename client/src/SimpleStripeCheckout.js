/**
 * Simple function to handle Stripe checkout
 * Using the most reliable methods based on current Stripe recommendations
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
 * Redirects to Stripe checkout
 * @param {string} planType - 'monthly' or 'yearly'
 * @param {string} userEmail - User's email for prefilling
 * @param {string} userId - User ID for reference
 */
export function directStripeCheckout(planType, userEmail, userId) {
  console.log('Starting Stripe checkout in ' + (USE_TEST_MODE ? 'TEST' : 'LIVE') + ' mode...');
  console.log('Plan type:', planType);
  
  // Get the correct set of keys based on mode
  const keys = USE_TEST_MODE ? STRIPE_KEYS.TEST : STRIPE_KEYS.LIVE;
  
  // Get price ID based on plan
  const priceId = planType === 'monthly' 
    ? keys.MONTHLY_PRICE 
    : keys.ANNUAL_PRICE;
  
  console.log('Using price ID:', priceId);
  
  // PREFERRED APPROACH: Use the server-side API to create a checkout session
  try {
    console.log('Calling server API to create checkout session...');
    
    // Show a loading state to the user
    showLoadingOverlay();
    
    // Call our server API to create the checkout session
    fetch('/api/pricing/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId: priceId,
        userId: userId,
        email: userEmail,
        planType: planType,
        successUrl: `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/pricing`,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        hideLoadingOverlay();
        console.log('Checkout session created:', data);
        
        if (data.url) {
          // Redirect to the checkout URL
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned from server');
        }
      })
      .catch(error => {
        hideLoadingOverlay();
        console.error('Error creating checkout session:', error);
        
        // Fall back to client-side method
        useClientSideMethod();
      });
  } catch (error) {
    hideLoadingOverlay();
    console.error('Error with server-side checkout:', error);
    
    // Fall back to client-side method
    useClientSideMethod();
  }
  
  // FALLBACK: Use client-side methods if server call fails
  function useClientSideMethod() {
    console.log('Falling back to client-side checkout method...');
    
    // Try to load Stripe.js for client-side checkout
    loadStripeJs()
      .then(stripe => {
        // Create checkout options
        const checkoutOptions = {
          lineItems: [{
            price: priceId,
            quantity: 1
          }],
          mode: 'subscription',
          successUrl: `${window.location.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        };
        
        // Add customer email if available
        if (userEmail) {
          checkoutOptions.customerEmail = userEmail;
        }
        
        console.log('Redirecting to checkout with options:', checkoutOptions);
        
        // Redirect to checkout
        return stripe.redirectToCheckout(checkoutOptions);
      })
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error.message);
        }
      })
      .catch(error => {
        console.error('Stripe.js checkout failed:', error);
        // The very last resort - alert the user
        alert('Could not initialize checkout. Please try again or contact support.');
      });
  }
}

// Helper function to load Stripe.js
function loadStripeJs() {
  return new Promise((resolve, reject) => {
    // If Stripe is already loaded, use it
    if (window.Stripe) {
      console.log('Stripe already loaded');
      const keys = USE_TEST_MODE ? STRIPE_KEYS.TEST : STRIPE_KEYS.LIVE;
      resolve(window.Stripe(keys.PUBLISHABLE_KEY));
      return;
    }
    
    console.log('Loading Stripe.js...');
    
    // Load Stripe.js script
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    
    script.onload = () => {
      if (window.Stripe) {
        console.log('Stripe.js loaded successfully');
        const keys = USE_TEST_MODE ? STRIPE_KEYS.TEST : STRIPE_KEYS.LIVE;
        resolve(window.Stripe(keys.PUBLISHABLE_KEY));
      } else {
        reject(new Error('Stripe.js loaded but Stripe is not defined'));
      }
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Stripe.js'));
    };
    
    document.head.appendChild(script);
  });
}

// Simple loading overlay functions
function showLoadingOverlay() {
  // Create a loading overlay if it doesn't exist
  if (!document.getElementById('stripe-loading-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'stripe-loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    
    const spinner = document.createElement('div');
    spinner.style.border = '5px solid #f3f3f3';
    spinner.style.borderTop = '5px solid #3498db';
    spinner.style.borderRadius = '50%';
    spinner.style.width = '50px';
    spinner.style.height = '50px';
    spinner.style.animation = 'spin 2s linear infinite';
    
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    
    document.head.appendChild(style);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);
  } else {
    document.getElementById('stripe-loading-overlay').style.display = 'flex';
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('stripe-loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
} 