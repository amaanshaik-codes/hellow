import { useState, useEffect, useRef, useCallback } from 'react';
import PragmaticFastMessaging from '../lib/pragmaticFastMessaging';

export function usePragmaticChat(username, jwtToken) {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLatency, setConnectionLatency] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [peerStatus, setPeerStatus] = useState('offline');
  const [stats, setStats] = useState(null);
  
  const messagingRef = useRef(null);

  // Initialize messaging system
  useEffect(() => {
    if (!username || !jwtToken) return;

    console.log('🚀 [PRAGMATIC] Starting fast messaging...', { username });
    
    const messaging = new PragmaticFastMessaging(username, jwtToken);

    // Connection status
    const unsubscribeConnection = messaging.onConnectionChange((connected, latency) => {
      setIsConnected(connected);
      setConnectionLatency(latency);
      console.log(`🔗 [PRAGMATIC] Connection: ${connected ? 'Connected' : 'Disconnected'} (${latency}ms)`);
    });

    // New messages
    const unsubscribeMessages = messaging.onMessage((message) => {
      console.log('📨 [PRAGMATIC] New message:', message);
      setMessages(prev => {
        // Remove pending version if exists
        const withoutPending = prev.filter(m => m.id !== message.id);
        
        // Add confirmed message
        return [...withoutPending, message]
          .sort((a, b) => a.timestamp - b.timestamp);
      });
    });

    // Typing indicators
    const unsubscribeTyping = messaging.onTyping((data) => {
      if (data.username !== username) { // Only show other user's typing
        setIsTyping(data.isTyping);
        console.log('⌨️ [PRAGMATIC] Typing:', data);
        
        // Auto-clear typing indicator after 5 seconds
        if (data.isTyping) {
          setTimeout(() => setIsTyping(false), 5000);
        }
      }
    });

    // Presence updates
    const unsubscribePresence = messaging.onPresence((data) => {
      if (data.username !== username) { // Only track other user's presence
        setPeerStatus(data.isOnline ? 'online' : 'offline');
        console.log('👤 [PRAGMATIC] Presence:', data);
      } else if (data.onlineUsers) {
        // Handle room-wide presence updates
        const otherUsers = data.onlineUsers.filter(u => u !== username);
        setPeerStatus(otherUsers.length > 0 ? 'online' : 'offline');
        console.log('👥 [PRAGMATIC] Room presence:', data.onlineUsers);
      }
    });

    // Stats monitoring
    const statsInterval = setInterval(() => {
      const currentStats = messaging.getStats();
      setStats(currentStats);
    }, 5000);

    messagingRef.current = messaging;

    // Cleanup
    return () => {
      console.log('🧹 [PRAGMATIC] Cleaning up...');
      unsubscribeConnection();
      unsubscribeMessages();
      unsubscribeTyping();
      unsubscribePresence();
      clearInterval(statsInterval);
      messaging.disconnect();
      messagingRef.current = null;
    };
  }, [username, jwtToken]);

  // Send message function
  const sendMessage = useCallback(async (text, replyTo = null) => {
    if (!messagingRef.current || !text?.trim()) return;

    const tempMessage = {
      id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: text.trim(),
      username,
      timestamp: Date.now(),
      replyTo,
      state: 'pending'
    };

    // Add to UI immediately (optimistic update)
    setMessages(prev => [...prev, tempMessage]);

    try {
      console.log('💬 [PRAGMATIC] Sending message:', text);
      const sentMessage = await messagingRef.current.sendMessage(text.trim(), replyTo);
      
      // Replace temp message with confirmed one
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? sentMessage : msg
      ));
      
      return sentMessage;
    } catch (error) {
      console.error('❌ [PRAGMATIC] Send failed:', error);
      
      // Mark as failed
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? { ...msg, state: 'failed' } : msg
      ));
      
      throw error;
    }
  }, [username]);

  // Send typing indicator
  const sendTyping = useCallback((isTyping = true) => {
    if (!messagingRef.current) return;
    messagingRef.current.sendTyping(isTyping);
  }, []);

  // Send presence update
  const setPresence = useCallback((isOnline = true) => {
    if (!messagingRef.current) return;
    messagingRef.current.sendPresenceUpdate(isOnline);
  }, []);

  return {
    messages,
    isConnected,
    connectionLatency,
    sendMessage,
    sendTyping,
    setPresence,
    isTyping,
    peerStatus,
    stats
  };
}

export default usePragmaticChat;
