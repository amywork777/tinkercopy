import React, { useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LoginModal } from '@/components/LoginModal';

interface AuthWrapperProps {
  children: ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [interactionDetected, setInteractionDetected] = useState(false);
  const [blurContent, setBlurContent] = useState(false);

  // Handle initial interaction
  const handleInteraction = async (e: Event) => {
    // Skip if already authenticated or if already handling interaction
    if (isAuthenticated || interactionDetected || isLoading) {
      return;
    }

    // Only proceed if this is a meaningful interaction (not just mouse movement)
    const isClickEvent = e.type === 'click';
    const isKeyEvent = e.type === 'keydown';
    
    if (!isClickEvent && !isKeyEvent) {
      return;
    }

    // Skip if interaction is on a link or an element with data-auth-skip attribute
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'A' || 
      target.hasAttribute('data-auth-skip') ||
      target.closest('[data-auth-skip]')
    ) {
      return;
    }

    setInteractionDetected(true);
    
    // Check authentication status
    const isAuth = await checkAuth();
    
    // If not authenticated, show login modal and apply blur effect
    if (!isAuth) {
      setBlurContent(true);
      // Small delay to allow blur effect to be visible before modal appears
      setTimeout(() => {
        setShowLoginModal(true);
      }, 100);
    }
  };

  useEffect(() => {
    // Reset interaction flag when auth state changes
    setInteractionDetected(isAuthenticated);
    
    // If modal is closed, remove blur effect after a short delay
    if (!showLoginModal && blurContent) {
      setTimeout(() => {
        setBlurContent(false);
      }, 200);
    }
  }, [isAuthenticated, showLoginModal]);

  // Add event listeners for user interaction
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => handleInteraction(e);
    const keyHandler = (e: KeyboardEvent) => handleInteraction(e);
    
    window.addEventListener('click', clickHandler);
    window.addEventListener('keydown', keyHandler);
    
    return () => {
      window.removeEventListener('click', clickHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [isAuthenticated, isLoading, checkAuth]);

  // Handle modal close
  const handleCloseModal = () => {
    setShowLoginModal(false);
  };

  return (
    <div className={`relative transition-all duration-300 ${blurContent ? 'blur-[2px]' : ''}`}>
      {children}
      
      {/* Semi-transparent overlay that appears with the modal */}
      {blurContent && (
        <div 
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 animate-in fade-in duration-300"
          onClick={(e) => e.preventDefault()}
        />
      )}
      
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={handleCloseModal} 
      />
    </div>
  );
} 