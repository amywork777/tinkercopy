import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  signInWithGoogle, 
  signOut as firebaseSignOut, 
  onAuthStateChange,
  getCurrentUser,
  scheduleRefresh
} from '@/lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface User {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isSigningOut: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  resetAuthState: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticating: false,
  isSigningOut: false,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  checkAuth: async () => false,
  resetAuthState: () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

// Convert Firebase User to our User type
const formatUser = (firebaseUser: FirebaseUser): User => {
  return {
    id: firebaseUser.uid,
    displayName: firebaseUser.displayName || 'User',
    email: firebaseUser.email || '',
    profilePicture: firebaseUser.photoURL || undefined,
  };
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authTimeoutId, setAuthTimeoutId] = useState<number | null>(null);
  const [longAuthDelayId, setLongAuthDelayId] = useState<number | null>(null);

  // Reset authentication state (can be called when sign-in gets stuck)
  const resetAuthState = useCallback(() => {
    if (authTimeoutId) {
      window.clearTimeout(authTimeoutId);
      setAuthTimeoutId(null);
    }
    
    if (longAuthDelayId) {
      window.clearTimeout(longAuthDelayId);
      setLongAuthDelayId(null);
    }
    
    setIsAuthenticating(false);
    setIsSigningOut(false);
    
    toast.dismiss('auth-loading');
    toast.dismiss('signout-loading');
    
    toast.error('Authentication process reset', {
      description: 'Please try again or reload the page',
    });
  }, [authTimeoutId, longAuthDelayId]);

  // Check if user is already signed in on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      // User is already signed in, update state immediately
      const formattedUser = formatUser(currentUser);
      setUser(formattedUser);
      setIsAuthenticated(true);
      setIsLoading(false);
    }
  }, []);

  // Set up auth state observer
  useEffect(() => {
    const unsubscribe = onAuthStateChange((firebaseUser: FirebaseUser | null) => {
      console.log("Auth state change detected", firebaseUser ? firebaseUser.uid : 'signed out');
      setIsLoading(false);
      
      if (firebaseUser) {
        const formattedUser = formatUser(firebaseUser);
        setUser(formattedUser);
        setIsAuthenticated(true);
        
        // Reset auth states when auth state changes
        setIsAuthenticating(false);
        setIsSigningOut(false);
        
        // Clear any timeout
        if (authTimeoutId) {
          window.clearTimeout(authTimeoutId);
          setAuthTimeoutId(null);
        }
        
        if (longAuthDelayId) {
          window.clearTimeout(longAuthDelayId);
          setLongAuthDelayId(null);
        }
        
        // Show sign-in success toast only if we were in the authentication process
        if (isAuthenticating) {
          showWelcomeMessage(formattedUser);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        
        // Reset auth states when auth state changes
        setIsAuthenticating(false);
        
        // Clear any timeout
        if (authTimeoutId) {
          window.clearTimeout(authTimeoutId);
          setAuthTimeoutId(null);
        }
        
        if (longAuthDelayId) {
          window.clearTimeout(longAuthDelayId);
          setLongAuthDelayId(null);
        }
        
        // Show sign-out success toast only if we were in the sign-out process
        if (isSigningOut) {
          toast.success('You have been signed out', {
            description: 'See you soon!',
            duration: 3000
          });
          setIsSigningOut(false);
        }
      }
    });

    // Clean up observer on unmount
    return () => {
      unsubscribe();
      
      // Clear any timeout
      if (authTimeoutId) {
        window.clearTimeout(authTimeoutId);
      }
      
      if (longAuthDelayId) {
        window.clearTimeout(longAuthDelayId);
      }
    };
  }, [isAuthenticating, isSigningOut, authTimeoutId, longAuthDelayId]);

  // Helper function to show an enhanced welcome message
  const showWelcomeMessage = (user: User) => {
    // Clear any existing auth toasts
    toast.dismiss('auth-loading');
    
    // Show welcome toast with avatar if available
    toast.success(
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 h-6 w-6 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
          {user.profilePicture ? (
            <img src={user.profilePicture} alt={user.displayName} className="h-full w-full object-cover" />
          ) : (
            user.displayName.substring(0, 1)
          )}
        </div>
        <div>Welcome, {user.displayName}!</div>
      </div>,
      {
        description: 
          <div className="mt-1">
            <p>You're now signed in</p>
            <p className="text-xs mt-1 text-muted-foreground">
              Your profile is in the top-right corner
              <span className="inline-block ml-1 animate-pulse">↗️</span>
            </p>
          </div>,
        duration: 5000
      }
    );
  };

  const checkAuth = async (): Promise<boolean> => {
    return isAuthenticated;
  };

  const login = async () => {
    try {
      // Cancel if already authenticating
      if (isAuthenticating) {
        console.log('Already in authentication process, skipping duplicate request');
        return;
      }
      
      // Clear any existing auth timeout
      if (authTimeoutId) {
        window.clearTimeout(authTimeoutId);
        setAuthTimeoutId(null);
      }
      
      if (longAuthDelayId) {
        window.clearTimeout(longAuthDelayId);
        setLongAuthDelayId(null);
      }
      
      setIsAuthenticating(true);
      
      // Show an immediate toast to give feedback that the process has started
      toast.loading('Signing in with Google...', {
        id: 'auth-loading'
      });
      
      // Set a timeout to auto-reset if authentication gets stuck
      const timeoutId = window.setTimeout(() => {
        if (isAuthenticating) {
          console.error('Authentication timed out after 45 seconds');
          resetAuthState();
        }
      }, 45000); // 45 second timeout
      
      setAuthTimeoutId(timeoutId);
      
      // Set a much longer timeout to auto-refresh the page if auth is still pending
      // This is a last resort recovery mechanism
      const longDelayId = window.setTimeout(() => {
        if (isAuthenticating) {
          console.error('Authentication still pending after 60 seconds - forcing page refresh');
          toast.error('Authentication taking too long', {
            description: 'Refreshing the page to reset...'
          });
          
          // Refresh the page after a brief delay to allow toast to be seen
          scheduleRefresh(2000);
        }
      }, 60000); // 60 second timeout
      
      setLongAuthDelayId(longDelayId);
      
      // Attempt sign in with refresh enabled
      await signInWithGoogle(true);
      
      // Note: We don't clear the timeout here because the auth state observer
      // will handle that when it detects the successful sign-in
    } catch (error) {
      console.error('Login failed', error);
      
      // Clear the timeout
      if (authTimeoutId) {
        window.clearTimeout(authTimeoutId);
        setAuthTimeoutId(null);
      }
      
      if (longAuthDelayId) {
        window.clearTimeout(longAuthDelayId);
        setLongAuthDelayId(null);
      }
      
      toast.error('Sign in failed', {
        description: 'Please try again or reload the page',
        id: 'auth-loading'
      });
      
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    try {
      // Cancel if already signing out
      if (isSigningOut) {
        console.log('Already in sign-out process, skipping duplicate request');
        return;
      }
      
      // Clear any existing auth timeout
      if (authTimeoutId) {
        window.clearTimeout(authTimeoutId);
        setAuthTimeoutId(null);
      }
      
      if (longAuthDelayId) {
        window.clearTimeout(longAuthDelayId);
        setLongAuthDelayId(null);
      }
      
      setIsSigningOut(true);
      
      // Show an immediate toast to give feedback that the process has started
      toast.loading('Signing out...', {
        id: 'signout-loading'
      });
      
      // Set a timeout to auto-reset if sign-out gets stuck
      const timeoutId = window.setTimeout(() => {
        if (isSigningOut) {
          console.error('Sign out timed out after 15 seconds');
          resetAuthState();
          
          // Force a page refresh as a last resort
          scheduleRefresh(2000);
        }
      }, 15000); // 15 second timeout
      
      setAuthTimeoutId(timeoutId);
      
      // Sign out with refresh enabled
      await firebaseSignOut(true);
      
      // Note: We don't clear the timeout here because the auth state observer
      // will handle that when it detects the successful sign-out
    } catch (error) {
      console.error('Logout failed', error);
      
      // Clear the timeout
      if (authTimeoutId) {
        window.clearTimeout(authTimeoutId);
        setAuthTimeoutId(null);
      }
      
      if (longAuthDelayId) {
        window.clearTimeout(longAuthDelayId);
        setLongAuthDelayId(null);
      }
      
      toast.error('Sign out failed', {
        description: 'Please try again',
        id: 'signout-loading'
      });
      
      setIsSigningOut(false);
      
      // Force a page refresh as a last resort
      scheduleRefresh(2000);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticating,
        isSigningOut,
        isAuthenticated,
        login,
        logout,
        checkAuth,
        resetAuthState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 