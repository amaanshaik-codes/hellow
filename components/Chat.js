'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ExitIcon } from '@radix-ui/react-icons';
import ThemeToggle from './ThemeToggle';

export default function Chat({ user, onLogout }) {
  // Core state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peer, setPeer] = useState(null);
  const [presence, setPresence] = useState({});
  const [receipts, setReceipts] = useState({});
  const [unreadIds, setUnreadIds] = useState(new Set());
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  
  // Real-time state
  const [isOnline, setIsOnline] = useState(true);
  const [peerPresence, setPeerPresence] = useState({ status: 'offline', lastSeen: null });
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  
  // UI state
  const [editing, setEditing] = useState({ id: null, text: '' });
  const [replyTo, setReplyTo] = useState(null);
  const [context, setContext] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  
  // Refs for real-time messaging
  const lastMessageTimeRef = useRef(0);
  
  // Refs
  const textareaRef = useRef(null);
  const viewportRef = useRef(null);
  const chatBottom = useRef(null);

  // Load message history and setup real-time messaging
  useEffect(() => {
    // Load existing message history from backend on initial load
    loadMessageHistory(true);
    
    // Set user as online when component mounts
    updatePresence('online');

    // Setup real-time polling using the new instant API
    const realtimeInterval = setInterval(() => {
      checkForNewMessages();
      checkPresenceUpdates(); // Also check for presence updates
    }, 1000); // Check every 1 second for instant feel
    
    // Setup presence heartbeat to keep user online
    const heartbeatInterval = setInterval(() => {
      updatePresence('heartbeat');
    }, 15000); // Update every 15 seconds

    // Set user offline when component unmounts
    return () => {
      clearInterval(realtimeInterval);
      clearInterval(heartbeatInterval);
      updatePresence('offline');
    };
  }, [user.username]); // Add user.username dependency

  // New instant message checking function
  const checkForNewMessages = async () => {
    try {
      const room = 'ammu-vero-private-room';
      const lastTimestamp = lastMessageTimeRef.current;
      console.log(`🔍 [${user.username}] Checking for messages since timestamp: ${lastTimestamp} (${new Date(lastTimestamp).toLocaleString()})`);
      
      const response = await fetch(
        `/api/instant?room=${room}&username=${user.username}&last=${lastTimestamp}`
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📥 [${user.username}] Instant API response:`, data);
        
        if (data.hasNew && data.messages.length > 0) {
          console.log(`⚡ [${user.username}] INSTANT: Got ${data.messages.length} new messages!`);
          
          // Add new messages immediately
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMessages = data.messages.filter(m => !existingIds.has(m.id));
            
            if (newMessages.length > 0) {
              console.log(`➕ [${user.username}] Adding messages:`, newMessages.map(m => `${m.username}: ${m.text}`));
              return [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
            }
            return prev;
          });
          
          // Update timestamp for both state and ref
          setLastMessageTime(data.latestTimestamp);
          lastMessageTimeRef.current = data.latestTimestamp;
          console.log(`📅 [${user.username}] Updated lastMessageTime to: ${data.latestTimestamp}`);
        }
      } else {
        console.error(`❌ [${user.username}] Instant API error: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Instant check error:', error);
    }
  };

  // Check for presence updates and typing indicators
  const checkPresenceUpdates = async () => {
    try {
      const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
      
      // Check presence
      const presenceResponse = await fetch(`/api/presence?username=${otherUser}`);
      if (presenceResponse.ok) {
        const presenceData = await presenceResponse.json();
        setPeerPresence({
          status: presenceData.status || 'offline',
          lastSeen: presenceData.lastSeen
        });
      }
      
      // Check typing status
      const typingResponse = await fetch(`/api/typing?username=${user.username}`);
      if (typingResponse.ok) {
        const typingData = await typingResponse.json();
        setIsTyping(typingData.isTyping || false);
      }
    } catch (error) {
      console.error('❌ Presence/Typing check error:', error);
    }
  };

  // Load message history from backend
  const loadMessageHistory = async (isInitialLoad = false) => {
    try {
      const room = 'ammu-vero-private-room';
      console.log('Loading messages from room:', room);
      const response = await fetch(`/api/history/${room}`);
      
      console.log('Response status:', response.status);
      if (response.ok) {
        const history = await response.json();
        console.log('Loaded messages:', history);
        
        if (isInitialLoad) {
          // On initial load, set messages directly
          setMessages(history);
          
          // Set lastMessageTime to the latest message timestamp to avoid re-fetching
          if (history.length > 0) {
            const latestTimestamp = Math.max(...history.map(m => m.timestamp));
            setLastMessageTime(latestTimestamp);
            lastMessageTimeRef.current = latestTimestamp;
            console.log('📅 Set lastMessageTime to:', new Date(latestTimestamp).toLocaleString());
          }
        } else {
          // On manual refresh, merge with existing messages (don't overwrite)
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMessages = history.filter(m => !existingIds.has(m.id));
            
            if (newMessages.length > 0) {
              console.log(`🔄 Manual refresh found ${newMessages.length} new messages`);
              return [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
            } else {
              console.log('🔄 Manual refresh: No new messages found, keeping existing messages');
              return prev; // Keep existing messages
            }
          });
        }
        
        // Mark messages from other user as unread if this is first load
        if (isInitialLoad) {
          const lastReadKey = `hellow_last_read_${user.username}`;
          const lastRead = localStorage.getItem(lastReadKey);
          const lastReadTime = lastRead ? parseInt(lastRead) : 0;
          
          const otherUserMessages = history.filter(msg => 
            msg.username !== user.username && 
            msg.timestamp > lastReadTime
          );
          
          if (otherUserMessages.length > 0) {
            const unreadIds = new Set(otherUserMessages.map(msg => msg.id));
            setUnreadIds(unreadIds);
            setFirstUnreadId(otherUserMessages[0].id);
          }
          
          // Mark as read when entering chat
          localStorage.setItem(lastReadKey, Date.now().toString());
        }
      } else {
        console.error('Failed to load messages:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to load message history:', error);
    }
  };

  // Update user presence (online/offline/heartbeat)
  const updatePresence = async (action) => {
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          action,
          lastSeen: new Date().toISOString()
        })
      });
      
      if (action === 'online') {
        setIsOnline(true);
        console.log(`🟢 ${user.username} is now online`);
      } else if (action === 'offline') {
        setIsOnline(false);
        console.log(`🔴 ${user.username} went offline`);
      }
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  };

  // Poll for real-time updates (new messages + presence)
  // Save message to backend
  const saveMessageToBackend = async (message) => {
    try {
      const room = 'ammu-vero-private-room'; // Use fixed room name for now
      console.log('Saving message to room:', room, message);
      const response = await fetch(`/api/history/${room}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
      });
      
      console.log('Save response status:', response.status);
      if (!response.ok) {
        console.error('Failed to save message to backend:', response.status, response.statusText);
        const errorData = await response.text();
        console.error('Error details:', errorData);
      } else {
        const result = await response.json();
        console.log('Message saved successfully:', result);
      }
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  // Auto-scroll
  useEffect(() => {
    if (chatBottom.current) {
      chatBottom.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Keyboard handling
  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  }, [input]);

  // Handle typing indicators
  const handleTyping = useCallback(() => {
    // Send typing indicator to other user
    const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        targetUser: otherUser,
        isTyping: true
      })
    }).catch(err => console.error('Typing indicator error:', err));
    
    // Clear typing indicator after 3 seconds of no typing
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          targetUser: otherUser,
          isTyping: false
        })
      }).catch(err => console.error('Typing stop error:', err));
    }, 3000);
  }, [user.username]);

  // Message sending with backend persistence
  const sendMessage = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`, // More unique ID
      text: input.trim(),
      username: user.username,
      timestamp: Date.now(),
      replyTo: replyTo
    };

    console.log(`💬 [${user.username}] Sending message with timestamp:`, newMessage.timestamp, `(${new Date(newMessage.timestamp).toLocaleString()})`);

    // Clear input immediately for better UX
    setInput('');
    setReplyTo(null);
    
    // Add to local state immediately
    setMessages(prev => [...prev, newMessage]);
    
    // Update lastMessageTime to this message's timestamp to avoid re-fetching it
    setLastMessageTime(newMessage.timestamp);
    lastMessageTimeRef.current = newMessage.timestamp;
    console.log(`📅 [${user.username}] Updated lastMessageTime to sent message timestamp: ${newMessage.timestamp}`);
    
    // Save to backend in background (don't block UI)
    saveMessageToBackend(newMessage).catch(error => {
      console.error('Failed to save message to backend:', error);
      // Note: We keep the message in UI even if backend save fails
    });
    
    // Update unread count for other user
    updateUnreadCount();
    
    // Mark last read time for current user
    const lastReadKey = `hellow_last_read_${user.username}`;
    localStorage.setItem(lastReadKey, Date.now().toString());
  }, [input, user.username, replyTo]);

  // Update unread count for the other user
  const updateUnreadCount = () => {
    const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
    const currentUnread = JSON.parse(localStorage.getItem(`hellow_unread_${otherUser}`) || '[]');
    const newUnreadId = Date.now().toString();
    const updatedUnread = [...currentUnread, newUnreadId];
    localStorage.setItem(`hellow_unread_${otherUser}`, JSON.stringify(updatedUnread));
  };

  // Mark messages as read
  const markMessagesAsRead = () => {
    setUnreadIds(new Set());
    setFirstUnreadId(null);
    
    const lastReadKey = `hellow_last_read_${user.username}`;
    localStorage.setItem(lastReadKey, Date.now().toString());
    
    // Clear unread count for current user
    localStorage.removeItem(`hellow_unread_${user.username}`);
  };

  // Manual refresh only - no auto-refresh to prevent message loss
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     console.log('Auto-refreshing messages...');
  //     loadMessageHistory();
  //   }, 30000);
  //   
  //   return () => clearInterval(interval);
  // }, []);

  // Mark messages as read when component mounts
  useEffect(() => {
    markMessagesAsRead();
  }, []);

  // Message actions
  const handleEdit = useCallback((messageId) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg && msg.username === user.username) {
      setEditing({ id: messageId, text: msg.text });
    }
    setContext(null);
  }, [messages, user.username]);

  const saveEdit = useCallback(async () => {
    if (editing.id && editing.text.trim()) {
      // Double-check that user can only edit their own messages
      const msg = messages.find(m => m.id === editing.id);
      if (msg && msg.username === user.username) {
        const updatedMessage = { ...msg, text: editing.text.trim(), edited: true };
        
        // Update local state
        setMessages(prev => prev.map(m => 
          m.id === editing.id ? updatedMessage : m
        ));
        
        // Save to backend
        await saveMessageToBackend(updatedMessage);
      }
    }
    setEditing({ id: null, text: '' });
  }, [editing, messages, user.username]);

  const cancelEdit = useCallback(() => {
    setEditing({ id: null, text: '' });
  }, []);

  const handleDelete = useCallback(async (messageId) => {
    // Only allow users to delete their own messages
    const msg = messages.find(m => m.id === messageId);
    if (msg && msg.username === user.username) {
      // Update local state
      setMessages(prev => prev.filter(m => m.id !== messageId));
      
      // Note: For now, just remove from local state
      // Backend deletion would require additional API endpoint
    }
  }, [messages, user.username]);

  // Context menu positioned next to clicked bubble
  const openContext = useCallback((e, messageId) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get the bubble element that was right-clicked
    const bubbleElement = e.currentTarget;
    const bubbleRect = bubbleElement.getBoundingClientRect();
    const chatCard = document.querySelector('.chat-card');
    const chatRect = chatCard.getBoundingClientRect();
    
    // Convert to relative positioning within chat card
    const relativeX = bubbleRect.left - chatRect.left;
    const relativeY = bubbleRect.top - chatRect.top;
    
    // Context menu dimensions
    const menuWidth = 110;
    const menuHeight = 120;
    
    // Determine if this is user's message (right side) or peer's message (left side)
    const isUserMessage = bubbleElement.dataset.owner === 'me';
    
    let x, y;
    
    if (isUserMessage) {
      // User's messages (right side) - place menu to the left of bubble
      x = relativeX - menuWidth - 10;
      // If goes off left edge, place to the right
      if (x < 10) {
        x = relativeX + bubbleRect.width + 10;
      }
    } else {
      // Peer's messages (left side) - place menu to the right of bubble
      x = relativeX + bubbleRect.width + 10;
      // If goes off right edge, place to the left
      if (x + menuWidth > chatRect.width - 10) {
        x = relativeX - menuWidth - 10;
      }
    }
    
    // Position vertically aligned with bubble top
    y = relativeY;
    
    // Keep menu within chat bounds vertically
    if (y + menuHeight > chatRect.height - 10) {
      y = chatRect.height - menuHeight - 10;
    }
    if (y < 10) {
      y = 10;
    }
    
    setContext({
      id: messageId,
      x: Math.round(x),
      y: Math.round(y)
    });
  }, []);

  const closeContext = useCallback(() => {
    setContext(null);
  }, []);

  // Info modal
  const openInfo = useCallback((messageId) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      setInfoMsg(msg);
    }
  }, [messages]);

  const closeInfo = useCallback(() => {
    setInfoMsg(null);
  }, []);

  // Message grouping
  const sequenceInfo = useCallback((items, index) => {
    const current = items[index];
    const prev = items[index - 1];
    const next = items[index + 1];
    
    const samePrevUser = prev && prev.username === current.username;
    const sameNextUser = next && next.username === current.username;
    
    let position = 'single';
    if (samePrevUser && sameNextUser) position = 'middle';
    else if (samePrevUser) position = 'last';
    else if (sameNextUser) position = 'first';
    
    return { position, samePrev: samePrevUser };
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = () => {
      setContext(null);
    };
    
    if (context) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [context]);

  // Computed values
  const grouped = useMemo(() => {
    const groups = [];
    messages.forEach(msg => {
      const d = new Date(msg.timestamp);
      const label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: '2-digit', 
        month: 'short'
      });
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) {
        groups.push({ label, items: [msg] });
      } else {
        last.items.push(msg);
      }
    });
    return groups;
  }, [messages]);

  const peerName = useMemo(() => {
    const others = Object.keys(presence || {}).filter(u => 
      u !== user.username && presence[u]?.online
    );
    if (others.length >= 1) return others[0];
    
    const otherMsg = messages.find(m => 
      m.username && m.username !== user.username
    );
    if (otherMsg) return otherMsg.username;
    
    return null;
  }, [presence, messages, user.username]);

  // Demo user mapping
  const DEMO_USERS = { ammu: 'Ammu', vero: 'Vero' };
  const _uname = (user.username || '').toLowerCase().trim();
  const otherDemoUser = _uname === 'ammu' ? 'vero' : _uname === 'vero' ? 'ammu' : null;
  const defaultPeerName = otherDemoUser;
  const defaultPeerDisplay = otherDemoUser ? DEMO_USERS[otherDemoUser] : null;
  const displayPeer = peerName || defaultPeerName;
  const displayPeerName = peerName || defaultPeerDisplay || 'Connect to start chatting';
  const isPeerOnline = !!(displayPeer && presence[displayPeer] && presence[displayPeer].online);

  // Helper function to format last seen time
  const formatLastSeen = (lastSeenTime) => {
    if (!lastSeenTime) return 'some time ago';
    
    const now = new Date();
    const lastSeen = new Date(lastSeenTime);
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return lastSeen.toLocaleDateString();
  };

  return (
    <motion.div 
      className="chat-wrapper-centered bg-system-background" 
      style={{ minHeight: '100vh' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div 
        className="chat-card"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ 
          type: 'spring',
          stiffness: 200,
          damping: 20,
          mass: 1,
          delay: 0.1
        }}
      >
        {/* Header */}
        <motion.div 
          className="chat-header-card"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <div className="flex items-center gap-4">
            <div>
              <div className="font-bold text-lg text-system-label">
                {displayPeerName}
              </div>
              <div className="text-system-secondaryLabel text-sm flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  peerPresence.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                {peerPresence.status === 'online' 
                  ? 'Online' 
                  : peerPresence.lastSeen 
                    ? `Last seen ${formatLastSeen(peerPresence.lastSeen)}`
                    : 'Offline'
                }
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <ThemeToggle />
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button 
                  onClick={onLogout} 
                  className="bg-transparent border-none cursor-pointer" 
                  aria-label="Logout"
                >
                  <ExitIcon className="text-system-accent w-6 h-6" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content 
                side="top" 
                className="px-3 py-2 rounded-apple bg-system-background text-system-label shadow-apple"
              >
                Logout
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
        </motion.div>

        {/* Messages */}
        <div className="messages-column">
          <ScrollArea.Root className="h-full">
            <ScrollArea.Viewport ref={viewportRef} style={{ minHeight: '100%' }}>
              {grouped.map(g => (
                <div key={g.label}>
                  <div className="date-sep">{g.label}</div>
                  {g.items.map((msg, idx) => {
                    const { position, samePrev } = sequenceInfo(g.items, idx);
                    const showHeader = position === 'single' || position === 'first';
                    const bubbleOwnerClass = msg.username === user.username ? 'me' : 'peer';
                    const seqClass = `seq-${position}`;
                    const unread = unreadIds.has(msg.id) && msg.username !== user.username;
                    
                    return (
                      <AnimatePresence mode="popLayout" key={msg.id}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 0 }}
                          transition={{ 
                            type: 'spring', 
                            stiffness: 300, 
                            damping: 25, 
                            mass: 0.8,
                            delay: idx * 0.05 
                          }}
                        >
                          <div 
                            className={`msg-row ${msg.username === user.username ? 'me' : ''}`}
                            style={{ width: '100%', marginTop: samePrev ? 2 : 10 }}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: msg.username === user.username ? 'flex-end' : 'flex-start',
                              width: '100%'
                            }}>
                              <div style={{
                                display: 'inline-flex',
                                flexDirection: 'column',
                                alignItems: msg.username === user.username ? 'flex-end' : 'flex-start',
                                gap: 4
                              }}>
                                {firstUnreadId && msg.id === firstUnreadId && (
                                  <div className="unread-sep">Unread</div>
                                )}
                                {showHeader && (
                                  <div className="msg-row-meta">
                                    <div className="msg-meta">{msg.username}</div>
                                    <div className="msg-ts">
                                      {new Date(msg.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div 
                                  data-mid={msg.id}
                                  data-owner={msg.username === user.username ? 'me' : 'peer'}
                                  className={`bubble ${bubbleOwnerClass} ${seqClass} ${unread ? 'unread' : ''} ${msg.username === user.username ? 'me' : 'peer'}`}
                                  style={{ 
                                    cursor: 'context-menu',
                                    animationDelay: `${idx * 0.05}s`
                                  }}
                                  onContextMenu={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openContext(e, msg.id);
                                  }}
                                >
                                  {editing.id === msg.id ? (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <input 
                                        autoFocus 
                                        className="bubble-edit-input"
                                        value={editing.text}
                                        onChange={e => setEditing(ed => ({ ...ed, text: e.target.value }))}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') saveEdit();
                                          if (e.key === 'Escape') cancelEdit();
                                        }}
                                        onBlur={() => saveEdit()}
                                      />
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button 
                                          className="msg-action-btn" 
                                          onMouseDown={e => { e.preventDefault(); saveEdit(); }}
                                        >
                                          OK
                                        </button>
                                        <button 
                                          className="msg-action-btn" 
                                          onMouseDown={e => { e.preventDefault(); cancelEdit(); }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      {msg.replyTo && (() => {
                                        const quoted = messages.find(m => m.id === msg.replyTo);
                                        return quoted ? (
                                          <div className="reply-quote">
                                            ↪ {quoted.username}: {quoted.text}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div>
                                        {msg.text} 
                                        {msg.edited && (
                                          <span className="text-system-secondaryLabel text-xs">(edited)</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {(position === 'last' || position === 'single') && (
                                  <div className="msg-row-meta" style={{ marginTop: 2 }}>
                                    {msg.username === user.username && (
                                      <div className="msg-delivery">
                                        {receipts[msg.id] === 'read' ? 'Read' :
                                         receipts[msg.id] === 'delivered' ? 'Delivered' : 'Sent'}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    );
                  })}
                </div>
              ))}
              <div ref={chatBottom} />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        {/* Context Menu Next to Clicked Bubble */}
        {context && (
          <motion.div 
            className="context-menu-overlay"
            onClick={closeContext}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div 
              className="context-menu"
              style={{
                position: 'absolute',
                left: `${context.x}px`,
                top: `${context.y}px`,
                zIndex: 1001
              }}
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -8 }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25,
                duration: 0.2 
              }}
            >
              {(() => {
                const msg = messages.find(m => m.id === context.id);
                const isOwnMessage = msg?.username === user.username;
                
                return (
                  <>
                    {/* Reply - Available for all messages */}
                    <motion.button 
                      onClick={() => {
                        setReplyTo(context.id);
                        closeContext();
                        setTimeout(() => {
                          const el = document.getElementById('chat-input');
                          el && el.focus();
                        }, 50);
                      }}
                      whileHover={{ x: 2, backgroundColor: 'var(--white-10)' }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                    >
                      📩 Reply
                    </motion.button>

                    {/* Edit - Only available for own messages */}
                    {isOwnMessage && (
                      <motion.button 
                        onClick={() => handleEdit(context.id)}
                        whileHover={{ x: 2, backgroundColor: 'var(--white-10)' }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                      >
                        ✏️ Edit
                      </motion.button>
                    )}

                    {/* Delete - Only available for own messages */}
                    {isOwnMessage && (
                      <motion.button 
                        onClick={() => { handleDelete(context.id); closeContext(); }} 
                        className="text-red-500"
                        whileHover={{ x: 2, backgroundColor: 'rgba(255, 59, 48, 0.1)' }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                      >
                        🗑️ Delete
                      </motion.button>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}

        {/* Reply Preview */}
        {replyTo && (() => {
          const quoted = messages.find(m => m.id === replyTo);
          return quoted ? (
            <div className="reply-preview px-8 py-3 border-t border-white-06 bg-white-03 flex items-center justify-between">
              <div style={{ fontSize: 13 }}>
                <strong>{quoted.username}</strong>: {quoted.text.length > 120 ? quoted.text.slice(0, 120) + '…' : quoted.text}
              </div>
              <button onClick={() => setReplyTo(null)} className="text-system-secondaryLabel">
                ×
              </button>
            </div>
          ) : null;
        })()}

        {/* Typing Indicator */}
        {isTyping && (
          <motion.div 
            className="typing-indicator px-8 py-2 text-sm text-system-secondaryLabel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <motion.div 
                  className="w-2 h-2 bg-system-secondaryLabel rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                />
                <motion.div 
                  className="w-2 h-2 bg-system-secondaryLabel rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                />
                <motion.div 
                  className="w-2 h-2 bg-system-secondaryLabel rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                />
              </div>
              <span>{displayPeerName} is typing...</span>
            </div>
          </motion.div>
        )}

        {/* Input Bar */}
        <motion.div 
          className="input-bar-wrapper"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <motion.form 
            className="flex items-center gap-4 chat-input-bar" 
            onSubmit={sendMessage}
            whileFocusWithin={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <textarea
              ref={textareaRef}
              id="chat-input"
              className="chat-text-input flex-1"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleTyping();
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your message..."
            />
            <motion.button 
              type="submit" 
              className="send-btn-modern"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              Send
            </motion.button>
          </motion.form>
        </motion.div>

        {/* Info Modal */}
        {infoMsg && (
          <div className="info-overlay" onClick={closeInfo}>
            <div className="info-card" onClick={e => e.stopPropagation()}>
              <div className="info-header">Message Info</div>
              <div className="info-body">
                <p><strong>Sender:</strong> {infoMsg.username}</p>
                <p><strong>Time:</strong> {new Date(infoMsg.timestamp).toLocaleString()}</p>
                <p><strong>ID:</strong> {infoMsg.id}</p>
                {infoMsg.edited && <p><em>Edited</em></p>}
              </div>
              <div className="info-footer">
                <button onClick={closeInfo} className="msg-action-btn">Close</button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
