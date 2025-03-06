import React, { useState, useEffect } from 'react';
import { getUserAssets, uploadAsset, deleteUserAsset } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useScene } from '@/hooks/use-scene';
import { Upload, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Loader2 } from 'lucide-react';

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

  // Fetch user assets when component mounts
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchUserAssets();
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
        description: 'Your STL file has been added to your assets',
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
        description: 'Failed to upload your STL file',
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
        description: 'Asset has been removed from your library',
      });
      
      // Refresh assets
      fetchUserAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast({
        description: 'Failed to delete the asset',
        variant: 'destructive',
      });
    }
  };

  const handleLoadModel = async (asset: Asset) => {
    try {
      // Use our proxy to load the STL file
      const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(asset.downloadURL)}`;
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
          Please sign in to access your asset library
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 overflow-y-auto">
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-4">Upload New Asset</h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="file-upload">STL File</Label>
            <Input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              accept=".stl"
              onChange={handleFileSelect}
              className="mt-1"
            />
          </div>
          
          {selectedFile && (
            <div>
              <Label htmlFor="model-name">Model Name</Label>
              <Input
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="mt-1"
                placeholder="Enter a name for your model"
              />
            </div>
          )}
          
          <Button 
            onClick={handleFileUpload} 
            disabled={!selectedFile || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload to Assets
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Your Assets</h3>
        <Button variant="outline" size="sm" onClick={fetchUserAssets}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>You don't have any assets yet</p>
          <p className="text-sm mt-2">Upload your first STL file to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium truncate">{asset.name}</h4>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleDeleteAsset(asset)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <span>{(asset.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                  <span>
                    {new Date(asset.createdAt.seconds * 1000).toLocaleDateString()}
                  </span>
                </div>
                
                <Button 
                  variant="default" 
                  size="sm" 
                  className="w-full"
                  onClick={() => handleLoadModel(asset)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Scene
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
} 