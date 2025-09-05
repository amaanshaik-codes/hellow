import { useState, useEffect, useRef, useCallback } from 'react';
import UltraFastMessaging from '../lib/ultraFastMessaging';

export function useUltraFastChat(username, jwtToken) {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [latencyStats, setLatencyStats] = useState({});
  
  const messagingRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize ultra-fast messaging
  useEffect(() => {
    if (!username || !jwtToken) return;

    console.log('🚀 Initializing Ultra-Fast Chat...');
    
    const messaging = new UltraFastMessaging(username, {
      room: 'ammu-vero-private-room',
      jwtToken
    });

    // Set up message handler
    const unsubscribeMessages = messaging.onMessage((message) => {
      console.log('📨 Received message:', message);
      
      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.id === message.id)) {
          return prev;
        }
        
        // Add new message
        const newMessages = [...prev, message].sort((a, b) => a.timestamp - b.timestamp);
        return newMessages;
      });
    });

    // Set up typing handler
    const unsubscribeTyping = messaging.onTyping((typingData) => {
      console.log('⌨️ Typing update:', typingData);
      
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        
        if (typingData.isTyping && typingData.username !== username) {
          newSet.add(typingData.username);
        } else {
          newSet.delete(typingData.username);
        }
        
        return newSet;
      });
    });

    // Set up presence handler
    const unsubscribePresence = messaging.onPresence((presenceData) => {
      console.log('👤 Presence update:', presenceData);
      
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        
        if (presenceData.online) {
          newSet.add(presenceData.username);
        } else {
          newSet.delete(presenceData.username);
        }
        
        return newSet;
      });
    });

    // Monitor connection status
    const statusInterval = setInterval(() => {
      const stats = messaging.getPerformanceStats();
      setLatencyStats(stats);
      
      // Determine connection status
      if (messaging.dataChannel?.readyState === 'open') {
        setConnectionStatus('webrtc');
      } else if (messaging.connections.websocket?.readyState === WebSocket.OPEN) {
        setConnectionStatus('websocket');
      } else {
        setConnectionStatus('polling');
      }
    }, 1000);

    messagingRef.current = messaging;

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up Ultra-Fast Chat...');
      unsubscribeMessages();
      unsubscribeTyping();
      unsubscribePresence();
      clearInterval(statusInterval);
      messaging.disconnect();
      messagingRef.current = null;
    };
  }, [username, jwtToken]);

  // Send message function
  const sendMessage = useCallback(async (text) => {
    if (!messagingRef.current || !text.trim()) return null;

    try {
      const message = await messagingRef.current.sendMessage(text.trim());
      console.log('📤 Message sent:', message);
      
      // Optimistically add to local state
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) {
          return prev;
        }
        return [...prev, message].sort((a, b) => a.timestamp - b.timestamp);
      });
      
      return message;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
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
      console.error('❌ Failed to load message history:', error);
    }
  }, [jwtToken]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Connection status indicator
  const getConnectionInfo = () => {
    switch (connectionStatus) {
      case 'webrtc':
        return {
          status: 'webrtc',
          label: 'P2P Direct',
          color: 'green',
          latency: latencyStats.webrtc?.avg || 0,
          description: 'Ultra-fast direct connection'
        };
      case 'websocket':
        return {
          status: 'websocket',
          label: 'WebSocket',
          color: 'blue',
          latency: latencyStats.websocket?.avg || 0,
          description: 'Fast server connection'
        };
      case 'polling':
        return {
          status: 'polling',
          label: 'Polling',
          color: 'orange',
          latency: 1000,
          description: 'Slow fallback connection'
        };
      default:
        return {
          status: 'connecting',
          label: 'Connecting',
          color: 'gray',
          latency: 0,
          description: 'Establishing connection'
        };
    }
  };

  return {
    // Data
    messages,
    typingUsers: Array.from(typingUsers),
    onlineUsers: Array.from(onlineUsers),
    
    // Actions
    sendMessage,
    sendTyping,
    loadHistory,
    
    // Status
    connectionInfo: getConnectionInfo(),
    latencyStats,
    isConnected: connectionStatus !== 'connecting'
  };
}

export default useUltraFastChat;
