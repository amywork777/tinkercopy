import React, { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// Thingiverse API credentials
const APP_TOKEN = '5995b1189ec87c43006d5d0032674f86';
const BASE_URL = 'https://api.thingiverse.com';
// Store additional auth info for potential OAuth flows if needed
const CLIENT_ID = '1a0b2e84953b32da78b5';
const CLIENT_SECRET = '6b8a574c5cf49ba506607ee92ad11b81';

// Handle CORS issues if needed (in some environments the API calls need to be proxied)
const CORS_PROXY = 'https://corsproxy.io/?';

// Interface for Thingiverse API models
interface ThingiverseModel {
  id: number;
  name: string;
  thumbnail: string;
  public_url: string;
  creator: {
    name: string;
    public_url: string;
  };
  preview_image: string;
  is_featured: boolean;
  like_count: number;
  download_count: number;
}

// Interface for Thingiverse file
interface ThingiverseFile {
  id: number;
  name: string;
  size: number;
  download_url: string;
  public_url: string;
  thumbnail: string;
}

export function ThingiverseEmbed() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [models, setModels] = useState<ThingiverseModel[]>([]);
  const [searchTerm, setSearchTerm] = useState('raspberry pi');
  const [downloadingModelId, setDownloadingModelId] = useState<number | null>(null);
  
  // Initialize the toast hook
  const { toast } = useToast();

  // Ensure we only have one results container rendered
  const [contentKey, setContentKey] = useState<number>(0);

  // Reset the content when starting a new search
  useEffect(() => {
    if (isLoading) {
      // Increment the key to force a fresh render when loading changes
      setContentKey(prev => prev + 1);
    }
  }, [isLoading]);

  // Fetch models from Thingiverse API
  const fetchModels = async (query: string = 'raspberry pi') => {
    setIsLoading(true);
    setHasError(false);
    
    try {
      // First try the search endpoint with increased per_page parameter
      let url = `${BASE_URL}/search/${encodeURIComponent(query)}?per_page=50`;
      
      // Set up authentication headers
      const headers = {
        'Authorization': `Bearer ${APP_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      let response: Response;
      let usedCorsProxy = false;
      let usedAlternativeEndpoint = false;
      
      // Try sequence: direct search → proxy search → popular endpoint → proxy popular
      const apiCall = async (endpoint: string, useProxy = false): Promise<Response> => {
        const finalUrl = useProxy 
          ? `${CORS_PROXY}${encodeURIComponent(endpoint)}`
          : endpoint;
        
        return fetch(finalUrl, { headers });
      };
      
      try {
        // First attempt - direct call to search
        response = await apiCall(url);
        
        // If search fails, try popular endpoint
        if (!response.ok) {
          console.warn(`Search API failed with status ${response.status}, trying popular endpoint`);
          url = `${BASE_URL}/popular?per_page=50`; // Also request 50 items here
          usedAlternativeEndpoint = true;
          response = await apiCall(url);
          
          // If that also fails, try with CORS proxy
          if (!response.ok) {
            console.warn(`Popular API failed with status ${response.status}, trying with CORS proxy`);
            response = await apiCall(url, true);
            usedCorsProxy = true;
          }
        }
      } catch (corsError) {
        // If direct calls fail completely, try with CORS proxy
        console.warn('All direct API calls failed, trying with CORS proxy', corsError);
        url = usedAlternativeEndpoint 
          ? `${BASE_URL}/popular?per_page=50` 
          : `${BASE_URL}/search/${encodeURIComponent(query)}?per_page=50`;
        response = await apiCall(url, true);
        usedCorsProxy = true;
      }
      
      if (!response.ok) {
        throw new Error(
          `API error: ${response.status} ${response.statusText} ${usedCorsProxy ? '(with CORS proxy)' : ''} ${usedAlternativeEndpoint ? '(popular endpoint)' : ''}`
        );
      }
      
      const data = await response.json();
      console.log('API response:', data, { usedCorsProxy, usedAlternativeEndpoint }); // Debug log
      
      // Helper function to deduplicate models by ID
      const deduplicateModels = (models: ThingiverseModel[]): ThingiverseModel[] => {
        const uniqueIds = new Set<number>();
        return models.filter(model => {
          if (!model.id) return false;
          if (uniqueIds.has(model.id)) return false;
          uniqueIds.add(model.id);
          return true;
        });
      };
      
      // Process and deduplicate the data
      let processedModels: ThingiverseModel[] = [];
      
      // Check the structure of the response and handle accordingly
      if (Array.isArray(data)) {
        processedModels = deduplicateModels(data);
      } else if (data && typeof data === 'object') {
        // If data is an object with a hits/results property (common API structure)
        if (Array.isArray(data.hits)) {
          processedModels = deduplicateModels(data.hits);
        } else if (Array.isArray(data.results)) {
          processedModels = deduplicateModels(data.results);
        } else if (Array.isArray(data.models)) {
          processedModels = deduplicateModels(data.models);
        } else {
          // If we can't find a valid array, set error
          console.warn('Unexpected API response structure:', data);
          setHasError(true);
          setErrorMessage('Received unexpected data format from Thingiverse API');
          // Reset models to empty array to ensure we show the fallback
          setModels([]);
          setIsLoading(false);
          return;
        }
      } else {
        // Handle unexpected response
        console.warn('Unexpected API response:', data);
        setHasError(true);
        setErrorMessage('Received unexpected data from Thingiverse API');
        // Reset models to empty array to ensure we show the fallback
        setModels([]);
        setIsLoading(false);
        return;
      }
      
      console.log(`Found ${processedModels.length} unique models after deduplication`);
      setModels(processedModels);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching models:', error);
      setErrorMessage(error instanceof Error 
        ? error.message 
        : 'Failed to fetch models. API key may have expired or has access restrictions.');
      setHasError(true);
      setIsLoading(false);
      // Reset models to empty array to ensure we show the fallback
      setModels([]);
    }
  };

  // Simplified download function - just open the files page
  const downloadModel = async (modelId: number) => {
    setDownloadingModelId(modelId);
    
    try {
      // Get the model
      const model = models.find(m => m.id === modelId) || 
                   fallbackModels.find(m => m.id === modelId);
                   
      if (!model) {
        throw new Error('Model not found');
      }
      
      // Construct the model URL with files tab
      const filesUrl = `${model.public_url}/files`;
      
      // Open the files page directly
      window.open(filesUrl, '_blank');
      
      toast({
        title: "Files page opened",
        description: "We've opened the model's files page where you can download individual files.",
        duration: 5000,
      });
      
    } catch (error) {
      console.error('Error navigating to files page:', error);
      
      toast({
        title: "Navigation failed",
        description: error instanceof Error ? error.message : 'Failed to open files page',
        variant: "destructive",
        duration: 4000,
      });
      
      // If navigation fails, open the main model page instead
      const model = models.find(m => m.id === modelId) || 
                    fallbackModels.find(m => m.id === modelId);
      
      if (model) {
        window.open(model.public_url, '_blank');
      }
    } finally {
      setDownloadingModelId(null);
    }
  };

  // Load models on component mount
  useEffect(() => {
    fetchModels(searchTerm);
  }, []);

  // Open model in new tab
  const openModelPage = (url: string) => {
    window.open(url, '_blank');
  };

  // Open Thingiverse search page in new tab
  const openThingiverseSearch = () => {
    window.open(`https://www.thingiverse.com/search?q=${encodeURIComponent(searchTerm)}&page=1`, '_blank');
  };

  // Handle search form submission
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetchModels(searchTerm);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Fallback models in case API fails
  const fallbackModels = [
    {
      id: 1,
      name: 'Raspberry Pi 4 Case',
      thumbnail: 'https://cdn.thingiverse.com/assets/a5/12/9b/0a/7b/large_display_assembly_render_02_a.png',
      public_url: 'https://www.thingiverse.com/thing:3723561',
      creator: { name: 'bmsleight', public_url: 'https://www.thingiverse.com/bmsleight/designs' },
      like_count: 1254,
      download_count: 37825
    },
    {
      id: 2,
      name: 'Raspberry Pi 4 Case with Fan',
      thumbnail: 'https://cdn.thingiverse.com/assets/80/67/75/41/10/large_display_IMG_1132.JPG',
      public_url: 'https://www.thingiverse.com/thing:3751865',
      creator: { name: 'ekoputeh1', public_url: 'https://www.thingiverse.com/ekoputeh1/designs' },
      like_count: 982,
      download_count: 25431
    },
    {
      id: 3,
      name: 'Raspberry Pi Camera Case',
      thumbnail: 'https://cdn.thingiverse.com/assets/9d/5c/6b/e2/d0/large_display_IMG_20190725_202249.jpg',
      public_url: 'https://www.thingiverse.com/thing:3772189',
      creator: { name: 'superf1y', public_url: 'https://www.thingiverse.com/superf1y/designs' },
      like_count: 754,
      download_count: 17283
    },
    {
      id: 4,
      name: 'Raspberry Pi 3 (B/B+) Case',
      thumbnail: 'https://cdn.thingiverse.com/assets/5e/f9/97/43/af/large_display_Pi.png',
      public_url: 'https://www.thingiverse.com/thing:922740',
      creator: { name: 'M-P', public_url: 'https://www.thingiverse.com/M-P/designs' },
      like_count: 2417,
      download_count: 64183
    },
    {
      id: 5,
      name: 'Raspberry Pi Zero Case',
      thumbnail: 'https://cdn.thingiverse.com/assets/da/10/f1/1e/07/large_display_DSC_8486.jpg',
      public_url: 'https://www.thingiverse.com/thing:1167846',
      creator: { name: 'walter', public_url: 'https://www.thingiverse.com/walter/designs' },
      like_count: 1874,
      download_count: 59251
    },
    {
      id: 6,
      name: 'Raspberry Pi 4 Cluster Case',
      thumbnail: 'https://cdn.thingiverse.com/assets/22/11/fb/0a/c4/large_display_cluster.jpg',
      public_url: 'https://www.thingiverse.com/thing:4756812',
      creator: { name: 'cyanide', public_url: 'https://www.thingiverse.com/cyanide/designs' },
      like_count: 487,
      download_count: 10923
    },
  ] as ThingiverseModel[];

  return (
    <div className="h-full flex flex-col">
      {/* Header - fixed, non-scrollable */}
      <div className="p-3 border-b bg-card">
        <div className="flex justify-between items-center">
          <div className="min-w-0 mr-2">
            <h3 className="text-lg font-medium truncate">Thingiverse Models</h3>
          </div>
          <Button variant="outline" size="sm" className="whitespace-nowrap flex-shrink-0" onClick={openThingiverseSearch}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Browse
          </Button>
        </div>
        
        <form onSubmit={handleSearch} className="flex items-center space-x-2 mt-2">
          <Input 
            placeholder="Search models on Thingiverse..." 
            value={searchTerm}
            onChange={handleSearchChange}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>
      
      {/* Results container - FIXED HEIGHT, SCROLLABLE */}
      <div className="p-3" key={contentKey}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
            <span>Loading models...</span>
          </div>
        ) : hasError ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">
              Error: {errorMessage || 'Could not fetch models'}
            </p>
            <p className="text-sm font-medium mb-4">Showing fallback models instead</p>
            
            {/* Scrollable container for fallback models - single instance */}
            <div className="border rounded-md bg-slate-50 dark:bg-slate-900">
              <div className="h-[450px] overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-3">
                  {fallbackModels.map(model => (
                    <ModelCard 
                      key={`fallback-${model.id}`} 
                      model={model} 
                      onView={openModelPage}
                      onDownload={downloadModel}
                      isDownloading={downloadingModelId === model.id}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm">
                {models.length > 0 
                  ? `Found ${models.length} models for "${searchTerm}"` 
                  : `No models found for "${searchTerm}"`}
              </p>
              {models.length === 0 && (
                <Button variant="link" size="sm" onClick={() => fetchModels('raspberry pi')}>
                  Try "raspberry pi"
                </Button>
              )}
            </div>
            
            {/* Dedicated scrollable container with fixed height - single instance */}
            <div className="border rounded-md bg-slate-50 dark:bg-slate-900">
              <div className="h-[450px] overflow-y-auto p-3">
                {models.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {models.map(model => (
                      <ModelCard 
                        key={`model-${model.id}`} 
                        model={model} 
                        onView={openModelPage}
                        onDownload={downloadModel}
                        isDownloading={downloadingModelId === model.id}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p>No models found for your search.</p>
                    <Button 
                      onClick={() => fetchModels('raspberry pi')} 
                      variant="link" 
                      className="mt-2"
                    >
                      Try searching for "raspberry pi" instead
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer - fixed, non-scrollable */}
      <div className="mt-auto p-3 border-t bg-card">
        <p className="text-xs text-muted-foreground">
          Models from <a href="https://www.thingiverse.com" target="_blank" rel="noopener noreferrer" className="underline">Thingiverse.com</a> - 
          Click the model or the FILES button to access downloadable files
        </p>
      </div>
    </div>
  );
}

// Component for individual model cards
function ModelCard({ 
  model, 
  onView, 
  onDownload, 
  isDownloading
}: { 
  model: ThingiverseModel, 
  onView: (url: string) => void,
  onDownload: (id: number) => void,
  isDownloading: boolean
}) {
  // Ensure we have a complete model name
  const displayName = model.name || "Untitled Model";
  
  return (
    <Card className="overflow-hidden flex flex-col h-full border shadow-sm hover:shadow-md transition-shadow">
      {/* Image container */}
      <div 
        className="w-full pt-[70%] relative bg-slate-100 dark:bg-slate-800 cursor-pointer"
        onClick={() => onDownload(model.id)}
      >
        <img 
          src={model.thumbnail} 
          alt={displayName}
          className="absolute top-0 left-0 w-full h-full object-contain"
          loading="lazy"
          onError={(e) => {
            // Set a default image if loading fails
            (e.target as HTMLImageElement).src = 'https://cdn.thingiverse.com/site/img/default/Thingiverse_color.png';
          }}
        />
      </div>
      
      {/* Content container */}
      <div className="flex flex-col p-2 pt-3 flex-grow">
        {/* Title with multi-line clamping (2 lines max) */}
        <h3 
          className="text-sm font-medium leading-tight mb-2 overflow-hidden" 
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            height: '2.5em'
          }}
          title={displayName}
        >
          {displayName}
        </h3>
      </div>
      
      {/* Single button for Files */}
      <div className="px-2 pb-2">
        <Button 
          size="sm" 
          variant="default"
          className="h-8 w-full text-xs font-semibold bg-green-600 hover:bg-green-700 text-white"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(model.id);
          }}
          disabled={isDownloading}
          title="Go to files page to download"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 mr-1 flex-shrink-0 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1 flex-shrink-0" />
          )}
          <span className="truncate">
            {isDownloading ? 'OPENING...' : 'FILES'}
          </span>
        </Button>
      </div>
    </Card>
  );
} 