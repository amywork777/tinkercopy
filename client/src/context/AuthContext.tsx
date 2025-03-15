import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { 
  signInWithGoogle, 
  signOut, 
  onAuthStateChange,
  getCurrentUser
} from '@/lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserSubscription } from '@/lib/stripeApi';

// User type with both Firebase auth and Stripe subscription properties
interface User {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  isPro: boolean;
  subscriptionPlan: string;
  trialActive?: boolean;
  trialEndDate?: any;
}

// Complete context with both Firebase auth and Stripe functionality
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPro: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  setupTrial: () => Promise<void>;
  checkTrialStatus: () => Promise<boolean>;
  refreshUserStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isPro: false,
  login: async () => {},
  logout: async () => {},
  setupTrial: async () => {},
  checkTrialStatus: async () => false,
  refreshUserStatus: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPro, setIsPro] = useState(false);

  // Login with Firebase
  const login = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      // Auth state listener will handle setting the user
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Logout from Firebase
  const logout = async () => {
    try {
      setIsLoading(true);
      await signOut();
      setUser(null);
      setIsAuthenticated(false);
      setIsPro(false);
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Setup trial (Firebase functionality)
  const setupTrial = async () => {
    if (!user) return;
    
    try {
      // Create trial in Firestore
      const userRef = doc(db, 'users', user.id);
      
      // Trial for 1 hour from now
      const now = new Date();
      const trialEndDate = new Date(now.getTime() + 60 * 60 * 1000);
      
      await updateDoc(userRef, {
        trialActive: true,
        trialStartDate: now,
        trialEndDate: trialEndDate,
        isPro: true
      });
      
      // Update local state
      setUser(prev => prev ? {
        ...prev,
        isPro: true,
        trialActive: true,
        trialEndDate: trialEndDate
      } : null);
      
      setIsPro(true);
      
      toast.success('Free trial activated!');
    } catch (error) {
      console.error('Error setting up trial:', error);
      toast.error('Failed to setup trial. Please try again.');
    }
  };

  // Check trial status in Firestore
  const checkTrialStatus = async (): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const userRef = doc(db, 'users', user.id);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.trialActive && userData.trialEndDate) {
          const trialEnd = userData.trialEndDate.toDate();
          return new Date() < trialEnd;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking trial status:', error);
      return false;
    }
  };

  // Refresh user status (Stripe functionality)
  const refreshUserStatus = async () => {
    if (!user) return;
    
    try {
      // Get subscription status from Stripe
      const subscription = await getUserSubscription(user.id);
      
      // Update local state
      setIsPro(subscription.isPro);
      setUser(prev => prev ? {
        ...prev,
        isPro: subscription.isPro,
        subscriptionPlan: subscription.subscriptionPlan,
        trialActive: subscription.trialActive,
        trialEndDate: subscription.trialEndDate
      } : null);
    } catch (error) {
      console.error('Error refreshing user status:', error);
    }
  };

  // Initialize and set up auth state listener
  useEffect(() => {
    // Check if user is already signed in
    const currentUser = getCurrentUser();
    if (currentUser) {
      const formattedUser = {
        id: currentUser.uid,
        displayName: currentUser.displayName || 'User',
        email: currentUser.email || '',
        profilePicture: currentUser.photoURL || undefined,
        isPro: false,
        subscriptionPlan: 'free'
      };
      
      setUser(formattedUser);
      setIsAuthenticated(true);
      
      // Get subscription status
      refreshUserStatus();
    }
    
    // Set up auth state listener
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      setIsLoading(true);
      
      if (firebaseUser) {
        // User is signed in
        const formattedUser = {
          id: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          profilePicture: firebaseUser.photoURL || undefined,
          isPro: false,
          subscriptionPlan: 'free'
        };
        
        setUser(formattedUser);
        setIsAuthenticated(true);
        
        // Get subscription status
        await refreshUserStatus();
      } else {
        // User is signed out
        setUser(null);
        setIsAuthenticated(false);
        setIsPro(false);
      }
      
      setIsLoading(false);
    });
    
    // Clean up the listener
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        isPro,
        login,
        logout,
        setupTrial,
        checkTrialStatus,
        refreshUserStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 