import React, { useState, useEffect } from 'react';
import { getUserAssets, uploadAsset, deleteUserAsset } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useScene } from '@/hooks/use-scene';
import { Upload, Plus, Trash2, RefreshCw, Save, FileText } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { eventBus, EVENTS } from '@/lib/events';

interface Asset {
  id: string;
  name: string;
  fileName: string;
  downloadURL: string;
  fileType: string;
  fileSize: number;
  createdAt: any; // Firestore timestamp
}

export function AssetLibrary() {
  const { user, isAuthenticated } = useAuth();
  const { loadSTL } = useScene();
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch user assets when component mounts or when triggered by events
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchUserAssets();
      
      // Set up event listener for refreshing drafts
      const handleRefreshDrafts = () => {
        fetchUserAssets();
      };
      
      // Subscribe to refresh event
      eventBus.on(EVENTS.REFRESH_DRAFTS, handleRefreshDrafts);
      
      // Cleanup function to remove event listener
      return () => {
        eventBus.off(EVENTS.REFRESH_DRAFTS, handleRefreshDrafts);
      };
    } else {
      setAssets([]);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  const fetchUserAssets = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const userAssets = await getUserAssets(user.id);
      setAssets(userAssets as Asset[]);
    } catch (error) {
      console.error('Error fetching assets:', error);
      toast({
        description: 'Failed to fetch your assets',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Use the filename without extension as default model name
      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
      setModelName(nameWithoutExtension);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !user) return;
    
    setUploading(true);
    try {
      await uploadAsset(user.id, selectedFile, modelName);
      
      toast({
        description: 'Your file has been added to your drafts',
      });
      
      // Reset form
      setSelectedFile(null);
      setModelName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Refresh assets
      fetchUserAssets();
    } catch (error) {
      console.error('Error uploading asset:', error);
      toast({
        description: 'Failed to upload your file',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    if (!user) return;
    
    try {
      await deleteUserAsset(user.id, asset.id, asset.fileName);
      
      toast({
        description: 'Draft has been removed from your library',
      });
      
      // Refresh assets
      fetchUserAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast({
        description: 'Failed to delete the draft',
        variant: 'destructive',
      });
    }
  };

  const handleLoadModel = async (asset: Asset) => {
    try {
      // Use our proxy to load the STL file and include user ID for Pro access check
      const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(asset.downloadURL)}&userId=${user?.id || ''}`;
      await loadSTL(proxyUrl, asset.name);
      
      toast({
        description: `${asset.name} loaded into the scene`,
      });
    } catch (error) {
      console.error('Error loading model:', error);
      toast({
        description: 'Failed to load the model',
        variant: 'destructive',
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <h3 className="text-lg font-medium mb-2">Sign in required</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Please sign in to access your drafts
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <h3 className="text-lg font-medium">Your Drafts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Store and reuse your models
        </p>
        
        <Card className="bg-muted/20 p-3 mb-4 border-dashed border">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">How to save models to drafts:</h4>
            <ol className="text-xs text-muted-foreground space-y-1 pl-5 list-decimal">
              <li>Select a model in the 3D viewport</li>
              <li>Click the <FileText className="inline-block h-3 w-3 mx-0.5" /> Save to Drafts button in the toolbar</li>
              <li>Your model will appear in this list</li>
            </ol>
          </div>
        </Card>
        
        <Card className="bg-muted/30 p-3 mb-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="file-upload" className="text-sm">STL File</Label>
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept=".stl"
                onChange={handleFileSelect}
                className="mt-1 text-sm"
              />
            </div>
            
            {selectedFile && (
              <div>
                <Label htmlFor="model-name" className="text-sm">Draft Name</Label>
                <Input
                  id="model-name"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="mt-1 text-sm"
                  placeholder="Enter a name for your draft"
                />
              </div>
            )}
            
            <Button 
              onClick={handleFileUpload} 
              disabled={!selectedFile || uploading}
              className="w-full"
              size="sm"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save to Drafts
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
      
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Saved Drafts</h3>
          <Button variant="outline" size="sm" onClick={fetchUserAssets} className="h-7 px-2">
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>
      
      <div className="px-4 pb-4 flex-1">
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <Card className="p-3 bg-muted/40 text-xs text-center">
            <p>No drafts saved yet</p>
            <p className="text-muted-foreground mt-1 mb-3">Save a model to your drafts to get started</p>
            
            <div className="flex items-center justify-center space-x-2 text-muted-foreground mb-1">
              <div className="flex flex-col items-center">
                <div className="p-1 rounded-full bg-muted">1</div>
                <p className="mt-1">Select model</p>
              </div>
              <div className="h-px w-5 bg-muted-foreground/30 mt-4" />
              <div className="flex flex-col items-center">
                <div className="p-1 rounded-full bg-muted">2</div>
                <p className="mt-1">Click <FileText className="inline-block h-3 w-3 mx-0.5" /></p>
              </div>
              <div className="h-px w-5 bg-muted-foreground/30 mt-4" />
              <div className="flex flex-col items-center">
                <div className="p-1 rounded-full bg-muted">3</div>
                <p className="mt-1">Save draft</p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-2 h-[280px]">
            <ScrollArea className="h-full rounded-md border">
              <div className="p-2 space-y-1">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-accent"
                  >
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{asset.name}</span>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <span>{(asset.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                        <span className="mx-1">•</span>
                        <span>{new Date(asset.createdAt.seconds * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2 bg-blue-600/20 text-blue-600 text-[10px] h-5">
                        STL
                      </Badge>
                      <Button 
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 mr-1"
                        onClick={() => handleLoadModel(asset)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7 hover:bg-destructive/10"
                        onClick={() => handleDeleteAsset(asset)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
} 