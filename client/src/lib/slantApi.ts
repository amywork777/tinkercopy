import axios from 'axios';

// Set up the API client with the proxy endpoint
const slantApi = axios.create({
  baseURL: '/api/slant3d', // Use our local proxy
  headers: {
    'Content-Type': 'application/json'
  }
});

// Define the volume-based price estimation function
// Volume is in cubic millimeters - used for fallback only
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

// Calculate price of 3D printing based on file uploaded to a URL
export const calculatePrice = async (fileData: string, options: {
  filament?: string;
  quantity?: number;
  name?: string;
} = {}) => {
  try {
    console.log(`Calculating price for model data (first 50 chars): ${fileData.substring(0, 50)}...`);
    
    // Check if the data is in base64 format (starts with data:)
    const isBase64 = fileData.startsWith('data:');
    
    // Prepare the payload for the API based on Slant3D documentation format
    let payload;
    
    if (isBase64) {
      // For base64 data URL, extract the actual data part after the comma
      const base64Data = fileData.split(',')[1];
      
      // Build the expected format for Slant3D API
      payload = {
        model: base64Data,
        fileData, // Keep the original data URL as backup
        filament: options.filament || 'PLA BLACK',
        quantity: options.quantity || 1,
        name: options.name || 'Model',
        options: {
          scale: 1.0,
          infill: 20, // Default infill percentage
          resolution: 0.2, // Default layer height in mm
        }
      };
      
      console.log(`Sending to Slant3D API with model data in structured format`);
    } else {
      // If not base64, treat as URL
      payload = { 
        fileURL: fileData,
        filament: options.filament || 'PLA BLACK',
        quantity: options.quantity || 1
      };
      console.log(`Sending to Slant3D API with file URL`);
    }
    
    console.log('Payload structure (without full file data):', {
      ...payload,
      model: payload.model ? '[BASE64 DATA]' : undefined,
      fileData: payload.fileData ? '[BASE64 DATA URL]' : undefined
    });
    
    // Call the Slant 3D API slicer endpoint as per documentation
    const response = await slantApi.post('/slicer', payload);
    console.log('Slicer response:', response.data);
    
    if (response.data && response.data.data && response.data.data.price) {
      // Extract price from response (format: "$8.23")
      const priceString = response.data.data.price;
      // Remove any non-numeric characters except decimal point
      const price = parseFloat(priceString.replace(/[^0-9.]/g, ''));
      
      return {
        success: true,
        price,
        message: response.data.message || 'Slicing successful'
      };
    }
    
    // Handle case where response is valid but doesn't have expected price format
    if (response.data && response.status === 200) {
      // Try to extract any numeric value that could be a price
      let price = 15; // Default fallback
      
      // If response data contains a direct price value
      if (typeof response.data.price === 'number') {
        price = response.data.price;
      } else if (typeof response.data.price === 'string') {
        price = parseFloat(response.data.price.replace(/[^0-9.]/g, ''));
      } else if (response.data.data && typeof response.data.data.price === 'number') {
        price = response.data.data.price;
      }
      
      return {
        success: true,
        price,
        message: 'Price calculated (non-standard response format)'
      };
    }
    
    return {
      success: false,
      price: 0,
      message: 'Invalid response from price calculation API'
    };
  } catch (error) {
    console.error('Error calculating price:', error);
    
    // Check for specific error types for better user feedback
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorMessage = error.response?.data?.error || error.message;
      const details = error.response?.data?.details || {};
      
      console.log(`API error with status ${statusCode}: ${errorMessage}`, details);
      
      return {
        success: false,
        price: 15, // Default fallback price
        message: `API error (${statusCode}): ${errorMessage}`,
        details
      };
    }
    
    // Fallback price calculation
    return {
      success: false,
      price: 15, // Default fallback price
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Estimate order cost including shipping
export const estimateOrder = async (orderData: any) => {
  try {
    console.log('Estimating order cost');
    
    // Call the Slant 3D API order estimate endpoint as per documentation
    const response = await slantApi.post('/order/estimate', [orderData]);
    
    if (response.data) {
      const { totalPrice = 0, shippingCost = 0, printingCost = 0 } = response.data;
      
      return {
        success: true,
        totalPrice,
        shippingCost,
        printingCost
      };
    }
    
    return {
      success: false,
      totalPrice: 0,
      shippingCost: 0,
      printingCost: 0,
      message: 'Invalid response from order estimate API'
    };
  } catch (error) {
    console.error('Error estimating order:', error);
    
    return {
      success: false,
      totalPrice: 0,
      shippingCost: 0,
      printingCost: 0,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Estimate shipping cost based on address
export const estimateShipping = async (orderData: any) => {
  try {
    console.log('Estimating shipping cost');
    
    // Call the Slant 3D API shipping estimate endpoint as per documentation
    const response = await slantApi.post('/order/estimateShipping', [orderData]);
    
    if (response.data) {
      const { shippingCost = 0, currencyCode = 'usd' } = response.data;
      
      return {
        success: true,
        shippingCost,
        currencyCode
      };
    }
    
    return {
      success: false,
      shippingCost: 0,
      currencyCode: 'usd',
      message: 'Invalid response from shipping estimate API'
    };
  } catch (error) {
    console.error('Error estimating shipping:', error);
    
    return {
      success: false,
      shippingCost: 4.99, // Default fallback shipping cost
      currencyCode: 'usd',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Create an order with Slant 3D
export const createOrder = async (orderData: any) => {
  try {
    console.log('Creating order with Slant 3D');
    
    // Call the Slant 3D API order endpoint as per documentation
    const response = await slantApi.post('/order', [orderData]);
    
    if (response.data && response.data.orderId) {
      return {
        success: true,
        orderId: response.data.orderId,
        message: 'Order created successfully'
      };
    }
    
    return {
      success: false,
      message: 'Invalid response from order API'
    };
  } catch (error) {
    console.error('Error creating order:', error);
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Get tracking information for an order
export const getTracking = async (orderId: string) => {
  try {
    console.log(`Getting tracking for order: ${orderId}`);
    
    // Call the Slant 3D API tracking endpoint as per documentation
    const response = await slantApi.get(`/order/${orderId}/get-tracking`);
    
    if (response.data) {
      const { status = 'unknown', trackingNumbers = [] } = response.data;
      
      return {
        success: true,
        status,
        trackingNumbers,
        message: 'Tracking information retrieved successfully'
      };
    }
    
    return {
      success: false,
      status: 'unknown',
      trackingNumbers: [],
      message: 'Invalid response from tracking API'
    };
  } catch (error) {
    console.error('Error getting tracking:', error);
    
    return {
      success: false,
      status: 'unknown',
      trackingNumbers: [],
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Get available filaments
export const getFilaments = async () => {
  try {
    const response = await slantApi.get('/filament');
    
    // Process the response according to documented format
    if (response.data && response.data.filaments && Array.isArray(response.data.filaments)) {
      // Map to our expected format
      return response.data.filaments.map((item: any) => ({
        id: item.colorTag || item.filament, // Use colorTag as documented
        name: item.filament || 'Unknown', 
        hex: item.hexColor || '808080'
      }));
    } else {
      console.warn('Unexpected response format from filament API:', response.data);
      // Return default filaments if API response format is unexpected
      return [
        { id: 'black', name: 'PLA BLACK', hex: '000000' },
        { id: 'white', name: 'PLA WHITE', hex: 'ffffff' },
        { id: 'gray', name: 'PLA GRAY', hex: '808080' },
        { id: 'red', name: 'PLA RED', hex: 'ff0000' },
        { id: 'blue', name: 'PLA BLUE', hex: '0000ff' }
      ];
    }
  } catch (error) {
    console.error('Error fetching filaments:', error);
    // Return default filaments on error
    return [
      { id: 'black', name: 'PLA BLACK', hex: '000000' },
      { id: 'white', name: 'PLA WHITE', hex: 'ffffff' },
      { id: 'gray', name: 'PLA GRAY', hex: '808080' },
      { id: 'red', name: 'PLA RED', hex: 'ff0000' },
      { id: 'blue', name: 'PLA BLUE', hex: '0000ff' }
    ];
  }
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
    // Standard pricing for all users (50% margin)
    return parseFloat((basePrice * 2.0).toFixed(2));
  } catch (error) {
    console.error('Error calculating price with margin:', error);
    // If any error occurs, fall back to standard pricing
    return parseFloat((basePrice * 2.0).toFixed(2));
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

// Calculate price using the Mandarin 3D proxy endpoint
export const calculatePriceWithMandarin3D = async (
  modelData: Blob | string, 
  quantity: number = 1, 
  filament: string = 'PLA'
) => {
  try {
    console.log(`Calculating price using Mandarin 3D service, quantity: ${quantity}, filament: ${filament}`);
    
    // Create a FormData object to upload the STL file
    const formData = new FormData();
    
    // Add the file to the form data
    if (modelData instanceof Blob) {
      formData.append('model', modelData, 'model.stl');
    } else if (typeof modelData === 'string' && modelData.startsWith('data:')) {
      // Convert data URL to Blob
      const response = await fetch(modelData);
      const blob = await response.blob();
      formData.append('model', blob, 'model.stl');
    } else {
      throw new Error('Invalid model data format');
    }
    
    // Add additional parameters
    formData.append('quantity', quantity.toString());
    formData.append('filament', filament);
    
    // Send the request to our server-side proxy
    const response = await axios.post('/api/mandarin3d/calculate-price', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    console.log('Mandarin 3D price response:', response.data);
    
    if (response.data && response.data.success) {
      return {
        success: true,
        price: response.data.price,
        basePrice: response.data.basePrice,
        totalPrice: response.data.totalPrice,
        materialCost: response.data.materialCost,
        printingCost: response.data.printingCost,
        shippingCost: response.data.shippingCost || 4.99,
        message: response.data.message
      };
    }
    
    return {
      success: false,
      price: 15, // Default fallback price
      message: 'Invalid response from price calculation service'
    };
  } catch (error) {
    console.error('Error calculating price with Mandarin 3D:', error);
    
    // Fallback price calculation
    const basePrice = 15 + ((quantity - 1) * 5);
    
    return {
      success: false,
      price: basePrice,
      message: error instanceof Error ? error.message : 'Unknown error',
      basePrice: basePrice,
      totalPrice: basePrice + 4.99,
      materialCost: basePrice * 0.4,
      printingCost: basePrice * 0.6,
      shippingCost: 4.99
    };
  }
};

// Calculate price using our custom pricing algorithm
export const calculate3DPrintPrice = async (
  modelData: Blob | string, 
  quantity: number = 1, 
  material: string = 'PLA'
) => {
  try {
    console.log(`Calculating 3D print price, quantity: ${quantity}, material: ${material}`);
    
    // If modelData is a Blob, convert to data URL
    let modelDataToSend = modelData;
    if (modelData instanceof Blob) {
      // Convert blob to base64 data URL
      modelDataToSend = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to convert model to data URL'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(modelData);
      });
      console.log(`Converted model blob to data URL (${Math.round(modelDataToSend.length / 1024)}KB)`);
    }
    
    // Send the request to our pricing endpoint
    const response = await axios.post('/api/calculate-price', {
      modelData: modelDataToSend,
      quantity,
      material
    });
    
    console.log('Price calculation response:', response.data);
    
    if (response.data && response.data.success) {
      return {
        success: true,
        basePrice: response.data.basePrice,
        totalBasePrice: response.data.totalBasePrice,
        materialCost: response.data.materialCost,
        printingCost: response.data.printingCost,
        shippingCost: response.data.shippingCost,
        totalPrice: response.data.totalPrice,
        estimatedPrintTime: response.data.estimatedPrintTime,
        message: response.data.message
      };
    }
    
    // If the response indicates failure but has price data
    if (response.data && response.data.basePrice) {
      return {
        success: false,
        basePrice: response.data.basePrice,
        totalBasePrice: response.data.totalBasePrice,
        materialCost: response.data.materialCost,
        printingCost: response.data.printingCost,
        shippingCost: response.data.shippingCost,
        totalPrice: response.data.totalPrice,
        message: response.data.message || 'Price calculated with reduced accuracy'
      };
    }
    
    // Default fallback
    throw new Error('Invalid response from price calculation service');
  } catch (error) {
    console.error('Error calculating 3D print price:', error);
    
    // Fallback price calculation
    const basePrice = 15 + ((quantity - 1) * 5);
    
    return {
      success: false,
      basePrice: basePrice,
      totalBasePrice: basePrice,
      materialCost: basePrice * 0.4,
      printingCost: basePrice * 0.6,
      shippingCost: 4.99,
      totalPrice: basePrice + 4.99,
      message: error instanceof Error ? error.message : 'Error calculating price'
    };
  }
};

export default slantApi; 