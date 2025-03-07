import axios from 'axios';

// Set up the API client with the proxy endpoint
const slantApi = axios.create({
  baseURL: '/api/slant3d', // Use our local proxy
  headers: {
    'Content-Type': 'application/json'
  }
});

// Define the volume-based price estimation function
// Volume is in cubic millimeters
const estimatePriceFromVolume = (volume: number): number => {
  // If volume is not provided or invalid, use a default minimal price
  if (!volume || isNaN(volume) || volume <= 0) {
    return 15; // Minimum price
  }
  
  // Convert to cubic cm for easier calculation
  const volumeCubicCm = volume / 1000;
  
  // Basic calculation: $0.10 per cubic cm with a minimum of $15
  const calculatedPrice = Math.max(volumeCubicCm * 0.10, 15);
  
  // Cap the price at a reasonable maximum to prevent excessive costs
  const maxPrice = 300;
  
  return Math.min(calculatedPrice, maxPrice);
};

// Calculate price of 3D printing based on various factors
export const calculateModelPrice = async (modelData: any) => {
  try {
    // Prepare the payload for the API
    const payload = {
      ...modelData,
    };
    
    // Call the Slant 3D API to calculate price
    const response = await slantApi.post('/calculate-price', payload);
    
    // Extract the price from the response
    return {
      price: response.data?.price || 0,
      volume: response.data?.volume || 0,
      weight: response.data?.weight || 0,
      materialCost: response.data?.materialCost || 0,
      printTimeCost: response.data?.printTimeCost || 0,
    };
  } catch (error) {
    console.error('Error calculating price:', error);
    
    // Fallback price calculation
    const estimatedPrice = estimatePriceFromVolume(modelData.volume);
    
    return {
      price: estimatedPrice,
      volume: modelData.volume || 0,
      weight: modelData.weight || 0,
      materialCost: estimatedPrice * 0.4, // Estimate 40% material cost
      printTimeCost: estimatedPrice * 0.6, // Estimate 60% print time cost
    };
  }
};

// Calculate price from volume with proper margins based on user subscription
export const calculatePriceWithMargin = async (basePrice: number, userId?: string) => {
  try {
    // If a userId is provided and we have the subscription context, check subscription status
    if (userId) {
      try {
        // Import here to avoid circular dependencies
        const { getUserSubscription } = await import('./stripeApi');
        const subscription = await getUserSubscription(userId);
        
        // Apply discount for Pro users - 40% margin instead of 50%
        if (subscription.isPro) {
          // 40% margin means multiply by 1.67 (1/0.6) instead of 2.0 (1/0.5)
          return parseFloat((basePrice * 1.67).toFixed(2));
        }
      } catch (error) {
        console.error('Error checking subscription for pricing:', error);
        // Fall back to standard pricing if there's an error
      }
    }
    
    // Standard pricing for non-Pro users (50% margin)
    return parseFloat((basePrice * 2.0).toFixed(2));
  } catch (error) {
    console.error('Error calculating price with margin:', error);
    // If any error occurs, fall back to standard pricing
    return parseFloat((basePrice * 2.0).toFixed(2));
  }
};

// Get available materials/filaments
export const getFilaments = async () => {
  try {
    const response = await slantApi.get('/filament');
    
    // Process the response to ensure it's an array of filament objects
    if (Array.isArray(response.data)) {
      return response.data;
    } else if (response.data && response.data.filaments && Array.isArray(response.data.filaments)) {
      return response.data.filaments;
    } else {
      console.warn('Unexpected response format from filament API:', response.data);
      // Return default filaments if API response format is unexpected
      return [
        { id: 'black', name: 'Black', hex: '#000000' },
        { id: 'white', name: 'White', hex: '#ffffff' },
        { id: 'gray', name: 'Gray', hex: '#808080' },
        { id: 'red', name: 'Red', hex: '#ff0000' },
        { id: 'blue', name: 'Blue', hex: '#0000ff' }
      ];
    }
  } catch (error) {
    console.error('Error fetching filaments:', error);
    // Return default filaments on error
    return [
      { id: 'black', name: 'Black', hex: '#000000' },
      { id: 'white', name: 'White', hex: '#ffffff' },
      { id: 'gray', name: 'Gray', hex: '#808080' },
      { id: 'red', name: 'Red', hex: '#ff0000' },
      { id: 'blue', name: 'Blue', hex: '#0000ff' }
    ];
  }
};

// Create a payment link
export const createPaymentLink = async (orderData: any) => {
  try {
    const response = await slantApi.post('/payment-link', orderData);
    
    // Ensure consistent response format
    return {
      success: true,
      paymentUrl: response.data?.paymentUrl || response.data?.payment_url || 'https://example.com/payment'
    };
  } catch (error) {
    console.error('Error creating payment link:', error);
    // Return a simulated payment link on error
    return {
      success: false,
      paymentUrl: 'https://example.com/payment?simulation=true'
    };
  }
};

export default slantApi; 