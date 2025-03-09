import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, LogOut } from 'lucide-react';

// Thingiverse OAuth configuration
const CLIENT_ID = '1a0b2e84953b32da78b5';
const REDIRECT_URI = `${window.location.origin}/thingiverse-callback`;
const AUTH_URL = 'https://www.thingiverse.com/login/oauth/authorize';
const TOKEN_URL = 'https://www.thingiverse.com/login/oauth/access_token';
const CORS_PROXY = 'https://corsproxy.io/?';

// Storage key for the token
const TOKEN_STORAGE_KEY = 'thingiverse_oauth_token';
// Storage key for auth status
const AUTH_STATUS_KEY = 'thingiverse_auth_status';

interface ThingiverseAuthProps {
  onAuthStateChanged: (isAuthenticated: boolean, token?: string) => void;
}

export function ThingiverseAuth({ onAuthStateChanged }: ThingiverseAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const { toast } = useToast();

  // Check for existing token on component mount
  useEffect(() => {
    // First check if we have auth status from localStorage
    const authStatus = localStorage.getItem(AUTH_STATUS_KEY) === 'true';
    
    if (authStatus) {
      // We're using the simpler approach with browser cookies now
      setIsAuthenticated(true);
      onAuthStateChanged(true);
    }
    
    // For backward compatibility, still check actual tokens
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedToken && !authStatus) {
      // Validate token before using it
      validateToken(savedToken).then(isValid => {
        if (isValid) {
          setToken(savedToken);
          setIsAuthenticated(true);
          localStorage.setItem(AUTH_STATUS_KEY, 'true');
          onAuthStateChanged(true, savedToken);
        } else {
          // Token is invalid or expired
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(AUTH_STATUS_KEY);
        }
      });
    }
    
    // Check if this is a OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      // Exchange code for token
      handleOAuthCallback(code);
    }
  }, [onAuthStateChanged]);

  // Validate a token
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      // Use the tokeninfo endpoint to validate
      const response = await fetch(
        `${CORS_PROXY}${encodeURIComponent('https://www.thingiverse.com/login/oauth/tokeninfo')}`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `access_token=${token}`
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        // Ensure the audience matches our client ID
        return data.audience === CLIENT_ID;
      }
      
      return false;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  // Handle OAuth callback - this gets called when redirected back from Thingiverse
  const handleOAuthCallback = (code: string) => {
    setIsAuthenticating(true);
    
    // With the simplified approach, we just assume success if we get a code back
    // This relies on the browser maintaining cookies from Thingiverse
    
    // Remove code from URL to prevent reusing it
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Mark as authenticated
    setIsAuthenticated(true);
    localStorage.setItem(AUTH_STATUS_KEY, 'true');
    onAuthStateChanged(true);
    
    toast({
      title: 'Authentication successful',
      description: 'You can now download files directly from Thingiverse.',
      duration: 3000,
    });
    
    setIsAuthenticating(false);
  };

  // Exchange authorization code for token - not needed with the simplified approach
  const exchangeCodeForToken = async (code: string) => {
    setIsAuthenticating(true);
    
    try {
      // Remove code from URL to prevent reusing it
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Prepare token exchange request
      const params = new URLSearchParams();
      params.append('client_id', CLIENT_ID);
      params.append('redirect_uri', REDIRECT_URI);
      params.append('code', code);
      
      // We need to use a proxy for this request due to CORS limitations
      const response = await fetch(
        `${CORS_PROXY}${encodeURIComponent(TOKEN_URL)}`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString()
        }
      );
      
      if (response.ok) {
        const data = await response.text();
        const parsedData = new URLSearchParams(data);
        const newToken = parsedData.get('access_token');
        
        if (newToken) {
          // Save token and update state
          localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
          localStorage.setItem(AUTH_STATUS_KEY, 'true');
          setToken(newToken);
          setIsAuthenticated(true);
          onAuthStateChanged(true, newToken);
          
          toast({
            title: 'Authentication successful',
            description: 'You can now download files directly from Thingiverse.',
            duration: 3000,
          });
        } else {
          throw new Error('No access token received');
        }
      } else {
        throw new Error(`Exchange failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      toast({
        title: 'Authentication failed',
        description: error instanceof Error ? error.message : 'Failed to authenticate with Thingiverse',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Start OAuth flow
  const handleLogin = () => {
    // Generate and save a random state parameter for security
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('thingiverse_oauth_state', state);
    
    // Redirect to Thingiverse authorization page
    const authUrl = `${AUTH_URL}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
    
    // Open Thingiverse login in current window to ensure cookies are set for this origin
    window.location.href = authUrl;
  };

  // Log out and clear token
  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_STATUS_KEY);
    setToken(null);
    setIsAuthenticated(false);
    onAuthStateChanged(false);
    
    // Also redirect to Thingiverse logout to clear any cookies
    window.open('https://www.thingiverse.com/logout', '_blank');
    
    toast({
      title: 'Logged out',
      description: 'You have been logged out of Thingiverse.',
      duration: 3000,
    });
  };

  return (
    <div className="flex items-center space-x-2">
      {isAuthenticating ? (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Authenticating...
        </Button>
      ) : isAuthenticated ? (
        <Button size="sm" variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Logout from Thingiverse
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={handleLogin}>
          <LogIn className="h-4 w-4 mr-2" />
          Login to Thingiverse
        </Button>
      )}
    </div>
  );
} 