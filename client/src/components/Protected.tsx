import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Login } from '@/components/Login';
import { Loader2 } from 'lucide-react';

interface ProtectedProps {
  children: React.ReactNode;
}

export function Protected({ children }: ProtectedProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // If not authenticated, show login screen
  if (!isAuthenticated) {
    return <Login />;
  }

  // If authenticated, render the children
  return <>{children}</>;
} 