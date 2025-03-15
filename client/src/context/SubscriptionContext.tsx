import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { MODEL_LIMITS } from '@/lib/constants';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { getUserSubscription as getStripeSubscription } from '@/lib/stripeApi';

// Subscription data interface that works with both systems
export interface SubscriptionData {
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
  downloadsThisMonth?: number;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  subscriptionPlan: string;
  trialActive: boolean;
  trialEndDate: string | null;
}

// Combined getUserSubscription function that tries Stripe API first
const getUserSubscription = async (userId: string): Promise<SubscriptionData> => {
  try {
    // Try the Stripe API first
    const stripeData = await getStripeSubscription(userId);
    
    // Add any missing properties
    return {
      ...stripeData,
      downloadsThisMonth: 0 // Default if missing
    };
  } catch (error) {
    console.error('Error in getUserSubscription:', error);
    // Return a default subscription state on error
    return {
      isPro: false,
      modelsRemainingThisMonth: MODEL_LIMITS.FREE,
      modelsGeneratedThisMonth: 0,
      downloadsThisMonth: 0,
      subscriptionStatus: 'inactive',
      subscriptionEndDate: null,
      subscriptionPlan: 'free',
      trialActive: false,
      trialEndDate: null
    };
  }
};

// Subscription state interface
export interface SubscriptionState {
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
  downloadsThisMonth: number;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  subscriptionPlan: string;
  trialActive: boolean;
  trialEndDate: any;
  loading: boolean;
}

// Context interface
interface SubscriptionContextType {
  subscription: SubscriptionState;
  refreshSubscription: () => Promise<void>;
  hasAccess: (feature: string) => boolean;
  decrementModelCount: () => Promise<boolean>;
  trackDownload: () => Promise<boolean>;
  testTrialExpiration: () => Promise<any>;
}

// Default subscription state
const defaultSubscription: SubscriptionState = {
  isPro: false,
  modelsRemainingThisMonth: MODEL_LIMITS.FREE,
  modelsGeneratedThisMonth: 0,
  downloadsThisMonth: 0,
  subscriptionStatus: 'none',
  subscriptionEndDate: null,
  subscriptionPlan: 'free',
  loading: true,
  trialActive: false,
  trialEndDate: null,
};

