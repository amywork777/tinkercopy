import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserSubscription } from '@/lib/stripeApi';
import { useAuth } from './AuthContext';
import { MODEL_LIMITS } from '@/lib/constants';

export interface SubscriptionState {
  isPro: boolean;
  modelsRemainingThisMonth: number;
  modelsGeneratedThisMonth: number;
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
}

const defaultSubscription: SubscriptionState = {
  isPro: false,
  modelsRemainingThisMonth: MODEL_LIMITS.FREE,
  modelsGeneratedThisMonth: 0,
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
        // Both pro and free users can generate models if they have remaining generations
        return subscription.isPro || subscription.modelsRemainingThisMonth > 0;
        
      case 'fullAssetsLibrary':
        // Only pro users have access to full assets library
        return subscription.isPro;
        
      case 'printDiscount':
        // Only pro users get print discount
        return subscription.isPro;
        
      default:
        return false;
    }
  };

  // Decrement the model count when a model is generated
  const decrementModelCount = async (): Promise<boolean> => {
    if (!user) return false;
    
    // Pro users always have access
    if (subscription.isPro) return true;
    
    // Free users need to have remaining models
    if (subscription.modelsRemainingThisMonth <= 0) {
      return false;
    }
    
    try {
      // Call the API to update the count in the database
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/decrement-model-count`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to update model count:', await response.text());
        return false;
      }
      
      const data = await response.json();
      
      // Update the local state with the values from the server
      setSubscription(prev => ({
        ...prev,
        modelsRemainingThisMonth: data.modelsRemainingThisMonth,
        modelsGeneratedThisMonth: data.modelsGeneratedThisMonth,
      }));
      
      return true;
    } catch (error) {
      console.error('Error updating model count:', error);
      
      // Fallback to updating local state only if API call fails
      setSubscription(prev => ({
        ...prev,
        modelsRemainingThisMonth: prev.modelsRemainingThisMonth - 1,
        modelsGeneratedThisMonth: prev.modelsGeneratedThisMonth + 1,
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
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}; 