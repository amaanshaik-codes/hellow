
'use client';
import { useState, useEffect } from 'react';
import Login from '../components/Login';
import Chat from '../components/Chat';

export default function Home() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Auto-login if valid token exists
  useEffect(() => {
    try {
      const token = localStorage.getItem('hellow_token');
      const username = localStorage.getItem('hellow_user');
      const displayName = localStorage.getItem('hellow_displayName');
      
      if (token && username) {
        // Verify token is not expired (basic check)
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.exp && payload.exp * 1000 > Date.now()) { // JWT exp is in seconds, Date.now() in milliseconds
            setUser({ 
              username, 
              token,
              displayName: displayName || username 
            });
          } else {
            // Token expired, clear storage
            localStorage.removeItem('hellow_token');
            localStorage.removeItem('hellow_user');
            localStorage.removeItem('hellow_displayName');
          }
        } catch (e) {
          // Invalid token format, clear storage
          localStorage.removeItem('hellow_token');
          localStorage.removeItem('hellow_user');
          localStorage.removeItem('hellow_displayName');
        }
      }
    } catch (e) {
      console.warn('Failed to check stored credentials:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = (userData) => {
    try {
      localStorage.setItem('hellow_user', userData.username);
      localStorage.setItem('hellow_token', userData.token);
      if (userData.user?.displayName) {
        localStorage.setItem('hellow_displayName', userData.user.displayName);
      }
      setUser({
        username: userData.username,
        token: userData.token,
        displayName: userData.user?.displayName || userData.username
      });
    } catch (e) {
      console.error('Failed to save credentials:', e);
      setUser(userData); // Continue anyway
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('hellow_token');
      localStorage.removeItem('hellow_user');
      localStorage.removeItem('hellow_displayName');
    } catch (e) {
      console.warn('Failed to clear credentials:', e);
    }
    setUser(null);
  };

  // PWA Install handling
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Check if user previously dismissed the prompt (within last 7 days)
      const lastDismissed = localStorage.getItem('installPromptDismissed');
      if (!lastDismissed || Date.now() - parseInt(lastDismissed) > 7 * 24 * 60 * 60 * 1000) {
        setShowInstallPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => console.log('SW registered'))
          .catch(error => console.log('SW registration failed'));
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    setShowInstallPrompt(false);
  };

  const dismissInstallPrompt = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  };

  // Show loading spinner while checking stored credentials
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-system-background">
        <div className="bg-white-10 backdrop-blur-apple p-8 rounded-apple shadow-apple flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-system-accent border-t-transparent rounded-full animate-spin"></div>
          <div className="text-system-secondaryLabel text-sm">Loading Hellow...</div>
        </div>
      </div>
    );
  }

  return user ? (
    <>
      <Chat user={user} onLogout={handleLogout} />
      
      {/* PWA Install Prompt */}
      {showInstallPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Install Hellow
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
                Install Hellow as an app for a better messaging experience with instant notifications.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={dismissInstallPrompt}
                  className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Not now
                </button>
                <button
                  onClick={handleInstallClick}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
                >
                  Install
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  ) : (
    <Login onLogin={handleLogin} />
  );
}
