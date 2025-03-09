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
export const calculateModelPrice = async (
  modelData: any, 
  quantity: number = 1, 
  filamentId: string = 'white'
) => {
  try {
    console.log(`Calculating price for quantity: ${quantity}, filament: ${filamentId}`);
    
    // Prepare the payload for the API
    const payload = {
      model: modelData,
      quantity: quantity,
      filamentId: filamentId,
      options: {
        infill: 20, // Default infill percentage
        resolution: 0.2, // Default layer height in mm
      }
    };
    
    // Call the Slant 3D API to calculate price
    const response = await slantApi.post('/calculate-price', payload);
    
    // Process API response
    if (response.data) {
      const { 
        price = 0, 
        basePrice = 0,
        shippingCost = 4.99,
        totalPrice = 0,
        volume = 0, 
        weight = 0, 
        materialCost = 0, 
        printTimeCost = 0,
        estimatedPrintTime = 0
      } = response.data;
      
      // Return structured price data
      return {
        basePrice: basePrice || price || (quantity * 15), // Fallback to simple calculation
        shippingCost: shippingCost,
        totalPrice: totalPrice || (basePrice + shippingCost) || (price + shippingCost) || ((quantity * 15) + shippingCost),
        volume,
        weight,
        materialCost,
        printTimeCost,
        estimatedPrintTime,
        pricePerUnit: basePrice / quantity,
        quantity
      };
    }
    
    throw new Error('Invalid response from price calculation API');
  } catch (error) {
    console.error('Error calculating price:', error);
    
    // Fallback price calculation
    const basePrice = 15 + ((quantity - 1) * 5); // $15 for first item, $5 for each additional
    const shippingCost = 4.99;
    const totalPrice = basePrice + shippingCost + (basePrice * 0.5); // Adding 50% service fee
    
    return {
      basePrice,
      shippingCost,
      totalPrice,
      volume: 0,
      weight: 0,
      materialCost: basePrice * 0.4, // Estimate 40% material cost
      printTimeCost: basePrice * 0.6, // Estimate 60% print time cost
      estimatedPrintTime: quantity * 120, // Estimate 2 hours per item
      pricePerUnit: basePrice / quantity,
      quantity
    };
  }
};

// Submit a print job to the 3D printing service
export const submitPrintJob = async (printJobData: {
  model: any;                  // Model data (STL as base64)
  quantity: number;            // Number of copies to print
  filamentId: string;          // Selected filament/material ID
  shippingInfo: {              // Customer shipping information
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  options?: {                  // Optional printing parameters
    infill?: number;           // Infill percentage (0-100)
    resolution?: number;       // Layer height in mm
    supports?: boolean;        // Whether to generate supports
    rafts?: boolean;           // Whether to print with a raft
  };
}) => {
  try {
    console.log('Submitting print job to API');
    
    // Submit the print job to the API
    const response = await slantApi.post('/submit-job', printJobData);
    
    // Return the job information
    return {
      success: true,
      jobId: response.data?.jobId || response.data?.id || 'job-' + Math.random().toString(36).substring(2, 10),
      estimatedCompletion: response.data?.estimatedCompletion || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      trackingUrl: response.data?.trackingUrl || null,
      paymentUrl: response.data?.paymentUrl || null
    };
  } catch (error) {
    console.error('Error submitting print job:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

// Get the status of a print job
export const getPrintJobStatus = async (jobId: string) => {
  try {
    const response = await slantApi.get(`/job-status/${jobId}`);
    
    return {
      success: true,
      status: response.data?.status || 'pending',
      progress: response.data?.progress || 0,
      estimatedCompletion: response.data?.estimatedCompletion,
      trackingNumber: response.data?.trackingNumber || null,
      trackingUrl: response.data?.trackingUrl || null,
      details: response.data
    };
  } catch (error) {
    console.error('Error fetching job status:', error);
    return {
      success: false,
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
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