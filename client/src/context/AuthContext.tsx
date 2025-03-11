import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { 
  signInWithGoogle, 
  signOut as firebaseSignOut, 
  onAuthStateChange 
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