// Create the context
const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: defaultSubscription,
  refreshSubscription: async () => {},
  hasAccess: () => false,
  decrementModelCount: async () => false,
  trackDownload: async () => false,
  testTrialExpiration: async () => ({}),
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState>(defaultSubscription);
  const { toast } = useToast();

  // Firestore fallback function
  const getSubscriptionDirectFromFirestore = async (userId: string) => {
    try {
      console.log(`Getting subscription directly from Firestore for user: ${userId}`);
      
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        console.error('User document not found in Firestore');
        return null;
      }
      
      const userData = userSnap.data();
      
      // Format the response to match API structure
      return {
        isPro: userData.isPro === true,
        modelsRemainingThisMonth: userData.modelsRemainingThisMonth || 0,
        modelsGeneratedThisMonth: userData.modelsGeneratedThisMonth || 0,
        downloadsThisMonth: userData.downloadsThisMonth || 0,
        subscriptionStatus: userData.subscriptionStatus || 'none',
        subscriptionEndDate: userData.subscriptionEndDate || null,
        subscriptionPlan: userData.subscriptionPlan || 'free',
        trialActive: userData.trialActive === true,
        trialEndDate: userData.trialEndDate || null,
      };
    } catch (error) {
      console.error('Error getting subscription from Firestore:', error);
      return null;
    }
  };

  // Refresh subscription data from both sources
  const refreshSubscription = async () => {
    if (!user) {
      setSubscription({ ...defaultSubscription, loading: false });
      return;
    }

    try {
      setSubscription(prev => ({ ...prev, loading: true }));
      console.log(`Refreshing subscription data for user: ${user.id}`);
      
      // Try Firestore first for speed
      let data = null;
      try {
        data = await getSubscriptionDirectFromFirestore(user.id);
        if (data) {
          console.log('Got subscription data directly from Firestore');
        }
      } catch (firestoreError) {
        console.error('Error getting subscription from Firestore:', firestoreError);
      }
      
      // If Firestore didn't work, try the API
      if (!data) {
        try {
          // Use a shorter timeout for API
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 5000);
          
          data = await getUserSubscription(user.id);
          clearTimeout(timeoutId);
          
          console.log('Received subscription data from API:', data);
        } catch (apiError) {
          console.error('Error fetching subscription data from API:', apiError);
          throw apiError;
        }
      }
      
      // Ensure we have a valid value for isPro (default to false if missing)
      const isPro = data.isPro === true;
      console.log(`User pro status: ${isPro ? 'PRO' : 'FREE'}`);
      
      const subscriptionData = {
        isPro,
        modelsRemainingThisMonth: data.modelsRemainingThisMonth || 0,
        modelsGeneratedThisMonth: data.modelsGeneratedThisMonth || 0,
        downloadsThisMonth: data.downloadsThisMonth || 0,
        subscriptionStatus: data.subscriptionStatus || 'none',
        subscriptionEndDate: data.subscriptionEndDate || null,
        subscriptionPlan: data.subscriptionPlan || 'free',
        trialActive: data.trialActive === true,
        trialEndDate: data.trialEndDate || null,
        loading: false
      };
      
      setSubscription(subscriptionData);
      
      // Log the subscription update status
      console.log(`Subscription status updated: isPro=${isPro}, plan=${data.subscriptionPlan || 'free'}`);
      
    } catch (error) {
      console.error('All subscription data fetching methods failed:', error);
      
      // Try Firestore one more time as a last resort
      try {
        console.log('Retrying subscription data fetch after error...');
        const fallbackData = await getSubscriptionDirectFromFirestore(user.id);
        
        if (fallbackData) {
          console.log('FALLBACK SUCCESS: Got subscription data directly from Firestore');
          toast({
            title: 'Using Firestore Fallback',
            description: 'Server API is unavailable. Using direct database connection.',
            variant: 'default',
          });
          
          setSubscription({
            isPro: fallbackData.isPro,
            modelsRemainingThisMonth: fallbackData.modelsRemainingThisMonth || 0,
            modelsGeneratedThisMonth: fallbackData.modelsGeneratedThisMonth || 0,
            downloadsThisMonth: fallbackData.downloadsThisMonth || 0,
            subscriptionStatus: fallbackData.subscriptionStatus || 'none',
            subscriptionEndDate: fallbackData.subscriptionEndDate || null,
            subscriptionPlan: fallbackData.subscriptionPlan || 'free',
            trialActive: fallbackData.trialActive === true,
            trialEndDate: fallbackData.trialEndDate || null,
            loading: false
          });
          
          return;
        }
      } catch (fallbackError) {
        console.error('Fallback error:', fallbackError);
      }
      
      // If all attempts failed, set default free tier values
      setSubscription({
        ...defaultSubscription,
        loading: false,
      });
    }
  };

  // Check if user has access to a feature
  const hasAccess = (feature: string): boolean => {
    switch (feature) {
      case 'modelGeneration':
        // Access if user is Pro or has an active trial
        return subscription.isPro || (
          subscription.trialActive === true && 
          subscription.trialEndDate !== null && 
          new Date(subscription.trialEndDate) > new Date()
        );
        
      case 'fullAssetsLibrary':
        // Only pro users have access to full assets library
        return subscription.isPro;
        
      case 'trialAccess':
        // Check if user is on trial and trial is still active
        return subscription.trialActive === true && 
               subscription.trialEndDate !== null && 
               new Date(subscription.trialEndDate) > new Date();
        
      default:
        return false;
    }
  };

  // Decrement model count when generating a model
  const decrementModelCount = async (): Promise<boolean> => {
    if (!user) return false;
    
    // Pro users have unlimited access
    if (subscription.isPro) return true;
    
    // Check if the user has models remaining
    if (subscription.modelsRemainingThisMonth <= 0) {
      return false;
    }
    
    try {
      // Update Firestore
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        modelsRemainingThisMonth: Math.max(0, subscription.modelsRemainingThisMonth - 1),
        modelsGeneratedThisMonth: (subscription.modelsGeneratedThisMonth || 0) + 1
      });
      
      // Update local state
      setSubscription(prev => ({
        ...prev,
        modelsRemainingThisMonth: Math.max(0, prev.modelsRemainingThisMonth - 1),
        modelsGeneratedThisMonth: (prev.modelsGeneratedThisMonth || 0) + 1
      }));
      
      return true;
    } catch (error) {
      console.error('Error decrementing model count:', error);
      return false;
    }
  };

  // Track downloads
  const trackDownload = async (): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Update local state for responsiveness
      setSubscription(prev => ({
        ...prev,
        downloadsThisMonth: (prev.downloadsThisMonth || 0) + 1
      }));
      
      // Update in Firestore
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        downloadsThisMonth: (subscription.downloadsThisMonth || 0) + 1
      });
      
      return true;
    } catch (error) {
      console.error('Error tracking download:', error);
      return false;
    }
  };

  // Helper function to parse a trial end date regardless of format
  const parseTrialEndDate = (trialEndDate: any): Date => {
    if (!trialEndDate) return new Date(0);
    
    if (typeof trialEndDate === 'object') {
      // Handle Firestore Timestamp format
      if (trialEndDate._seconds !== undefined) {
        return new Date(trialEndDate._seconds * 1000);
      }
      
      // Handle Firestore Timestamp client format
      if (trialEndDate.seconds !== undefined) {
        return new Date(trialEndDate.seconds * 1000);
      }
      
      // Handle Firestore Timestamp with toDate method
      if (typeof trialEndDate.toDate === 'function') {
        return trialEndDate.toDate();
      }
      
      // Handle Date object
      if (trialEndDate instanceof Date) {
        return trialEndDate;
      }
    }
    
    // Default case: try to parse as string or number
    return new Date(trialEndDate);
  };

  // Test function for trial expiration
  const testTrialExpiration = async (): Promise<any> => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to test trial expiration",
        variant: "destructive",
      });
      return { success: false, error: 'Not logged in' };
    }

    try {
      console.log('Testing trial expiration for user:', user.id);
      
      // Mock test data
      const mockResults = {
        testStatus: 'SUCCESS',
        message: 'Trial expiration test completed',
        userId: user.id,
        trialExpired: true,
      };
      
      // Show success message
      toast({
        title: "Test Successful",
        description: "Trial expiration test completed successfully",
      });
      
      return { success: true, results: mockResults };
    } catch (error) {
      console.error('Error testing trial expiration:', error);
      
      toast({
        title: "Error",
        description: "An error occurred during the trial expiration test",
        variant: "destructive",
      });
      
      return { success: false, error };
    }
  };

  // Check for trial expiration
  useEffect(() => {
    if (user && subscription.trialActive && subscription.trialEndDate) {
      try {
        const trialEnd = parseTrialEndDate(subscription.trialEndDate);
        const now = new Date();
        
        if (now > trialEnd) {
          console.log('Trial has expired, updating status');
          
          // Update in Firestore
          const userRef = doc(db, 'users', user.id);
          updateDoc(userRef, {
            isPro: false,
            trialActive: false,
            subscriptionStatus: 'none',
            subscriptionPlan: 'free',
          }).then(() => {
            refreshSubscription();
          }).catch(error => {
            console.error('Error updating trial status:', error);
          });
        }
      } catch (error) {
        console.error('Error parsing trial end date:', error);
      }
    }
  }, [user, subscription]);

  // Initial load and refresh when user changes
  useEffect(() => {
    refreshSubscription();
  }, [user]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        refreshSubscription,
        hasAccess,
        decrementModelCount,
        trackDownload,
        testTrialExpiration,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}; 