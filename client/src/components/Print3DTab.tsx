import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
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
  AlertCircle,
  X
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  calculatePrice, 
  getFilaments, 
  estimateOrder, 
  estimateShipping, 
  createOrder, 
  getTracking,
  calculatePriceWithMandarin3D,
  calculate3DPrintPrice 
} from "@/lib/slantApi";
import { OrderSummary } from './OrderSummary';

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
  const { models, selectedModelIndex, exportSelectedModelAsSTL, selectModel } = useScene();
  const { toast } = useToast();
  
  // State variables
  const [selectedFilament, setSelectedFilament] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [basePrice, setBasePrice] = useState(15);
  const [shippingCost, setShippingCost] = useState(4.99);
  const [materialCost, setMaterialCost] = useState(0);
  const [printingCost, setPrintingCost] = useState(0);
  const [finalPrice, setFinalPrice] = useState(29.98);
  const [priceSource, setPriceSource] = useState<'api' | 'estimate'>('estimate');
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
  
  // New states
  const [complexityFactor, setComplexityFactor] = useState(1.0);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [printability, setPrintability] = useState<{
    factor: number;
    category: string;
    hasOverhangs: boolean;
    hasThinWalls: boolean;
    hasFloatingIslands: boolean;
  }>({
    factor: 1.0,
    category: "Easy",
    hasOverhangs: false,
    hasThinWalls: false,
    hasFloatingIslands: false
  });
  
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
  
  // Function to calculate the price using our advanced algorithm
  const calculatePriceFromAPI = async () => {
    if ((selectedModelIndex === null && !uploadedModelData) || !selectedFilament) {
      toast({
        title: "Missing required information",
        description: "Please select a model and material before calculating price.",
        variant: "destructive",
      });
      return;
    }
    
    console.log('Starting price calculation');
    setIsPriceCalculating(true);
    setError(null);
    setPriceSource('estimate'); // Default to estimate until calculation succeeds
    
    // Set reasonable fallback prices that scale with quantity
    const calculateFallbackPrices = () => {
      // Base price formula: More gradual scaling based on quantity
      let basePriceFallback;
      
      if (quantity === 1) {
        basePriceFallback = 5; // Single item
      } else if (quantity <= 5) {
        basePriceFallback = 5 + (quantity - 1) * 3; // $5 + $3 per additional up to 5
      } else if (quantity <= 10) {
        basePriceFallback = 17 + (quantity - 5) * 2.5; // $17 + $2.50 per additional from 6-10
      } else {
        basePriceFallback = 30 + (quantity - 10) * 2; // $30 + $2 per additional after 10
      }
      
      // For backend compatibility, still calculate material and printing costs
      const materialCostFallback = basePriceFallback * 0.4;
      const printingCostFallback = basePriceFallback * 0.6;
      
      // Shipping cost varies based on order size
      const shippingCostFallback = basePriceFallback > 50 ? 10.00 : 5.00;
      
      // Calculate total price 
      const totalPriceFallback = basePriceFallback + shippingCostFallback;
      
      console.log('Using fallback prices:', {
        quantity,
        basePriceFallback,
        shippingCostFallback,
        totalPriceFallback
      });
      
      return {
        basePrice: basePriceFallback,
        materialCost: materialCostFallback,
        printingCost: printingCostFallback,
        shippingCost: shippingCostFallback,
        totalPrice: totalPriceFallback
      };
    };
    
    // Get fallback prices as a starting point
    const fallbackPrices = calculateFallbackPrices();
    
    // Set fallback values right away so UI always shows something
    setBasePrice(fallbackPrices.basePrice);
    setMaterialCost(fallbackPrices.materialCost);
    setPrintingCost(fallbackPrices.printingCost);
    setShippingCost(fallbackPrices.shippingCost);
    setFinalPrice(fallbackPrices.totalPrice);
    
    toast({
      title: "Calculating price...",
      description: "Analyzing model geometry and materials",
    });
    
    try {
      // Calculate price based on model volume
      if (selectedModelIndex !== null && selectedModelIndex >= 0 && selectedModelIndex < models.length) {
        // We have a selected model from the scene
        const model = models[selectedModelIndex];
        if (model && model.mesh) {
          console.log('Calculating price for model:', model.name);
          
          // Calculate model volume
          const modelVolume = calculateModelVolume(model);
          console.log('Calculated model volume:', modelVolume, 'cubic mm');
          
          // Calculate model complexity (polygon count, geometry details)
          const complexityFactor = calculateModelComplexity(model);
          console.log('Model complexity factor:', complexityFactor);
          
          // Assess model printability (overhangs, thin walls, etc.)
          const printabilityAssessment = assessPrintability(model);
          setPrintability(printabilityAssessment);
          console.log('Model printability:', printabilityAssessment);
          
          // Revised pricing model without artificial caps
          // Base prices depend on volume
          const volumeCubicCm = modelVolume / 1000; // Convert to cubic cm
          
          let basePrice;
          if (volumeCubicCm < 5) {
            basePrice = 2; // Minimum price
          } else if (volumeCubicCm < 50) {
            basePrice = 2 + ((volumeCubicCm - 5) / 45) * 3; // $2-$5
          } else if (volumeCubicCm < 200) {
            basePrice = 5 + ((volumeCubicCm - 50) / 150) * 5; // $5-$10
          } else if (volumeCubicCm < 1000) {
            basePrice = 10 + ((volumeCubicCm - 200) / 800) * 20; // $10-$30
          } else if (volumeCubicCm < 5000) {
            basePrice = 30 + ((volumeCubicCm - 1000) / 4000) * 70; // $30-$100
          } else {
            // For extremely large models, continue scaling (approximately $15 per 1000 cubic cm)
            basePrice = 100 + ((volumeCubicCm - 5000) / 1000) * 15;
          }
          
          // No price cap - allow prices to reflect actual material and time costs
          
          // Calculate size in inches (assuming cubic root of volume, converted from cm to inches)
          const sizeInInches = Math.pow(volumeCubicCm, 1/3) / 2.54; 
          console.log(`Approximate model size: ${sizeInInches.toFixed(1)} inches`);
          
          // Apply complexity factor to base price
          // Complex models take longer to print and have higher failure rates
          const complexityAdjustedBasePrice = basePrice * complexityFactor;
          console.log('Complexity-adjusted base price:', complexityAdjustedBasePrice.toFixed(2));
          
          // Apply printability factor to the price
          // Hard-to-print models require more supports, have higher failure rates, etc.
          const printabilityAdjustedBasePrice = complexityAdjustedBasePrice * printabilityAssessment.factor;
          console.log('Printability-adjusted base price:', printabilityAdjustedBasePrice.toFixed(2));
          
          // Apply material pricing factor based on selected filament
          // Premium materials cost more
          let materialFactor = 1.0; // Default for standard materials
          if (selectedFilament.includes('Premium') || 
              selectedFilament.includes('Metal') || 
              selectedFilament.includes('Carbon')) {
            materialFactor = 1.3; // 30% more for premium materials
          }
          
          // Calculate final per-item price with material factor
          const finalBasePrice = printabilityAdjustedBasePrice * materialFactor;
          
          // Calculate total base price for all items
          const totalBasePrice = finalBasePrice * quantity;
          
          // For backend compatibility, still calculate these costs
          // (40% material, 60% printing)
          const materialCost = totalBasePrice * 0.4;
          const printingCost = totalBasePrice * 0.6;
          
          // Fixed shipping cost - always $5 for small orders, $10 for larger orders
          const shippingCost = totalBasePrice > 50 ? 10.00 : 5.00;
          
          // Calculate final price (total + shipping)
          const totalPrice = totalBasePrice + shippingCost;
          
          console.log('Volume-based price calculation:', {
            modelVolume,
            volumeCubicCm,
            basePrice,
            complexityFactor,
            complexityAdjustedBasePrice,
            printabilityFactor: printabilityAssessment.factor,
            printabilityCategory: printabilityAssessment.category,
            printabilityIssues: {
              hasOverhangs: printabilityAssessment.hasOverhangs,
              hasThinWalls: printabilityAssessment.hasThinWalls,
              hasFloatingIslands: printabilityAssessment.hasFloatingIslands
            },
            printabilityAdjustedBasePrice,
            finalBasePrice,
            totalBasePrice,
            materialCost,
            printingCost,
            shippingCost,
            totalPrice
          });
          
          // Update state with the calculated prices
          setBasePrice(totalBasePrice);
          setMaterialCost(materialCost);
          setPrintingCost(printingCost);
          setShippingCost(shippingCost);
          setFinalPrice(totalPrice);
          setComplexityFactor(complexityFactor); // Store the complexity factor
          setPriceSource('api'); // Mark prices as coming from accurate calculation
          
          toast({
            title: "Price calculated successfully",
            description: `Base price: ${formatPrice(finalBasePrice)} per item (including complexity and printability adjustments)`,
            variant: "default",
          });
        } else {
          console.error('Selected model or mesh is missing:', model);
          throw new Error('Unable to analyze model - mesh not available');
        }
      } else if (uploadedModelData) {
        // For uploaded models, we don't have access to volume directly
        // Display estimate with a note that it's an approximation
        
        toast({
          title: "Using estimated pricing for uploaded model",
          description: "For more accurate pricing, use the model viewer to load your model.",
          variant: "default",
        });
        
        // Keep using the fallback prices already set
      } else {
        console.error('No valid model selected. Selected index:', selectedModelIndex, 'Models:', models.length);
        throw new Error('No valid model selected for pricing');
      }
    } catch (error: any) {
      // Handle any errors with the calculation
      console.error('Error calculating price:', error);
      
      toast({
        title: "Using estimated pricing",
        description: error.message || "Unable to perform detailed analysis. Using estimated prices based on model complexity.",
        variant: "destructive",
      });
      
      // Fallback prices already set above
      setPriceSource('estimate');
    } finally {
      setIsPriceCalculating(false);
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
      calculatePriceFromAPI();
    }
  }, [selectedModelIndex, selectedFilament, quantity, uploadedModelData, isPreparing]);

  // Force price recalculation immediately when a model is selected
  useEffect(() => {
    console.log('Model selection changed, selectedModelIndex:', selectedModelIndex);
    
    if (selectedModelIndex !== null && selectedFilament && quantity > 0) {
      console.log('Force recalculating price after model selection');
      // Small timeout to ensure model is fully loaded
      const timer = setTimeout(() => {
        calculatePriceFromAPI();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [selectedModelIndex]);

  // Used for calculating price when API call fails
  const calculateModelVolume = (model: any) => {
    if (!model || !model.mesh) return 10; // Default small volume if model is invalid
    
    try {
      // Get the bounding box of the model
      const bbox = new THREE.Box3().setFromObject(model.mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      console.log('Model dimensions:', {
        width: size.x.toFixed(2) + ' mm',
        height: size.y.toFixed(2) + ' mm',
        depth: size.z.toFixed(2) + ' mm'
      });
      
      // Calculate volume in cubic millimeters (width × height × depth)
      const volumeInCubicMm = size.x * size.y * size.z;
      
      console.log('Calculated volume:', volumeInCubicMm.toFixed(2) + ' cubic mm');
      
      return volumeInCubicMm;
    } catch (error) {
      console.error('Error calculating model volume:', error);
      return 10; // Default small volume on error
    }
  };

  // Calculate the complexity of a 3D model
  const calculateModelComplexity = (model: any) => {
    if (!model || !model.mesh) return 1.0; // Default complexity factor
    
    try {
      // Get the mesh from the model
      const mesh = model.mesh;
      
      // Get geometry data if available
      const geometry = mesh.geometry;
      if (!geometry) return 1.0;
      
      // Calculate complexity based on polygon count
      let complexityFactor = 1.0;
      
      // Check if we can access the geometry's polygon count
      let polygonCount = 0;
      
      // Try different ways to get triangle/polygon count
      if (geometry.attributes && geometry.attributes.position) {
        // For BufferGeometry
        polygonCount = geometry.attributes.position.count / 3;
      } else if (geometry.faces) {
        // For older three.js geometry
        polygonCount = geometry.faces.length;
      }
      
      console.log('Model polygon count:', polygonCount);
      
      // Calculate surface area if possible (approximation)
      let surfaceArea = 0;
      if (mesh.geometry.boundingSphere) {
        const radius = mesh.geometry.boundingSphere.radius;
        surfaceArea = 4 * Math.PI * radius * radius;
      }
      
      // Get the volume we already calculated
      const volume = calculateModelVolume(model) / 1000; // in cubic cm
      
      // Calculate surface area to volume ratio (a key complexity indicator)
      let saToVolumeRatio = volume > 0 && surfaceArea > 0 ? surfaceArea / volume : 1;
      console.log('Surface area to volume ratio:', saToVolumeRatio.toFixed(2));
      
      // Determine complexity factor based on polygon count
      if (polygonCount > 100000) {
        complexityFactor = 1.5; // Very complex models
      } else if (polygonCount > 50000) {
        complexityFactor = 1.3; // Complex models
      } else if (polygonCount > 20000) {
        complexityFactor = 1.2; // Moderately complex models
      } else if (polygonCount > 10000) {
        complexityFactor = 1.1; // Slightly complex models
      }
      
      // Adjust for surface area to volume ratio if available
      if (saToVolumeRatio > 10) {
        complexityFactor += 0.2; // Very intricate surface details
      } else if (saToVolumeRatio > 5) {
        complexityFactor += 0.1; // Moderate surface details
      }
      
      // Cap the complexity factor at 2.0 (100% price increase)
      complexityFactor = Math.min(complexityFactor, 2.0);
      
      console.log('Calculated complexity factor:', complexityFactor.toFixed(2));
      
      return complexityFactor;
    } catch (error) {
      console.error('Error calculating model complexity:', error);
      return 1.0; // Default complexity factor on error
    }
  };

  // Calculate the printability of a 3D model (how easy it is to print successfully)
  const assessPrintability = (model: any) => {
    if (!model || !model.mesh) return {
      factor: 1.0,
      category: "Easy",
      hasOverhangs: false,
      hasThinWalls: false,
      hasFloatingIslands: false
    }; // Default printability object
    
    try {
      // Get the mesh from the model
      const mesh = model.mesh;
      
      // Get geometry data if available
      const geometry = mesh.geometry;
      if (!geometry) return {
        factor: 1.0,
        category: "Easy",
        hasOverhangs: false,
        hasThinWalls: false,
        hasFloatingIslands: false
      };
      
      // Default printability factor (1.0 = perfectly printable, higher = harder to print)
      let printabilityFactor = 1.0;
      
      // Check if we can access vertices and faces
      let hasOverhangs = false;
      let hasThinWalls = false;
      let hasFloatingIslands = false;
      
      // 1. Check for significant overhangs by analyzing face normals
      if (geometry.attributes && geometry.attributes.normal) {
        const normalAttr = geometry.attributes.normal;
        let overhangCount = 0;
        let totalFaces = normalAttr.count / 3;
        
        // Check a sample of normals to identify faces pointing downward
        // (which indicate overhangs that need support)
        for (let i = 0; i < normalAttr.count; i += 3) {
          const ny = normalAttr.getY(i);
          if (ny < -0.5) { // Face pointing significantly downward
            overhangCount++;
          }
        }
        
        // If more than 15% of faces are overhangs, flag it
        if (totalFaces > 0 && (overhangCount / totalFaces) > 0.15) {
          hasOverhangs = true;
          printabilityFactor += 0.2; // Add 20% to price for significant overhangs
          console.log('Model has significant overhangs:', (overhangCount / totalFaces * 100).toFixed(1) + '%');
        }
      }
      
      // 2. Check for thin walls by analyzing bounding box and volume
      const volume = calculateModelVolume(model) / 1000; // in cubic cm
      
      // Get bounding box dimensions
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      // Calculate approximate surface area
      let surfaceArea = 0;
      if (mesh.geometry.boundingSphere) {
        const radius = mesh.geometry.boundingSphere.radius;
        surfaceArea = 4 * Math.PI * radius * radius / 100; // approximate in square cm
      }
      
      // Calculate an approximate "average thickness"
      // For a solid cube, volume/surface area would be large
      // For a thin-walled object, this ratio would be small
      const approxThickness = volume > 0 && surfaceArea > 0 ? volume / surfaceArea : 1;
      
      if (approxThickness < 0.1) { // Less than 1mm average thickness
        hasThinWalls = true;
        printabilityFactor += 0.3; // Add 30% to price for thin walls (high failure risk)
        console.log('Model likely has thin walls, approximate thickness:', approxThickness.toFixed(2) + 'cm');
      }
      
      // 3. Identify potential "floating islands" (disconnected parts) 
      // This is complex to detect precisely, but we can estimate based on mesh topology
      // Approximation: If model has high complexity but low thickness, it might have islands
      if (geometry.attributes && geometry.attributes.position && 
          (geometry.attributes.position.count / 3) > 20000 && approxThickness < 0.2) {
        hasFloatingIslands = true;
        printabilityFactor += 0.2; // Add 20% for potential floating islands
        console.log('Model might have floating islands or disconnected parts');
      }
      
      // 4. Overall size-to-detail ratio (harder to print tiny detailed parts)
      const maxDimension = Math.max(size.x, size.y, size.z);
      const scaledVolume = volume * 1000; // back to cubic mm
      if (maxDimension < 20 && geometry.attributes && geometry.attributes.position && 
          (geometry.attributes.position.count / 3) > 10000) {
        // Small but detailed model
        printabilityFactor += 0.15;
        console.log('Model has small features that are difficult to print precisely');
      }
      
      // Cap the printability factor
      printabilityFactor = Math.min(printabilityFactor, 2.0);
      
      // Create a descriptive printability category
      let printabilityCategory = "Easy";
      if (printabilityFactor >= 1.5) {
        printabilityCategory = "Very Difficult";
      } else if (printabilityFactor >= 1.3) {
        printabilityCategory = "Difficult";
      } else if (printabilityFactor >= 1.1) {
        printabilityCategory = "Moderate";
      }
      
      console.log('Printability assessment:', {
        factor: printabilityFactor.toFixed(2),
        category: printabilityCategory,
        hasOverhangs,
        hasThinWalls,
        hasFloatingIslands
      });
      
      return {
        factor: printabilityFactor,
        category: printabilityCategory,
        hasOverhangs,
        hasThinWalls,
        hasFloatingIslands
      };
    } catch (error) {
      console.error('Error assessing printability:', error);
      return {
        factor: 1.0,
        category: "Unknown",
        hasOverhangs: false,
        hasThinWalls: false,
        hasFloatingIslands: false
      };
    }
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
      // Simulate Stripe payment processing
      toast({
        title: "Processing payment with Stripe",
        description: "This is a simulation - no actual payment will be charged.",
      });
      
      // Simulate a payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create a simulated order ID for tracking
      const simulatedOrderId = `ORD-${Date.now()}`;
      
      // Set the print job with the simulated data
      setPrintJob({
        jobId: simulatedOrderId,
        status: 'processing',
        estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        trackingUrl: undefined,
        paymentUrl: undefined
      });
      
      toast({
        title: "Payment successful!",
        description: `Your order #${simulatedOrderId} has been placed.`,
        variant: "default",
      });
      
      // Move to the confirmation step
      handleNextStep();
    } catch (err) {
      console.error('Payment processing error:', err);
      
      toast({
        title: "Payment simulation",
        description: "This is just a demo - proceeding to order confirmation.",
      });
      
      // Use the simulated payment as fallback
      handleSimulateSuccessfulPayment();
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
    <div className="space-y-6">
      {/* Simplified model selection */}
      <div className="bg-card rounded-md border p-4">
        <h2 className="text-lg font-semibold mb-3">Select a Model</h2>
        
        <div className="space-y-4">
          {/* Model Dropdown */}
          <div>
            <Label htmlFor="model-select">Choose Model</Label>
            <Select
              value={selectedModelIndex !== null ? selectedModelIndex.toString() : ""}
              onValueChange={(value) => {
                if (value === "upload") {
                  handleUploadModel();
                } else {
                  selectModel(parseInt(value));
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>From 3D Viewer</SelectLabel>
                  {models.length > 0 ? (
                    models.map((model, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        {model.name || `Model ${index + 1}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>
                      No models available
                    </SelectItem>
                  )}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Other Options</SelectLabel>
                  <SelectItem value="upload">
                    Upload New Model...
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          
          {/* Selected model info */}
          {(selectedModelIndex !== null || uploadedModelData) && (
            <div className="bg-muted p-3 rounded-md">
              <p className="font-medium">Selected Model:</p>
              <p>
                {selectedModelIndex !== null 
                  ? models[selectedModelIndex]?.name || `Model ${selectedModelIndex + 1}` 
                  : uploadedModelData 
                    ? 'Uploaded Model' 
                    : 'No model selected'}
              </p>
              {uploadedModelData && selectedModelIndex === null && (
                <p className="text-xs text-primary mt-1">Custom model uploaded successfully</p>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Material selection */}
      <div className="bg-card rounded-md border p-4">
        <h2 className="text-lg font-semibold mb-3">Material and Quantity</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="filament">Filament Color</Label>
            <Select
              value={selectedFilament}
              onValueChange={setSelectedFilament}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a color" />
              </SelectTrigger>
              <SelectContent>
                {filamentColors.map((color) => (
                  <SelectItem key={color.id} value={color.id}>
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-2" 
                        style={{ backgroundColor: `#${color.hex}` }}
                      />
                      <span>{color.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <div className="flex items-center space-x-3">
              <Input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && val <= 100) {
                    setQuantity(val);
                  }
                }}
                className="w-24"
              />
              <div className="flex items-center space-x-1">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  -
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.min(100, quantity + 1))}
                >
                  +
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Order Summary */}
      <OrderSummary 
        basePrice={basePrice}
        materialCost={materialCost}
        printingCost={printingCost}
        shippingCost={shippingCost}
        finalPrice={finalPrice}
        complexityFactor={complexityFactor}
        printability={printability}
        priceSource={priceSource}
        isPriceCalculating={isPriceCalculating}
        isPreparing={isPreparing}
        selectedModelName={selectedModelIndex !== null 
          ? models[selectedModelIndex]?.name || 'Unnamed Model'
          : uploadedModelData 
            ? 'Uploaded Model' 
            : null}
        selectedFilament={filamentColors.find(f => f.id === selectedFilament)?.name || selectedFilament || 'None'}
        quantity={quantity}
        onCalculatePrice={calculatePriceFromAPI}
        formatPrice={formatPrice}
      />
      
      {/* Next step button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleNextStep} 
          disabled={!selectedFilament || (selectedModelIndex === null && !uploadedModelData)}
        >
          Continue to Shipping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
  
  const renderShippingInfoStep = () => (
    <div className="space-y-6">
      {/* Shipping form */}
      <div className="bg-card rounded-md border p-4">
        <h2 className="text-lg font-semibold mb-3">Shipping Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              value={shippingInfo.name}
              onChange={handleInputChange}
              placeholder="John Doe"
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={shippingInfo.email}
              onChange={handleInputChange}
              placeholder="john@example.com"
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              value={shippingInfo.phone}
              onChange={handleInputChange}
              placeholder="(123) 456-7890"
            />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              value={shippingInfo.address}
              onChange={handleInputChange}
              placeholder="123 Main St"
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              value={shippingInfo.city}
              onChange={handleInputChange}
              placeholder="New York"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                value={shippingInfo.state}
                onChange={handleInputChange}
                placeholder="NY"
              />
            </div>
            <div>
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                name="zip"
                value={shippingInfo.zip}
                onChange={handleInputChange}
                placeholder="90210"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Order Summary */}
      <OrderSummary 
        basePrice={basePrice}
        materialCost={materialCost}
        printingCost={printingCost}
        shippingCost={shippingCost}
        finalPrice={finalPrice}
        complexityFactor={complexityFactor}
        printability={printability}
        priceSource={priceSource}
        isPriceCalculating={isPriceCalculating}
        isPreparing={isPreparing}
        selectedModelName={selectedModelIndex !== null 
          ? models[selectedModelIndex]?.name || 'Unnamed Model'
          : uploadedModelData 
            ? 'Uploaded Model' 
            : null}
        selectedFilament={filamentColors.find(f => f.id === selectedFilament)?.name || selectedFilament || 'None'}
        quantity={quantity}
        onCalculatePrice={calculatePriceFromAPI}
        formatPrice={formatPrice}
      />
      
      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handlePreviousStep}>
          Back
        </Button>
        
        <Button 
          onClick={handleNextStep} 
          disabled={!isShippingFormValid()}
        >
          Continue to Payment
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
  
  const renderPaymentStep = () => (
    <div className="space-y-6">
      {/* Payment info */}
      <div className="bg-card rounded-md border p-4">
        <h2 className="text-lg font-semibold mb-3">Payment with Stripe</h2>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your payment will be securely processed by Stripe.
          </p>
          
          {/* Simulating the Stripe payment UI */}
          <Card className="border border-input">
            <CardContent className="p-4 space-y-4">
              <div>
                <Label htmlFor="card-number">Card Number</Label>
                <Input
                  id="card-number"
                  placeholder="4242 4242 4242 4242"
                  disabled={isLoading}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <Label htmlFor="expiry-date">Expiry</Label>
                  <Input
                    id="expiry-date"
                    placeholder="MM/YY"
                    disabled={isLoading}
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="cvc">CVC</Label>
                  <Input
                    id="cvc"
                    placeholder="123"
                    disabled={isLoading}
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="zip-code">ZIP</Label>
                  <Input
                    id="zip-code"
                    placeholder={shippingInfo.zip || "90210"}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Simulated payment success state */}
          {paymentLink && (
            <div className="bg-green-50 p-4 rounded-md">
              <div className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                <div>
                  <h3 className="font-medium text-green-900">Payment Initiated</h3>
                  <p className="text-sm text-green-700">
                    Continue to the payment portal to complete your purchase.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => window.open(paymentLink, '_blank')}
                  >
                    Continue to Payment Portal
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Order Summary */}
      <OrderSummary 
        basePrice={basePrice}
        materialCost={materialCost}
        printingCost={printingCost}
        shippingCost={shippingCost}
        finalPrice={finalPrice}
        complexityFactor={complexityFactor}
        printability={printability}
        priceSource={priceSource}
        isPriceCalculating={isPriceCalculating}
        isPreparing={isPreparing}
        selectedModelName={selectedModelIndex !== null 
          ? models[selectedModelIndex]?.name || 'Unnamed Model'
          : uploadedModelData 
            ? 'Uploaded Model' 
            : null}
        selectedFilament={filamentColors.find(f => f.id === selectedFilament)?.name || selectedFilament || 'None'}
        quantity={quantity}
        onCalculatePrice={calculatePriceFromAPI}
        formatPrice={formatPrice}
      />
      
      {/* Navigation and payment buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handlePreviousStep}>
          Back
        </Button>
        
        {paymentLink ? (
          <Button 
            onClick={handleSimulateSuccessfulPayment}
          >
            Simulate Successful Payment
          </Button>
        ) : (
          <Button 
            onClick={handleCreatePaymentLink}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Pay {formatPrice(finalPrice)}
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
  
  const renderConfirmationStep = () => (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-md p-6 text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-green-800">Order Successfully Placed!</h2>
        <p className="text-green-700 max-w-md mx-auto">
          Your 3D printing order has been confirmed. We'll send you updates about your order progress.
        </p>
        
        {printJob && (
          <div className="bg-white rounded-md p-4 max-w-md mx-auto text-left">
            <h3 className="font-semibold mb-2 text-green-900">Order Details</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="text-gray-500">Order ID:</div>
              <div className="font-medium">{printJob.jobId}</div>
              
              <div className="text-gray-500">Status:</div>
              <div className="font-medium capitalize">{printJob.status}</div>
              
              <div className="text-gray-500">Estimated Completion:</div>
              <div className="font-medium">
                {printJob.estimatedCompletion ? new Date(printJob.estimatedCompletion).toLocaleDateString() : 'In processing'}
              </div>
            </div>
            
            {printJob.trackingUrl && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => window.open(printJob.trackingUrl, '_blank')}
              >
                <Truck className="h-4 w-4 mr-2" />
                Track Your Order
              </Button>
            )}
          </div>
        )}
      </div>
      
      {/* Order Summary */}
      <OrderSummary 
        basePrice={basePrice}
        materialCost={materialCost}
        printingCost={printingCost}
        shippingCost={shippingCost}
        finalPrice={finalPrice}
        complexityFactor={complexityFactor}
        printability={printability}
        priceSource={priceSource}
        isPriceCalculating={isPriceCalculating}
        isPreparing={isPreparing}
        selectedModelName={selectedModelIndex !== null 
          ? models[selectedModelIndex]?.name || 'Unnamed Model'
          : uploadedModelData 
            ? 'Uploaded Model' 
            : null}
        selectedFilament={filamentColors.find(f => f.id === selectedFilament)?.name || selectedFilament || 'None'}
        quantity={quantity}
        onCalculatePrice={calculatePriceFromAPI}
        formatPrice={formatPrice}
      />
      
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Start New Order
        </Button>
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
        return renderModelSelectionStep();
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
      calculatePriceFromAPI();
    }
  }, [selectedModelIndex, uploadedModelData, selectedFilament, quantity]);

  // Function to format prices as currency
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

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