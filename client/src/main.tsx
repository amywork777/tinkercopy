import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './components/ui/theme-provider';
import { AuthProvider } from './context/AuthContext';
import { AuthWrapper } from './components/AuthWrapper';
import { Toaster } from 'sonner';
import { SubscriptionProvider } from './context/SubscriptionContext';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="taiyaki-theme">
      <AuthProvider>
        <SubscriptionProvider>
          <AuthWrapper>
            <App />
            <Toaster position="top-right" />
          </AuthWrapper>
        </SubscriptionProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
