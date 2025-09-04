
'use client';
import { useState, useEffect } from 'react';
import Login from '../components/Login';
import Chat from '../components/Chat';

export default function Home() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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
          if (payload.exp && payload.exp > Date.now()) {
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
    <Chat user={user} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}
