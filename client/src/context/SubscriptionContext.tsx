import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserSubscription } from '@/lib/stripeApi';
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
    if (!user) {
      setSubscription({ ...defaultSubscription, loading: false });
      return;
    }

    try {
      setSubscription(prev => ({ ...prev, loading: true }));
      const data = await getUserSubscription(user.id);
      
      setSubscription({
        isPro: data.isPro,
        modelsRemainingThisMonth: data.modelsRemainingThisMonth,
        modelsGeneratedThisMonth: data.modelsGeneratedThisMonth,
        downloadsThisMonth: data.downloadsThisMonth,
        subscriptionStatus: data.subscriptionStatus,
        subscriptionEndDate: data.subscriptionEndDate,
        subscriptionPlan: data.subscriptionPlan,
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching subscription data:', error);
      setSubscription(prev => ({ ...prev, loading: false }));
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