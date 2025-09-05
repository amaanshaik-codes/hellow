'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ExitIcon } from '@radix-ui/react-icons';
import ThemeToggle from './ThemeToggle';
import SSEManager from '../lib/sseManager';

export default function Chat({ user, onLogout }) {
  // Core state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [receipts, setReceipts] = useState({});
  const [unreadIds, setUnreadIds] = useState(new Set());
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  
  // Real-time state
  const [isOnline, setIsOnline] = useState(true);
  const [peerPresence, setPeerPresence] = useState({ status: 'offline', lastSeen: null });
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [connectionQuality, setConnectionQuality] = useState('good');
  
  // UI state
  const [editing, setEditing] = useState({ id: null, text: '' });
  const [replyTo, setReplyTo] = useState(null);
  const [context, setContext] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  
  // SSE Manager
  const sseManagerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  // Refs
  const textareaRef = useRef(null);
  const viewportRef = useRef(null);
  const chatBottom = useRef(null);

  // Initialize SSE Manager
  useEffect(() => {
    const roomId = process.env.NEXT_PUBLIC_WS_ROOM || 'ammu-vero-private-room';
    
    console.log(`🚀 [Chat] Initializing SSE Manager for ${user.username}`);
    
    // Create SSE manager with advanced configuration
    sseManagerRef.current = new SSEManager(user.username, roomId, {
      maxReconnectAttempts: 15,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatTimeout: 60000,
      messageTimeout: 10000,
      bufferSize: 200
    });
    
    // Set up message handler
    sseManagerRef.current.setMessageHandler((newMessages) => {
      console.log(`📨 [Chat] Received ${newMessages.length} new messages via SSE`);
      
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const messagesToAdd = newMessages.filter(msg => !existingIds.has(msg.id));
        
        if (messagesToAdd.length === 0) return prev;
        
        const updated = [...prev, ...messagesToAdd].sort((a, b) => a.timestamp - b.timestamp);
        
        // Mark new messages as unread if from other user
        const otherUserMessages = messagesToAdd.filter(msg => msg.username !== user.username);
        if (otherUserMessages.length > 0) {
          setUnreadIds(prevUnread => {
            const newUnreadIds = new Set(prevUnread);
            otherUserMessages.forEach(msg => newUnreadIds.add(msg.id));
            return newUnreadIds;
          });
          
          if (!firstUnreadId && otherUserMessages.length > 0) {
            setFirstUnreadId(otherUserMessages[0].id);
          }
        }
        
        return updated;
      });
      
      // Auto-scroll to bottom
      setTimeout(() => {
        chatBottom.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
    
    // Set up presence handler
    sseManagerRef.current.setPresenceHandler((presenceData) => {
      console.log(`👥 [Chat] Presence update:`, presenceData);
      
      if (presenceData.presence) {
        // Update peer presence based on other user
        const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
        const otherUserPresence = presenceData.presence[otherUser];
        
        if (otherUserPresence) {
          setPeerPresence({
            status: otherUserPresence.status,
            lastSeen: otherUserPresence.lastSeen,
            lastActive: otherUserPresence.lastActive
          });
        }
      }
    });
    
    // Set up typing handler
    sseManagerRef.current.setTypingHandler((typingData) => {
      console.log(`⌨️ [Chat] Typing update:`, typingData);
      
      if (typingData.username !== user.username) {
        setIsTyping(typingData.isTyping);
        
        // Auto-clear typing indicator after 4 seconds
        if (typingData.isTyping) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 4000);
        }
      }
    });
    
    // Set up connection handler
    sseManagerRef.current.setConnectionHandler((statusInfo) => {
      console.log(`🔄 [Chat] Connection status:`, statusInfo);
      
      setConnectionStatus(statusInfo.isConnected ? 'connected' : 
                         statusInfo.status === 'error' ? 'error' :
                         statusInfo.status === 'timeout' ? 'timeout' :
                         statusInfo.status === 'failed' ? 'failed' : 'disconnected');
      
      setConnectionQuality(statusInfo.quality);
      setIsOnline(statusInfo.isConnected);
    });
    
    // Load initial message history
    loadInitialMessages();
    
    // Cleanup on unmount
    return () => {
      if (sseManagerRef.current) {
        sseManagerRef.current.destroy();
      }
      clearTimeout(typingTimeoutRef.current);
    };
  }, [user.username]);

  // Load initial message history
  const loadInitialMessages = async () => {
    try {
      const history = await sseManagerRef.current?.getMessageHistory(100);
      
      if (history && history.length > 0) {
        console.log(`📚 [Chat] Loaded ${history.length} historical messages`);
        setMessages(history);
        
        // Mark messages from other user as unread based on last read time
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
    } catch (error) {
      console.error('❌ [Chat] Failed to load initial messages:', error);
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
    if (sseManagerRef.current) {
      sseManagerRef.current.sendTyping(true);
    }
    
    // Clear typing indicator after 3 seconds of no typing
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      if (sseManagerRef.current) {
        sseManagerRef.current.sendTyping(false);
      }
    }, 3000);
  }, []);

  // Message sending with SSE
  const sendMessage = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim() || !sseManagerRef.current) return;

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: input.trim(),
      username: user.username,
      timestamp: Date.now(),
      replyTo: replyTo
    };

    console.log(`💬 [Chat] Sending message via SSE:`, newMessage.text);

    // Clear input immediately for better UX
    setInput('');
    setReplyTo(null);
    
    // Add to local state immediately (optimistic update)
    setMessages(prev => [...prev, newMessage]);
    
    // Send via SSE Manager
    try {
      const result = await sseManagerRef.current.sendMessage(newMessage);
      
      if (result.success) {
        console.log(`✅ [Chat] Message sent successfully`);
        
        // Set up delivery tracking
        sseManagerRef.current.onMessageDelivery(newMessage.id, (status) => {
          console.log(`📬 [Chat] Message ${newMessage.id} delivery status: ${status}`);
          setReceipts(prev => ({ ...prev, [newMessage.id]: status }));
        });
      } else {
        console.error(`❌ [Chat] Failed to send message:`, result.error);
        
        // Mark message as failed in UI
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id ? { ...msg, failed: true } : msg
        ));
      }
    } catch (error) {
      console.error(`❌ [Chat] Message send error:`, error);
      
      // Mark message as failed
      setMessages(prev => prev.map(msg => 
        msg.id === newMessage.id ? { ...msg, failed: true } : msg
      ));
    }
    
    // Mark messages as read for current user
    const lastReadKey = `hellow_last_read_${user.username}`;
    localStorage.setItem(lastReadKey, Date.now().toString());
    
    // Scroll to bottom
    setTimeout(() => {
      chatBottom.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [input, user.username, replyTo]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async () => {
    setUnreadIds(new Set());
    setFirstUnreadId(null);
    
    const lastReadKey = `hellow_last_read_${user.username}`;
    const currentTime = Date.now();
    localStorage.setItem(lastReadKey, currentTime.toString());
    
    // **NOTIFICATION FIX**: Call API to mark messages as read and update read receipts
    try {
      const roomId = process.env.NEXT_PUBLIC_WS_ROOM || 'ammu-vero-private-room';
      
      // Get token for authentication
      const token = localStorage.getItem('hellow_token');
      if (!token) return;
      
      // Mark all messages as read by updating last read time
      const response = await fetch('/api/messages/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: roomId,
          lastReadTime: currentTime,
          markAllAsRead: true
        })
      });
      
      if (response.ok) {
        console.log(`✅ [Chat] Marked all messages as read for ${user.username}`);
        
        // **NOTIFICATION CLEAR**: Send SSE notification that messages were read
        if (sseManagerRef.current) {
          // Send read receipt update via SSE
          sseManagerRef.current.sendReadReceipt(roomId, currentTime);
        }
      } else {
        console.warn(`⚠️ [Chat] Failed to mark messages as read via API: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ [Chat] Error marking messages as read:', error);
    }
  }, [user.username]);

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
      const msg = messages.find(m => m.id === editing.id);
      if (msg && msg.username === user.username) {
        const updatedMessage = { ...msg, text: editing.text.trim(), edited: true };
        
        // Update local state
        setMessages(prev => prev.map(m => 
          m.id === editing.id ? updatedMessage : m
        ));
        
        // Send updated message via SSE
        if (sseManagerRef.current) {
          await sseManagerRef.current.sendMessage(updatedMessage);
        }
      }
    }
    setEditing({ id: null, text: '' });
  }, [editing, messages, user.username]);

  const cancelEdit = useCallback(() => {
    setEditing({ id: null, text: '' });
  }, []);

  const handleDelete = useCallback(async (messageId) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg && msg.username === user.username) {
      // Update local state
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  }, [messages, user.username]);

  // Context menu
  const openContext = useCallback((e, messageId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const bubbleElement = e.currentTarget;
    const bubbleRect = bubbleElement.getBoundingClientRect();
    const chatCard = document.querySelector('.chat-card');
    const chatRect = chatCard.getBoundingClientRect();
    
    const relativeX = bubbleRect.left - chatRect.left;
    const relativeY = bubbleRect.top - chatRect.top;
    
    const menuWidth = 110;
    const menuHeight = 120;
    const isUserMessage = bubbleElement.dataset.owner === 'me';
    
    let x, y;
    
    if (isUserMessage) {
      x = relativeX - menuWidth - 10;
      if (x < 10) {
        x = relativeX + bubbleRect.width + 10;
      }
    } else {
      x = relativeX + bubbleRect.width + 10;
      if (x + menuWidth > chatRect.width - 10) {
        x = relativeX - menuWidth - 10;
      }
    }
    
    y = relativeY;
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

  // Mark messages as read when component mounts
  useEffect(() => {
    markMessagesAsRead();
  }, [markMessagesAsRead]);

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

  // Peer info
  const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
  const DEMO_USERS = { ammu: 'Ammu', vero: 'Vero' };
  const displayPeerName = DEMO_USERS[otherUser] || otherUser || 'Connect to start chatting';

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

  // Connection status display
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connected':
        return connectionQuality === 'good' ? 'Connected (SSE)' : 'Connected (Poor Signal)';
      case 'connecting':
        return 'Connecting...';
      case 'error':
      case 'timeout':
        return 'Connection Issues';
      case 'failed':
        return 'Connection Failed';
      default:
        return 'Disconnected';
    }
  };

  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return connectionQuality === 'good' ? 'bg-green-500' : 'bg-yellow-500';
      case 'connecting':
        return 'bg-blue-500';
      case 'error':
      case 'timeout':
        return 'bg-orange-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
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
                <div className={`w-2 h-2 rounded-full ${getConnectionColor()}`} />
                {connectionStatus === 'connected' && peerPresence.status === 'online'
                  ? 'Online'
                  : connectionStatus === 'connected' && peerPresence.status === 'offline'
                    ? `Last seen ${formatLastSeen(peerPresence.lastSeen)}`
                    : getConnectionStatusDisplay()
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
                                        {msg.failed && (
                                          <span className="text-red-500 text-xs ml-1" title="Failed to send">❌</span>
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
                                         receipts[msg.id] === 'delivered' ? 'Delivered' : 
                                         receipts[msg.id] === 'timeout' ? 'Timeout' : 'Sent'}
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

        {/* Context Menu */}
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
