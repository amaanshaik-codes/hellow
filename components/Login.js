"use client";
import { useState, useEffect } from 'react';
import * as Avatar from '@radix-ui/react-avatar';
import * as Tooltip from '@radix-ui/react-tooltip';
import { InfoCircledIcon, ArrowLeftIcon } from '@radix-ui/react-icons';

const PROFILES = [
  { username: 'ammu', displayName: 'Ammu', avatar: '💕', bgColor: 'bg-pink-500' },
  { username: 'vero', displayName: 'Vero', avatar: '✨', bgColor: 'bg-purple-500' }
];

export default function Login({ onLogin }) {
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userStats, setUserStats] = useState({});

  // Get user stats (last login, unread count) for each profile
  useEffect(() => {
    const getUserStats = async () => {
      const stats = {};
      
      for (const profile of PROFILES) {
        try {
          const response = await fetch(`/api/stats?username=${profile.username}`);
          if (response.ok) {
            const data = await response.json();
            stats[profile.username] = {
              lastLogin: data.lastLogin,
              unreadCount: data.unreadCount || 0,
              totalMessages: data.totalMessages || 0
            };
          } else {
            stats[profile.username] = {
              lastLogin: null,
              unreadCount: 0,
              totalMessages: 0
            };
          }
        } catch (error) {
          console.error(`Failed to get stats for ${profile.username}:`, error);
          stats[profile.username] = {
            lastLogin: null,
            unreadCount: 0,
            totalMessages: 0
          };
        }
      }
      
      setUserStats(stats);
    };
    
    getUserStats();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedProfile || !password) return;
    
    setError('');
    setIsLoading(true);
    
    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedProfile.username, password })
      });
      
      const data = await resp.json();
      
      if (!resp.ok || !data.success) {
        setError(data.message || 'Login failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // Store credentials
      try { 
        localStorage.setItem('hellow_user', selectedProfile.username); 
        localStorage.setItem('hellow_token', data.token);
        if (data.user?.displayName) {
          localStorage.setItem('hellow_displayName', data.user.displayName);
        }
        
        // Clear stale unread data for this user (they're now viewing the chat)
        localStorage.removeItem(`hellow_unread_${selectedProfile.username}`);
        
        // Update last read time to now (entering chat)
        const lastReadKey = `hellow_last_read_${selectedProfile.username}`;
        localStorage.setItem(lastReadKey, Date.now().toString());
        
      } catch (e) {
        console.warn('Failed to store credentials:', e);
      }

      // Call onLogin with enhanced user data
      onLogin({
        username: selectedProfile.username,
        token: data.token,
        user: data.user
      });

    } catch (err) {
      console.error('Login error:', err);
      setError('Unable to connect. Please check your internet connection.');
      setIsLoading(false);
    }
  }

  function resetSelection() {
    setSelectedProfile(null);
    setPassword('');
    setError('');
  }

  if (!selectedProfile) {
    // Profile Selection Screen
    return (
      <div className="min-h-screen flex items-center justify-center bg-system-background">
        <div className="bg-white-10 backdrop-blur-apple p-8 rounded-apple shadow-apple flex flex-col gap-8 w-full max-w-md" style={{ fontFamily: 'SF Pro Display, San Francisco, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-system-accent flex items-center justify-center shadow-apple">
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white">💬</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-2xl tracking-tight text-system-label">Hellow</div>
              <div className="text-system-secondaryLabel text-base mt-1">Who's this?</div>
            </div>
          </div>
          
          <div className="flex flex-col gap-4">
            {PROFILES.map((profile) => {
              const stats = userStats[profile.username] || {};
              const unreadCount = stats.unreadCount || 0;
              const lastLogin = stats.lastLogin;
              
              return (
                <button
                  key={profile.username}
                  onClick={() => setSelectedProfile(profile)}
                  className="relative flex flex-col items-center justify-center gap-3 p-6 rounded-apple bg-white-10 hover:bg-white-20 transition-all duration-200 border border-white-10 hover:border-system-accent group text-center"
                >
                  {unreadCount > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg z-10">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                  <div className="font-semibold text-xl text-system-label group-hover:text-system-accent transition-colors">
                    {profile.displayName}
                  </div>
                  <div className="text-sm text-system-secondaryLabel">
                    {unreadCount > 0 ? (
                      <span className="text-red-500 font-medium">
                        {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                      </span>
                    ) : lastLogin ? (
                      <span className="text-system-tertiaryLabel">
                        Last login: {new Date(lastLogin).toLocaleDateString()}
                      </span>
                    ) : (
                      'Tap to sign in'
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Password Entry Screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-system-background">
      <form onSubmit={handleSubmit} className="bg-white-10 backdrop-blur-apple p-8 rounded-apple shadow-apple flex flex-col gap-8 w-full max-w-md" style={{ fontFamily: 'SF Pro Display, San Francisco, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
        <div className="flex flex-col items-center gap-6">
          <button
            type="button"
            onClick={resetSelection}
            className="self-start p-3 rounded-full bg-white-10 hover:bg-white-20 transition-colors border border-white-10"
          >
            <ArrowLeftIcon className="w-6 h-6 text-system-label" />
          </button>
          
          <div className="text-center">
            <div className="font-bold text-3xl tracking-tight text-system-label">{selectedProfile.displayName}</div>
            <div className="text-system-secondaryLabel text-base mt-2">Enter your password</div>
          </div>
        </div>
        
        <div className="flex flex-col gap-4">
          <input 
            className="px-4 py-3 rounded-apple bg-system-tertiaryBackground text-system-label placeholder-system-secondaryLabel border border-white-10 focus:border-system-accent focus:ring-2 focus:ring-system-accent/30 focus:outline-none transition text-center" 
            placeholder="Enter password" 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            autoFocus 
          />
        </div>
        
        <div className="flex gap-4">
          <button 
            type="submit" 
            disabled={isLoading || !password}
            className="px-6 py-3 rounded-apple font-semibold text-white bg-system-accent shadow-apple transition hover:bg-system-accent/90 focus:outline-none focus:ring-2 focus:ring-system-accent/50 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </div>
        
        {error && (
          <div className="text-red-500 text-center text-sm bg-red-500/10 px-4 py-2 rounded-apple border border-red-500/20">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
