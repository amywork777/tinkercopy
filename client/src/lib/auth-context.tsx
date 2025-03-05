import React, { createContext, useState, useEffect, useContext } from 'react';

// Define the User type
export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

// Define the Authentication Context type
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

// Create the Auth Context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

// Custom hook for using the auth context
export const useAuth = () => useContext(AuthContext);

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for user session on initial load
  useEffect(() => {
    const checkUser = async () => {
      try {
        // Fetch the current user from your server
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setUser(data.user);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();
  }, []);

  // Function to handle login
  const login = () => {
    // Redirect to the Google OAuth login page
    window.location.href = '/api/auth/login/google';
  };

  // Function to handle logout
  const logout = async () => {
    try {
      // Call logout endpoint
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        setUser(null);
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Derived authentication state
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}; 