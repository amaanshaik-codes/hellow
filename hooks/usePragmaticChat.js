import { useState, useEffect, useRef, useCallback } from 'react';
import PragmaticFastMessaging from '../lib/pragmaticFastMessaging';

export function usePragmaticChat(username, jwtToken) {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [connectionStats, setConnectionStats] = useState({
    isConnected: false,
    averageLatency: 0,
    pendingMessages: 0
  });
  
  const messagingRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize messaging system
  useEffect(() => {
    if (!username || !jwtToken) return;

    console.log('🚀 Starting Pragmatic Fast Chat...');
    
    const messaging = new PragmaticFastMessaging(username, jwtToken);

    // Message handler
    const unsubscribeMessages = messaging.onMessage((message) => {
      setMessages(prev => {
        // Remove pending version if exists
        const withoutPending = prev.filter(m => m.id !== message.id);
        
        // Add new message
        const newMessages = [...withoutPending, message]
          .sort((a, b) => a.timestamp - b.timestamp);
        
        return newMessages;
      });
    });

    // Typing handler
    const unsubscribeTyping = messaging.onTyping((data) => {
      if (data.username === username) return; // Ignore own typing
      
      setTypingUsers(prev => {
        if (data.isTyping) {
          return prev.includes(data.username) ? prev : [...prev, data.username];
        } else {
          return prev.filter(user => user !== data.username);
        }
      });
    });

    // Presence handler
    const unsubscribePresence = messaging.onPresence((data) => {
      if (data.onlineUsers) {
        setOnlineUsers(data.onlineUsers);
      }
    });

    // Stats monitoring
    const statsInterval = setInterval(() => {
      const stats = messaging.getStats();
      setConnectionStats(stats);
    }, 2000);

    messagingRef.current = messaging;

    return () => {
      console.log('🧹 Cleaning up Pragmatic Chat...');
      unsubscribeMessages();
      unsubscribeTyping();
      unsubscribePresence();
      clearInterval(statsInterval);
      messaging.disconnect();
      messagingRef.current = null;
    };
  }, [username, jwtToken]);

  // Send message
  const sendMessage = useCallback(async (text) => {
    if (!messagingRef.current || !text?.trim()) return null;

    try {
      const message = await messagingRef.current.sendMessage(text.trim());
      return message;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, []);

  // Send typing indicator
  const sendTyping = useCallback((isTyping = true) => {
    if (!messagingRef.current) return;

    messagingRef.current.sendTyping(isTyping);
    
    // Auto-clear typing after 3 seconds
    if (isTyping) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (messagingRef.current) {
          messagingRef.current.sendTyping(false);
        }
      }, 3000);
    }
  }, []);

  // Load message history
  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/messages', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.messages) {
          setMessages(data.messages.sort((a, b) => a.timestamp - b.timestamp));
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, [jwtToken]);

  // Load history on mount
  useEffect(() => {
    if (jwtToken) {
      loadHistory();
    }
  }, [loadHistory, jwtToken]);

  return {
    // Data
    messages,
    typingUsers,
    onlineUsers,
    
    // Actions
    sendMessage,
    sendTyping,
    loadHistory,
    
    // Status
    connectionStats,
    isConnected: connectionStats.isConnected
  };
}

export default usePragmaticChat;
