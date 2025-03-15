import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { 
  signInWithGoogle, 
  signOut as firebaseSignOut, 
  onAuthStateChange,
  getCurrentUser 
} from '@/lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface User {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  checkAuth: async () => false,
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

// Function to setup free trial for new users
const setupFreeTrial = async (userId: string, email: string): Promise<void> => {
  if (!userId || !email) {
    console.error('Missing user info for trial setup');
    return;
  }
  
  try {
    // Get the ID token for verification on the server
    const firebaseUser = getCurrentUser();
    let idToken = '';
    
    if (firebaseUser) {
      idToken = await firebaseUser.getIdToken();
    }
    
    // Call the setup-trial endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/setup-trial`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        email,
        idToken
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success) {
        // Only show welcome message if trial was newly activated
        if (data.message === 'One-hour free trial activated successfully') {
          const trialEndTime = new Date(data.trialEndDate);
          const formattedTime = trialEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          toast.success(
            `Welcome! You have a 1-hour Pro trial until ${formattedTime}`,
            { duration: 6000 }
          );
        }
      } else {
        console.error('Failed to setup trial:', data.message);
      }
    } else {
      console.error('Failed to setup trial, API returned:', response.status);
    }
  } catch (error) {
    console.error('Error setting up free trial:', error);
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Set up auth state observer
  useEffect(() => {
    const unsubscribe = onAuthStateChange((firebaseUser) => {
      setIsLoading(false);
      
      if (firebaseUser) {
        const formattedUser = formatUser(firebaseUser);
        setUser(formattedUser);
        setIsAuthenticated(true);
        
        // Set up free trial for the user if needed
        if (firebaseUser.email) {
          setupFreeTrial(firebaseUser.uid, firebaseUser.email);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    // Clean up observer on unmount
    return () => unsubscribe();
  }, []);

  const checkAuth = async (): Promise<boolean> => {
    return isAuthenticated;
  };

  const login = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      // Auth state observer will update user state
      toast.success('Signed in successfully');
    } catch (error) {
      console.error('Login failed', error);
      toast.error('Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await firebaseSignOut();
      // Auth state observer will update user state
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Logout failed', error);
      toast.error('Sign out failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 