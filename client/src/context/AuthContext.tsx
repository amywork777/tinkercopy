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
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserSubscription } from '@/lib/stripeApi';

interface User {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  isPro?: boolean;
  subscriptionPlan?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isSigningOut: boolean;
  isAuthenticated: boolean;
  isPro: boolean;
  subscriptionPlan: string;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  resetAuthState: () => void;
  refreshUserStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticating: false,
  isSigningOut: false,
  isAuthenticated: false,
  isPro: false,
  subscriptionPlan: 'free',
  login: () => {},
  logout: () => {},
  checkAuth: async () => false,
  resetAuthState: () => {},
  refreshUserStatus: async () => {},
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
    isPro: false,
    subscriptionPlan: 'free',
  };
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState('free');
  const [authTimeoutId, setAuthTimeoutId] = useState<number | null>(null);
  const [longAuthDelayId, setLongAuthDelayId] = useState<number | null>(null);

  // Function to get user subscription data directly from Firestore
  const getUserSubscriptionData = async (userId: string): Promise<{isPro: boolean, subscriptionPlan: string}> => {
    try {
      console.log(`Fetching subscription data for user: ${userId}`);
      
      // Try direct Firestore first for faster results
      try {
        // Prioritize Firestore for speed on login
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          console.log('Firestore user data:', userData);
          return {
            isPro: userData.isPro === true,
            subscriptionPlan: userData.subscriptionPlan || 'free'
          };
        }
      } catch (firestoreError) {
        console.error('Firestore query error, trying API:', firestoreError);
      }
      
      // If Firestore fails or returns no data, try the API with shorter timeout
      try {
        // Use a shorter timeout for API calls on initial login to avoid blocking the UI
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 3000); // 3-second timeout
        
        const subscriptionData = await getUserSubscription(userId, abortController.signal);
        clearTimeout(timeoutId);
        
        console.log('API subscription data:', subscriptionData);
        return {
          isPro: subscriptionData.isPro,
          subscriptionPlan: subscriptionData.subscriptionPlan
        };
      } catch (apiError) {
        console.warn('API error, falling back to results from Firestore query', apiError);
        // We already tried Firestore above, so just return a default here
        return { isPro: false, subscriptionPlan: 'free' };
      }
    } catch (error) {
      console.error('Error fetching user subscription data:', error);
      return { isPro: false, subscriptionPlan: 'free' };
    }
  };

  // Function to refresh user status - can be called from anywhere
  const refreshUserStatus = async () => {
    if (!user) return;
    
    try {
      const { isPro: newIsPro, subscriptionPlan: newPlan } = await getUserSubscriptionData(user.id);
      
      // Update context state
      setIsPro(newIsPro);
      setSubscriptionPlan(newPlan);
      
      // Update user object with subscription data
      setUser(prevUser => 
        prevUser ? {
          ...prevUser,
          isPro: newIsPro,
          subscriptionPlan: newPlan
        } : null
      );
      
      console.log(`User status refreshed: isPro=${newIsPro}, plan=${newPlan}`);
    } catch (error) {
      console.error('Failed to refresh user status:', error);
    }
  };

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
    const unsubscribe = onAuthStateChange(async (firebaseUser: FirebaseUser | null) => {
      console.log("Auth state change detected", firebaseUser ? firebaseUser.uid : 'signed out');
      
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
        
        // Immediately fetch user subscription status
        try {
          console.log(`Immediately fetching subscription status for user ${firebaseUser.uid}`);
          const { isPro: userIsPro, subscriptionPlan: userPlan } = await getUserSubscriptionData(firebaseUser.uid);
          
          // Update state with subscription info
          setIsPro(userIsPro);
          setSubscriptionPlan(userPlan);
          
          // Update user object
          setUser(prevUser => prevUser ? {
            ...prevUser,
            isPro: userIsPro,
            subscriptionPlan: userPlan
          } : null);
          
          console.log(`User authenticated with role: ${userIsPro ? 'PRO' : 'FREE'}, plan: ${userPlan}`);
          
          // Dismiss the loading toast if it exists
          toast.dismiss('auth-loading');
          
          // Show appropriate welcome message based on subscription status
          showWelcomeMessage({
            ...formattedUser,
            isPro: userIsPro,
            subscriptionPlan: userPlan
          });
        } catch (error) {
          console.error('Error fetching subscription status on login:', error);
          // Still show welcome message even if subscription fetch fails
          toast.dismiss('auth-loading');
          showWelcomeMessage(formattedUser);
        } finally {
          // Ensure loading state is set to false in all cases
          setIsLoading(false);
        }
      } else {
        // User is signed out
        setUser(null);
        setIsAuthenticated(false);
        setIsPro(false);
        setSubscriptionPlan('free');
        setIsLoading(false);
        
        // Reset signing out state
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
        
        toast.dismiss('signout-loading');
      }
    });

    // Clean up subscription on unmount
    return () => unsubscribe();
  }, [authTimeoutId, longAuthDelayId]);

  // Helper function to show an enhanced welcome message
  const showWelcomeMessage = (user: User) => {
    toast(
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {user.profilePicture ? (
            <img 
              src={user.profilePicture} 
              alt={user.displayName} 
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            user.displayName.substring(0, 1)
          )}
        </div>
        <div>
          Welcome, {user.displayName}!
          {user.isPro && (
            <p className="text-xs font-semibold text-primary">
              PRO {user.subscriptionPlan === 'annual' ? 'ANNUAL' : 'MONTHLY'} SUBSCRIPTION ACTIVE
            </p>
          )}
        </div>
      </div>,
      {
        description: 
          <div className="mt-1">
            <p>You're now signed in</p>
            <p className="text-xs mt-1 text-muted-foreground">
              Your profile is in the top-right corner
              <span className="inline-block ml-1 animate-pulse">↗️</span>
            </p>
            {user.isPro && (
              <p className="text-xs mt-1 text-green-600 font-medium">
                Your PRO features are active
              </p>
            )}
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
        isPro,
        subscriptionPlan,
        login,
        logout,
        checkAuth,
        resetAuthState,
        refreshUserStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 