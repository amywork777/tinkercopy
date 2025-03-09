import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScene } from "@/hooks/use-scene";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import * as THREE from 'three';
import { 
  Printer, 
  Package, 
  Truck, 
  CreditCard, 
  ArrowRight, 
  CheckCircle2, 
  Loader2,
  AlertCircle
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calculateModelPrice, getFilaments, createPaymentLink, submitPrintJob, getPrintJobStatus } from "@/lib/slantApi";

// Initialize with empty array, will be populated from API
const EMPTY_FILAMENT_COLORS: FilamentColor[] = [];

interface FilamentColor {
  id: string;
  name: string;
  hex: string;
}

interface FilamentApiItem {
  id?: string;
  filament?: string;
  name?: string;
  hex?: string;
  color?: string;
  [key: string]: any; // For any other properties
}

interface ShippingFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const Print3DTab = () => {
  const { models, selectedModelIndex, exportSelectedModelAsSTL } = useScene();
  const { toast } = useToast();
  
  // State variables
  const [selectedFilament, setSelectedFilament] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [basePrice, setBasePrice] = useState(15);
  const [shippingCost, setShippingCost] = useState(4.99);
  const [finalPrice, setFinalPrice] = useState(29.98);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPriceCalculating, setIsPriceCalculating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedModelData, setUploadedModelData] = useState<any>(null);
  const [filamentColors, setFilamentColors] = useState<FilamentColor[]>(EMPTY_FILAMENT_COLORS);
  const [isLoadingFilaments, setIsLoadingFilaments] = useState(false);
  const [printJob, setPrintJob] = useState<{
    jobId: string;
    status: string;
    estimatedCompletion?: string;
    trackingUrl?: string;
    paymentUrl?: string;
  } | null>(null);
  
  // Form state
  const [shippingInfo, setShippingInfo] = useState<ShippingFormData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: ''
  });
  const [paymentLink, setPaymentLink] = useState('');
  
  // Fetch filaments when component mounts
  useEffect(() => {
    fetchFilaments();
  }, []);
  
  // Fetch filaments from the API
  const fetchFilaments = async () => {
    setIsLoadingFilaments(true);
    try {
      const response = await getFilaments();
      console.log('Filament API response:', response);
      
      // Normalize the data to ensure consistent structure
      let colors = [];
      
      if (Array.isArray(response)) {
        colors = response.map((item: FilamentApiItem) => ({
          id: item.id || item.filament || item.name || 'unknown',
          name: item.name || item.filament || 'Unknown Color',
          hex: item.hex || item.color || '#808080'
        }));
      } else if (response && response.filaments && Array.isArray(response.filaments)) {
        colors = response.filaments.map((item: FilamentApiItem) => ({
          id: item.id || item.filament || item.name || 'unknown',
          name: item.name || item.filament || 'Unknown Color',
          hex: item.hex || item.color || '#808080'
        }));
      }
      
      console.log('Normalized filament colors:', colors);
      
      // Use fallback if no valid colors found
      if (colors.length === 0) {
        colors = [
          { id: 'black', name: 'Black', hex: '#000000' },
          { id: 'white', name: 'White', hex: '#ffffff' },
          { id: 'gray', name: 'Gray', hex: '#808080' },
          { id: 'red', name: 'Red', hex: '#ff0000' },
          { id: 'blue', name: 'Blue', hex: '#0000ff' }
        ];
      }
      
      setFilamentColors(colors);
      if (colors.length > 0) {
        setSelectedFilament(colors[0].id);
      }
    } catch (err) {
      console.error('Error fetching filaments:', err);
      toast({
        title: "Failed to load filaments",
        description: "Using demo colors instead",
        variant: "destructive"
      });
      // Fallback to demo colors if API fails
      const demoColors = [
        { id: 'black', name: 'Black', hex: '#000000' },
        { id: 'white', name: 'White', hex: '#ffffff' },
        { id: 'gray', name: 'Gray', hex: '#808080' },
        { id: 'red', name: 'Red', hex: '#ff0000' },
        { id: 'blue', name: 'Blue', hex: '#0000ff' }
      ];
      setFilamentColors(demoColors);
      setSelectedFilament(demoColors[0].id);
    } finally {
      setIsLoadingFilaments(false);
    }
  };
  
  // Recalculate price when model or options change
  useEffect(() => {
    console.log('Price calculation trigger check:', { 
      selectedModelIndex, 
      selectedFilament, 
      quantity, 
      uploadedModelData: !!uploadedModelData,
      isPreparing
    });
    
    if ((selectedModelIndex !== null || uploadedModelData) && 
        selectedFilament && 
        quantity > 0 && 
        !isPreparing) {
      console.log('Triggering price calculation');
      calculatePrice();
    }
  }, [selectedModelIndex, selectedFilament, quantity, uploadedModelData, isPreparing]);

  // Function to calculate the price using the Slant 3D API
  const calculatePrice = async () => {
    if ((selectedModelIndex === null && !uploadedModelData) || !selectedFilament) {
      console.log('Skipping price calculation - missing model or filament');
      return;
    }
    
    console.log('Starting price calculation');
    setIsPriceCalculating(true);
    setError(null);
    
    // Set reasonable fallback prices that scale with quantity
    // Base price formula: $15 base + $5 per additional quantity
    const fallbackBasePrice = 15 + ((quantity - 1) * 5);
    const fallbackShipping = 4.99;
    const serviceFee = (fallbackBasePrice + fallbackShipping) * 0.5;
    const fallbackTotal = fallbackBasePrice + fallbackShipping + serviceFee;
    
    console.log('Setting initial fallback prices:', {
      fallbackBasePrice,
      fallbackShipping, 
      serviceFee,
      fallbackTotal
    });
    
    // Set fallback values right away so UI always shows something
    setBasePrice(fallbackBasePrice);
    setShippingCost(fallbackShipping);
    setFinalPrice(fallbackTotal);
    
    try {
      let modelData;
      let modelVolume = 0;
      
      // Get model data either from the scene or from the uploaded file
      if (uploadedModelData) {
        console.log('Using uploaded model data');
        modelData = uploadedModelData;
      } else if (selectedModelIndex !== null) {
        console.log('Exporting selected model as STL');
        
        // Calculate model volume for better price estimates
        const model = models[selectedModelIndex];
        if (model && model.mesh) {
          modelVolume = calculateModelVolume(model);
          console.log('Calculated model volume:', modelVolume, 'cubic cm');
        }
        
        // Export the model to STL and get the data
        setIsPreparing(true);
        const stlBlob = await exportSelectedModelAsSTL();
        setIsPreparing(false);
        
        if (!stlBlob) {
          console.error('Failed to export model - no blob returned');
          throw new Error('Failed to export model');
        }
        
        // Convert blob to base64 for API
        const reader = new FileReader();
        modelData = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(stlBlob);
        });
        console.log('Model exported and converted to base64');
      } else {
        console.error('No model selected or uploaded');
        throw new Error('No model selected or uploaded');
      }
      
      try {
        // Call the Slant 3D API to calculate price
        console.log('Calling API to calculate price');
        const priceData = await calculateModelPrice(modelData, quantity, selectedFilament);
        console.log('Received price data from API:', priceData);
        
        // Only update state if the API returned valid numbers
        if (
          typeof priceData.basePrice === 'number' && !isNaN(priceData.basePrice) &&
          typeof priceData.shippingCost === 'number' && !isNaN(priceData.shippingCost) &&
          typeof priceData.totalPrice === 'number' && !isNaN(priceData.totalPrice)
        ) {
          setBasePrice(priceData.basePrice);
          setShippingCost(priceData.shippingCost);
          setFinalPrice(priceData.totalPrice);
          console.log('Updated prices from API:', priceData);
        } else {
          // If the API response is invalid, calculate a more accurate estimate based on the model volume
          console.warn('Invalid price data from API, using calculated estimates');
          
          // Calculate a better price based on volume if we have it (volume in cubic cm)
          // Formula: Base price depends on volume, starts at $15 for small models
          let betterBasePrice = fallbackBasePrice;
          
          if (modelVolume > 0) {
            // Volume-based pricing: $0.10 per cubic cm with a minimum of $15
            const volumePrice = Math.max(15, modelVolume * 0.10);
            // Quantity discount: 10% off per additional item
            const quantityMultiplier = quantity === 1 ? 1 : (1 + (0.9 * (quantity - 1)));
            betterBasePrice = volumePrice * quantityMultiplier;
          }
          
          const betterServiceFee = (betterBasePrice + fallbackShipping) * 0.5;
          const betterTotal = betterBasePrice + fallbackShipping + betterServiceFee;
          
          console.log('Using calculated pricing based on volume:', {
            modelVolume,
            betterBasePrice,
            fallbackShipping,
            betterServiceFee,
            betterTotal
          });
          
          setBasePrice(betterBasePrice);
          setShippingCost(fallbackShipping);
          setFinalPrice(betterTotal);
        }
      } catch (apiError) {
        throw apiError;
      }
      
    } catch (err) {
      console.error('Price calculation error:', err);
      setError('Price calculation error. Using estimated pricing instead.');
      // We're already using fallback prices, so no need to set them again
    } finally {
      setIsPriceCalculating(false);
    }
  };

  // Used for calculating price when API call fails
  const calculateModelVolume = (model: any) => {
    if (!model || !model.mesh) return 10; // Default volume if model is invalid
    
    // Get the bounding box of the model
    const bbox = new THREE.Box3().setFromObject(model.mesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Calculate approximate volume in cubic centimeters
    return size.x * size.y * size.z * 1000;
  };

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setShippingInfo(prev => ({ ...prev, [name]: value }));
  };

  const isShippingFormValid = () => {
    const { name, email, phone, address, city, state, zip } = shippingInfo;
    return (
      name.trim() !== '' &&
      email.trim() !== '' &&
      phone.trim() !== '' &&
      address.trim() !== '' &&
      city.trim() !== '' &&
      state.trim() !== '' &&
      zip.trim() !== ''
    );
  };

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleUploadModel = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Create a file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.stl';
      
      // Handle file selection
      fileInput.onchange = async (e) => {
        if (fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          
          // Convert file to base64 for model preview and API use
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setUploadedModelData(event.target.result);
              toast({
                title: "Model uploaded",
                description: `${file.name} has been uploaded for printing.`,
              });
            }
          };
          reader.readAsDataURL(file);
        }
        setIsLoading(false);
      };
      
      // Trigger file selection dialog
      fileInput.click();
      
    } catch (err) {
      console.error('Model upload error:', err);
      setError('Error uploading model. Please try again.');
      setIsLoading(false);
    }
  };

  const handleCreatePaymentLink = async () => {
    if (!isShippingFormValid()) {
      toast({
        title: "Invalid shipping information",
        description: "Please fill out all shipping fields.",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      let modelData;
      
      // Get model data either from the uploaded model or from the selected model in the scene
      if (uploadedModelData) {
        modelData = uploadedModelData;
      } else if (selectedModelIndex !== null) {
        // Export the selected model as STL
        const stlBlob = await exportSelectedModelAsSTL();
        if (!stlBlob) {
          throw new Error('Failed to export model');
        }
        
        // Convert the blob to base64 for submission
        modelData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(stlBlob);
        });
      } else {
        throw new Error('No model selected or uploaded');
      }
      
      // Prepare the print job data
      const printJobData = {
        model: modelData,
        quantity,
        filamentId: selectedFilament,
        shippingInfo: {
          name: shippingInfo.name,
          email: shippingInfo.email,
          phone: shippingInfo.phone,
          address: shippingInfo.address,
          city: shippingInfo.city,
          state: shippingInfo.state,
          zip: shippingInfo.zip
        },
        options: {
          infill: 20, // Default 20% infill
          resolution: 0.2, // 0.2mm layer height
          supports: true,
          rafts: false
        }
      };
      
      // Submit the print job
      console.log('Submitting print job:', printJobData);
      const response = await submitPrintJob(printJobData);
      
      if (response.success) {
        // Store the job info in state
        setPrintJob({
          jobId: response.jobId,
          status: 'submitted',
          estimatedCompletion: response.estimatedCompletion,
          trackingUrl: response.trackingUrl,
          paymentUrl: response.paymentUrl
        });
        
        // Set the payment link if available
        if (response.paymentUrl) {
          setPaymentLink(response.paymentUrl);
        }
        
        // Move to the payment step
        handleNextStep();
        
        toast({
          title: "Print job submitted",
          description: `Job ID: ${response.jobId}`,
        });
      } else {
        throw new Error(response.error || 'Failed to submit print job');
      }
    } catch (err) {
      console.error('Print job submission error:', err);
      setError('Error submitting print job. Please try again.');
      
      // Fallback to simulation in development environment
      if (process.env.NODE_ENV === 'development') {
        handleSimulateSuccessfulPayment();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Continue with the same implementation for handleSimulateSuccessfulPayment
  // And the UI rendering functions
  // ...

  // For brevity, I'm not changing these parts as they're mostly UI-related
  const handleSimulateSuccessfulPayment = async () => {
    setIsLoading(true);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Create a fake job ID
      const simulatedJobId = 'sim-' + Math.random().toString(36).substring(2, 10);
      
      // Set a fake payment link
      setPaymentLink('https://example.com/payment/' + simulatedJobId);
      
      // Set a simulated print job
      setPrintJob({
        jobId: simulatedJobId,
        status: 'processing',
        estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        trackingUrl: 'https://example.com/track/' + simulatedJobId,
        paymentUrl: 'https://example.com/payment/' + simulatedJobId
      });
      
      // Go to confirmation step
      handleNextStep();
      
      toast({
        title: "Demo Mode",
        description: "This is a simulated order for demonstration purposes.",
        variant: "default"
      });
    } catch (error) {
      console.error('Simulation error:', error);
      setError('Error in demo mode. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // The rest of the component should remain unchanged, so I'll keep the same UI rendering functions
  const renderModelSelectionStep = () => (
    <div className="space-y-4">
      <div className="rounded-md border p-4 bg-card">
        <h3 className="text-md font-medium mb-2">Selected Model</h3>
        {selectedModelIndex !== null ? (
          <div className="space-y-2">
            <p><strong>Model:</strong> {models[selectedModelIndex]?.name || 'Unnamed Model'}</p>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUploadModel}
                disabled={isLoading || isPreparing}
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Preparing...
                  </>
                ) : isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    Prepare for Printing
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Please select a model from your workspace to continue
          </p>
        )}
      </div>
      
      <div className="rounded-md border p-4 bg-card">
        <h3 className="text-md font-medium mb-3">Print Options</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="filament-color">Filament Color</Label>
            <Select
              value={selectedFilament}
              onValueChange={setSelectedFilament}
              disabled={selectedModelIndex === null || isLoading}
            >
              <SelectTrigger id="filament-color" className="h-10">
                {selectedFilament && filamentColors.length > 0 ? (
                  <div className="flex items-center">
                    <div 
                      className="w-4 h-4 rounded-full mr-2 border border-gray-300" 
                      style={{ backgroundColor: filamentColors.find(c => c.id === selectedFilament)?.hex || '#808080' }}
                    ></div>
                    <SelectValue placeholder="Select color" />
                  </div>
                ) : (
                  <SelectValue placeholder="Select color" />
                )}
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {isLoadingFilaments ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Loading colors...</span>
                  </div>
                ) : Array.isArray(filamentColors) && filamentColors.length > 0 ? (
                  filamentColors.map(color => (
                    <SelectItem key={color.id} value={color.id}>
                      <div className="flex items-center">
                        <div 
                          className="w-5 h-5 rounded-full mr-2 border border-gray-300 flex-shrink-0" 
                          style={{ backgroundColor: color.hex || '#808080' }}
                        ></div>
                        <span className="truncate">{color.name}</span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem key="loading" value="loading">No colors available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon"
                disabled={quantity <= 1 || selectedModelIndex === null}
                onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
              >
                -
              </Button>
              <span className="w-8 text-center">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                disabled={quantity >= 10 || selectedModelIndex === null}
                onClick={() => setQuantity(prev => Math.min(10, prev + 1))}
              >
                +
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="rounded-md border p-4 bg-card">
        <h3 className="text-md font-medium mb-3">Price Estimate</h3>
        {isPriceCalculating || isPreparing ? (
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{isPreparing ? "Preparing model..." : "Calculating price..."}</span>
          </div>
        ) : selectedModelIndex === null && !uploadedModelData ? (
          <p className="text-sm text-muted-foreground">
            Select a model to see pricing
          </p>
        ) : basePrice > 0 || shippingCost > 0 || finalPrice > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm">Base Price:</span>
              <span className="text-sm">${typeof basePrice === 'number' ? basePrice.toFixed(2) : '0.00'}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-sm">Shipping:</span>
              <span className="text-sm">${typeof shippingCost === 'number' ? shippingCost.toFixed(2) : '0.00'}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-sm">Service Fee (50%):</span>
              <span className="text-sm">
                ${(((typeof basePrice === 'number' ? basePrice : 0) + 
                    (typeof shippingCost === 'number' ? shippingCost : 0)) * 0.5).toFixed(2)}
              </span>
            </div>
            
            <Separator className="my-2" />
            
            <div className="flex justify-between font-medium">
              <span>Total:</span>
              <span>${typeof finalPrice === 'number' ? finalPrice.toFixed(2) : '0.00'}</span>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Calculating price...
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={calculatePrice}
              disabled={isPriceCalculating || isPreparing}
            >
              Refresh Price
            </Button>
          </div>
        )}
      </div>
    </div>
  );
  
  const renderShippingInfoStep = () => (
    <div className="space-y-4">
      <div className="rounded-md border p-4 bg-card">
        <h3 className="text-md font-medium mb-3">Shipping Information</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                name="name"
                value={shippingInfo.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={shippingInfo.email}
                onChange={handleInputChange}
                placeholder="Enter your email"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={shippingInfo.phone}
              onChange={handleInputChange}
              placeholder="Enter your phone number"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              name="address"
              value={shippingInfo.address}
              onChange={handleInputChange}
              placeholder="Enter your street address"
            />
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                value={shippingInfo.city}
                onChange={handleInputChange}
                placeholder="City"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                value={shippingInfo.state}
                onChange={handleInputChange}
                placeholder="State"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                name="zip"
                value={shippingInfo.zip}
                onChange={handleInputChange}
                placeholder="ZIP"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={handlePreviousStep}
          disabled={isLoading}
        >
          Back
        </Button>
        
        <Button 
          onClick={handleCreatePaymentLink}
          disabled={!isShippingFormValid() || isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Continue to Payment
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
  
  const renderPaymentStep = () => (
    <div className="space-y-6">
      <div className="rounded-md bg-card border p-6">
        <h2 className="text-xl font-bold mb-4">Complete Your Order</h2>
        <p className="text-muted-foreground mb-6">
          Your 3D printing job is ready for payment. Once payment is completed, 
          printing will begin and your order will be shipped to your address.
        </p>
        
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Processing payment...</span>
          </div>
        ) : (
          <div className="flex flex-col space-y-6">
            {/* Print job information if available */}
            {printJob && (
              <div className="bg-muted p-4 rounded-md">
                <h3 className="font-medium mb-2">Job Details</h3>
                <p className="text-sm text-muted-foreground mb-2">Job ID: <span className="font-mono">{printJob.jobId}</span></p>
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground mr-2">Status:</span>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    {printJob.status || 'Pending payment'}
                  </span>
                </div>
              </div>
            )}
            
            {/* External payment link if available */}
            {paymentLink ? (
              <div className="text-center">
                <p className="mb-4">You'll be redirected to our secure payment processor to complete your order.</p>
                <a 
                  href={paymentLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
                >
                  Proceed to Payment
                </a>
                <p className="mt-4 text-sm text-muted-foreground">
                  Or click the button below to simulate a successful payment (for demo purposes only).
                </p>
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                <div className="border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2">Payment Methods</h3>
                  <div className="flex space-x-2 mb-4">
                    <div className="border rounded-md p-2 flex-1 text-center cursor-pointer bg-muted">Credit Card</div>
                    <div className="border rounded-md p-2 flex-1 text-center cursor-pointer">PayPal</div>
                    <div className="border rounded-md p-2 flex-1 text-center cursor-pointer">Apple Pay</div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cardNumber">Card Number</Label>
                      <Input id="cardNumber" placeholder="4242 4242 4242 4242" disabled />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="expiry">Expiry Date</Label>
                        <Input id="expiry" placeholder="MM/YY" disabled />
                      </div>
                      <div>
                        <Label htmlFor="cvc">CVC</Label>
                        <Input id="cvc" placeholder="123" disabled />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Order summary */}
                <div className="border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2">Order Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>3D Print ({quantity})</span>
                      <span>${basePrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span>${shippingCost.toFixed(2)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium">
                      <span>Total</span>
                      <span>${finalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={handlePreviousStep}>
                Back
              </Button>
              
              <Button onClick={handleSimulateSuccessfulPayment}>
                {paymentLink ? 'Simulate Payment' : 'Pay Now'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  
  const renderConfirmationStep = () => (
    <div className="confirmation-step">
      <div className="bg-primary/10 rounded-lg p-8 text-center mb-6">
        <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Thank You For Your Order!</h2>
        <p className="text-muted-foreground mb-4">
          Your 3D printing order has been submitted successfully.
        </p>
        
        {printJob && (
          <div className="bg-white/50 rounded-md p-4 my-4 text-left">
            <h3 className="font-medium text-lg mb-2">Print Job Details</h3>
            <div className="grid gap-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Job ID:</span>
                <span className="font-mono">{printJob.jobId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status:</span>
                <span className="capitalize bg-primary/20 text-primary rounded-full px-2 py-0.5 text-sm">
                  {printJob.status}
                </span>
              </div>
              {printJob.estimatedCompletion && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estimated Completion:</span>
                  <span>
                    {new Date(printJob.estimatedCompletion).toLocaleDateString()} 
                    {' '}
                    {new Date(printJob.estimatedCompletion).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {printJob.trackingUrl && (
                <div className="mt-2">
                  <a 
                    href={printJob.trackingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-primary text-white rounded-md py-2 px-4 w-full inline-block text-center"
                  >
                    Track Your Order
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="mt-6 space-y-4">
          <p className="text-sm">
            We've sent a confirmation email with all the details to <strong>{shippingInfo.email}</strong>
          </p>
          
          <div className="flex justify-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
            >
              Start Over
            </Button>
            
            <Button onClick={() => window.print()}>
              Print Receipt
            </Button>
          </div>
        </div>
      </div>
      
      <div className="order-summary">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span>Items:</span>
              <span>{quantity} x 3D Print</span>
            </div>
            
            <div className="flex justify-between">
              <span>Material:</span>
              <span className="capitalize">
                {filamentColors.find(f => f.id === selectedFilament)?.name || selectedFilament}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>Base Price:</span>
              <span>${basePrice.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between">
              <span>Shipping:</span>
              <span>${shippingCost.toFixed(2)}</span>
            </div>
            
            <Separator className="my-2" />
            
            <div className="flex justify-between font-bold">
              <span>Total:</span>
              <span>${finalPrice.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="shipping-info mt-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Shipping Details</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{shippingInfo.name}</p>
            <p>{shippingInfo.address}</p>
            <p>{shippingInfo.city}, {shippingInfo.state} {shippingInfo.zip}</p>
            <p>{shippingInfo.phone}</p>
            <p>{shippingInfo.email}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
  
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderModelSelectionStep();
      case 1:
        return renderShippingInfoStep();
      case 2:
        return renderPaymentStep();
      case 3:
        return renderConfirmationStep();
      default:
        return null;
    }
  };
  
  const renderProgressSteps = () => (
    <div className="flex justify-between mb-6 px-2">
      <div className={`flex flex-col items-center ${currentStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 1 ? 'border-primary bg-primary/10' : 'border-muted'}`}>
          <Package className="h-4 w-4" />
        </div>
        <span className="text-xs mt-1">Model</span>
      </div>
      
      <div className={`flex flex-col items-center ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 2 ? 'border-primary bg-primary/10' : 'border-muted'}`}>
          <Truck className="h-4 w-4" />
        </div>
        <span className="text-xs mt-1">Shipping</span>
      </div>
      
      <div className={`flex flex-col items-center ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 3 ? 'border-primary bg-primary/10' : 'border-muted'}`}>
          <CreditCard className="h-4 w-4" />
        </div>
        <span className="text-xs mt-1">Payment</span>
      </div>
      
      <div className={`flex flex-col items-center ${currentStep >= 4 ? 'text-primary' : 'text-muted-foreground'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 4 ? 'border-primary bg-primary/10' : 'border-muted'}`}>
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <span className="text-xs mt-1">Confirmation</span>
      </div>
    </div>
  );

  // Force immediate price calculation when component mounts
  useEffect(() => {
    if ((selectedModelIndex !== null || uploadedModelData) && selectedFilament) {
      console.log('Forcing initial price calculation');
      // Set default values immediately
      setBasePrice(15 + (quantity * 5));
      setShippingCost(4.99);
      const serviceFee = ((15 + (quantity * 5)) + 4.99) * 0.5;
      setFinalPrice((15 + (quantity * 5)) + 4.99 + serviceFee);
      
      // Then try API calculation
      calculatePrice();
    }
  }, [selectedModelIndex, uploadedModelData, selectedFilament, quantity]);

  return (
    <div className="print-3d-tab h-full overflow-y-auto p-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mr-2 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      
      {renderProgressSteps()}
      {renderStepContent()}
    </div>
  );
};

export default Print3DTab; 