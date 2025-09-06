'use client';

import { useEffect, useRef } from 'react';

// Mobile utility functions and hooks
export const useMobileOptimizations = () => {
  const iosKeyboardRef = useRef(false);

  // iOS-specific keyboard detection
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    iosKeyboardRef.current = isIOS;

    if (isIOS) {
      // Prevent zoom on input focus in iOS
      const handleTouchStart = (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      };

      document.addEventListener('touchstart', handleTouchStart, { passive: false });
      return () => document.removeEventListener('touchstart', handleTouchStart);
    }
  }, []);

  // Auto-resize textarea utility
  const autoResizeTextarea = (textarea) => {
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    const newHeight = Math.max(44, Math.min(120, textarea.scrollHeight));
    textarea.style.height = `${newHeight}px`;
  };

  // Haptic feedback utility
  const triggerHapticFeedback = (type = 'light') => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30],
        success: [10, 50, 10],
        error: [20, 100, 20]
      };
      window.navigator.vibrate(patterns[type] || patterns.light);
    }
  };

  // Smooth scroll to element with mobile-optimized behavior
  const scrollToElement = (element, behavior = 'smooth') => {
    if (!element) return;

    try {
      // For mobile, add a small delay to allow for keyboard animations
      const delay = window.innerWidth <= 800 ? 150 : 0;
      
      setTimeout(() => {
        element.scrollIntoView({
          behavior,
          block: 'nearest',
          inline: 'nearest'
        });
      }, delay);
    } catch (e) {
      console.warn('Scroll failed:', e);
    }
  };

  // Mobile-optimized focus handler
  const handleMobileFocus = (inputElement, viewportElement) => {
    if (window.innerWidth <= 800) {
      setTimeout(() => {
        // Scroll viewport to bottom first
        if (viewportElement) {
          viewportElement.scrollTop = viewportElement.scrollHeight;
        }
        
        // Then ensure input is visible
        scrollToElement(inputElement);
      }, 100);
    }
  };

  return {
    autoResizeTextarea,
    triggerHapticFeedback,
    scrollToElement,
    handleMobileFocus,
    isIOS: iosKeyboardRef.current
  };
};

// CSS-in-JS mobile styles utility
export const getMobileStyles = () => ({
  // Prevent iOS zoom on input focus
  preventZoom: {
    fontSize: '16px',
    WebkitUserSelect: 'text',
    userSelect: 'text',
    WebkitTapHighlightColor: 'transparent'
  },
  
  // Touch-friendly button
  touchButton: {
    minWidth: '44px',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitUserSelect: 'none',
    userSelect: 'none'
  },
  
  // Mobile-optimized scrollable area
  mobileScroll: {
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    scrollBehavior: 'smooth'
  }
});

// Viewport height utility for mobile browsers
export const useViewportHeight = () => {
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);
    
    // Handle iOS Safari address bar resize
    window.addEventListener('scroll', setVH);

    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', setVH);
      window.removeEventListener('scroll', setVH);
    };
  }, []);
};

export default {
  useMobileOptimizations,
  getMobileStyles,
  useViewportHeight
};
