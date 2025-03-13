import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserSubscription } from '@/lib/stripeApi';
import { getUserSubscriptionData } from '../SimpleStripeCheckout';
import { useAuth } from './AuthContext';
import { MODEL_LIMITS } from '@/lib/constants';

export interface SubscriptionState {
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
  downloadsThisMonth: number;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
  subscriptionPlan: string;
  loading: boolean;
}

interface SubscriptionContextType {
  subscription: SubscriptionState;
  refreshSubscription: () => Promise<void>;
  hasAccess: (feature: string) => boolean;
  decrementModelCount: () => Promise<boolean>;
  trackDownload: () => Promise<boolean>;
}

const defaultSubscription: SubscriptionState = {
  isPro: false,
  modelsRemainingThisMonth: MODEL_LIMITS.FREE,
  modelsGeneratedThisMonth: 0,
  downloadsThisMonth: 0,
  subscriptionStatus: 'none',
  subscriptionEndDate: null,
  subscriptionPlan: 'free',
  loading: true,
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: defaultSubscription,
  refreshSubscription: async () => {},
  hasAccess: () => false,
  decrementModelCount: async () => false,
  trackDownload: async () => false,
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState>(defaultSubscription);

  const refreshSubscription = async () => {
    try {
      // Set loading state
      setSubscription(prev => ({ ...prev, loading: true }));
      
      // Check if user is available
      if (!user) {
        // No user, set to free tier and exit
        setSubscription({
          isPro: false,
          modelsRemainingThisMonth: 2, // Default free tier limit
          modelsGeneratedThisMonth: 0,
          downloadsThisMonth: 0,
          subscriptionStatus: 'none',
          subscriptionEndDate: null,
          subscriptionPlan: 'free',
          loading: false,
        });
        return;
      }
      
      const userId = user?.uid || ''; // Use optional chaining to safely access uid
      
      // Try multiple approaches to get subscription data
      let subscriptionFetched = false;
      
      // First approach: Use multi-endpoint fetch function
      try {
        console.log(`Fetching subscription data for user ID: ${userId}`);
        const response = await getUserSubscriptionData(userId);
        
        if (response && response.success) {
          const subscriptionData = {
            isPro: response.isPro || false,
            modelsRemainingThisMonth: response.modelsRemainingThisMonth || (response.isPro ? Infinity : 2),
            modelsGeneratedThisMonth: response.modelsGeneratedThisMonth || 0,
            downloadsThisMonth: response.downloadsThisMonth || 0,
            subscriptionStatus: response.subscriptionStatus || (response.isPro ? 'active' : 'none'),
            subscriptionEndDate: response.subscriptionEndDate,
            subscriptionPlan: response.subscriptionPlan || (response.isPro ? 'pro' : 'free'),
            loading: false,
          };
          setSubscription(subscriptionData);
          subscriptionFetched = true;
        }
      } catch (multiEndpointError) {
        console.error('Multi-endpoint approach failed, trying next method:', multiEndpointError);
      }
      
      // Second approach: Try Stripe API wrapper
      if (!subscriptionFetched) {
        try {
          console.log('Trying getUserSubscription API wrapper');
          const userData = await getUserSubscription(userId);
          setSubscription({
            ...userData,
            loading: false,
          });
          subscriptionFetched = true;
        } catch (error) {
          console.error('Error fetching subscription data:', error);
        }
      }
      
      // If all fetching methods failed, set to free tier as fallback
      if (!subscriptionFetched) {
        console.log('⚠️ API calls failed - setting user to free tier as fallback');
        setSubscription({
          isPro: false, // Default to free user when API fails
          modelsRemainingThisMonth: 2, // Standard free tier limit
          modelsGeneratedThisMonth: 0,
          downloadsThisMonth: 0,
          subscriptionStatus: 'none',
          subscriptionEndDate: null,
          subscriptionPlan: 'free',
          loading: false,
        });
      }
    } catch (e) {
      console.error('Global error in refreshSubscription:', e);
      // Ensure subscription state is properly set even after errors
      setSubscription(prev => ({ 
        ...prev, 
        loading: false,
        isPro: false,
        modelsRemainingThisMonth: 2
      }));
    }
  };

  // Check if user has access to a feature
  const hasAccess = (feature: string): boolean => {
    switch (feature) {
      case 'modelGeneration':
        // Only pro users can generate models now
        return subscription.isPro;
        
      case 'fullAssetsLibrary':
        // Only pro users have access to full assets library
        return subscription.isPro;
        
      case 'printDiscount':
        // Pro users no longer get a discount
        return false;
        
      default:
        return false;
    }
  };

  // Decrement the model count when a model is generated
  const decrementModelCount = async (): Promise<boolean> => {
    if (!user) return false;
    
    // Only Pro users have access now
    return subscription.isPro;
  };

  // Track downloads in Firebase
  const trackDownload = async (): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // Call the API to update the download count in Firebase
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/track-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to track download:', await response.text());
        return false;
      }
      
      const data = await response.json();
      
      // Update the local state with the new download count
      setSubscription(prev => ({
        ...prev,
        downloadsThisMonth: data.downloadsThisMonth || prev.downloadsThisMonth + 1,
      }));
      
      return true;
    } catch (error) {
      console.error('Error tracking download:', error);
      
      // Fallback to updating local state only
      setSubscription(prev => ({
        ...prev,
        downloadsThisMonth: prev.downloadsThisMonth + 1,
      }));
      
      return true;
    }
  };

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
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}; 