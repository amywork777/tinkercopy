import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ThingiverseCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Mark as authenticated in localStorage
    localStorage.setItem('thingiverse_auth_status', 'true');
    
    // The actual authentication is handled by the ThingiverseAuth component
    // Just redirect back to the main page after a short delay to allow cookies to be set
    const timer = setTimeout(() => {
      navigate('/', { replace: true });
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="p-8 flex flex-col items-center space-y-4">
        <h2 className="text-xl font-semibold">Authenticating with Thingiverse</h2>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Please wait while we complete your authentication...</p>
        <p className="text-xs text-muted-foreground">You'll be redirected automatically</p>
      </Card>
    </div>
  );
} 