import { useState, useEffect, useRef, useCallback } from 'react';
import PragmaticFastMessaging from '../lib/pragmaticFastMessaging';

export function usePragmaticChat(username, jwtToken) {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLatency, setConnectionLatency] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  // peerPresence holds { isOnline: boolean, lastSeen: number | null }
  const [peerPresence, setPeerPresence] = useState({ isOnline: false, lastSeen: null });
  const [stats, setStats] = useState(null);
  const [receipts, setReceipts] = useState({}); // messageId -> { read }
  
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
      // `data` shape may be: { username, isOnline, timestamp } or { onlineUsers: [...] }
      if (data.username && data.username !== username) { // Only track other user's presence
        const lastSeen = data.timestamp || Date.now();
        setPeerPresence({ isOnline: !!data.isOnline, lastSeen: data.isOnline ? null : lastSeen });
        console.log('👤 [PRAGMATIC] Presence:', data);
      } else if (data.onlineUsers) {
        // Handle room-wide presence updates
        const otherUsers = data.onlineUsers.filter(u => u !== username);
        setPeerPresence({ isOnline: otherUsers.length > 0, lastSeen: otherUsers.length > 0 ? null : Date.now() });
        console.log('👥 [PRAGMATIC] Room presence:', data.onlineUsers);
      }
    });

    // Receipts
    const unsubscribeReceipts = messaging.onReceipt((data) => {
      setReceipts(prev => ({ ...prev, [data.messageId]: { ...prev[data.messageId], read: data.read || Date.now() } }));
      // Patch message inline for convenience
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, readAt: Date.now() } : m));
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
  unsubscribeReceipts();
      clearInterval(statsInterval);
      messaging.disconnect();
      messagingRef.current = null;
    };
  }, [username, jwtToken]);

  // Send message function
  const sendMessage = useCallback(async (text, replyTo = null, messageId = null) => {
    if (!messagingRef.current || !text?.trim()) return;

    // Use provided messageId or generate fallback
    const uniqueId = messageId || `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const tempMessage = {
      id: uniqueId,
      text: text.trim(),
      username,
      timestamp: Date.now(),
      replyTo,
      state: 'pending'
    };

    // Add to UI immediately (optimistic update)
    setMessages(prev => {
      // Check for duplicate message IDs to prevent duplicates
      const exists = prev.find(msg => msg.id === uniqueId);
      if (exists) {
        console.log('🚫 [PRAGMATIC] Duplicate message prevented:', uniqueId);
        return prev;
      }
      return [...prev, tempMessage];
    });

    try {
      console.log('💬 [PRAGMATIC] Sending message:', text, 'ID:', uniqueId);
      const sentMessage = await messagingRef.current.sendMessage(text.trim(), replyTo, uniqueId);
      
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

  const sendReadReceipt = useCallback((message) => {
    if (!messagingRef.current) return;
    messagingRef.current.sendReadReceipt(message);
  }, []);

  return {
    messages,
    isConnected,
    connectionLatency,
    sendMessage,
    sendTyping,
    setPresence,
    isTyping,
  peerPresence,
  stats,
  receipts,
  sendReadReceipt
  };
  // also expose attachPromiseForMessageId for advanced reconciliation
  // (available as messagingRef.current.attachPromiseForMessageId)
}

export default usePragmaticChat;
