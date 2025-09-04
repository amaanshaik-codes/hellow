'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ExitIcon } from '@radix-ui/react-icons';
import ThemeToggle from './ThemeToggle';
import WebRTCManager from '../lib/webrtc';

export default function ChatWebRTC({ user, onLogout }) {
  // Core state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peer, setPeer] = useState(null);
  const [receipts, setReceipts] = useState({});
  const [unreadIds, setUnreadIds] = useState(new Set());
  
  // Real-time state
  const [isOnline, setIsOnline] = useState(true);
  const [peerPresence, setPeerPresence] = useState({ 
    status: 'offline', 
    lastSeen: null, 
    direct: false 
  });
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  
  // UI state
  const [editing, setEditing] = useState({ id: null, text: '' });
  const [replyTo, setReplyTo] = useState(null);
  const [context, setContext] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  
  // Refs
  const textareaRef = useRef(null);
  const viewportRef = useRef(null);
  const chatBottom = useRef(null);
  const webrtcManagerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize WebRTC manager
  useEffect(() => {
    const roomId = 'ammu-vero-private-room';
    
    const handleMessage = (messageData) => {
      console.log('📨 Received WebRTC message:', messageData);
      
      // Add message to UI immediately
      setMessages(prev => {
        const exists = prev.find(m => m.id === messageData.id);
        if (exists) return prev;
        
        const newMessage = {
          ...messageData,
          timestamp: messageData.timestamp || Date.now()
        };
        
        return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
      });
      
      // Scroll to bottom
      setTimeout(() => {
        chatBottom.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };
    
    const handlePresenceChange = (presenceData) => {
      console.log('👥 Presence update:', presenceData);
      setPeerPresence(presenceData);
      
      if (presenceData.status === 'online' && presenceData.direct) {
        setConnectionStatus('connected');
      } else if (presenceData.status === 'offline') {
        setConnectionStatus('disconnected');
      }
    };
    
    const handleTyping = (typingData) => {
      console.log('⌨️ Typing update:', typingData);
      setIsTyping(typingData.isTyping);
      
      // Auto-clear typing indicator after 3 seconds
      if (typingData.isTyping) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    };
    
    // Initialize WebRTC manager
    webrtcManagerRef.current = new WebRTCManager(
      user.username,
      roomId,
      handleMessage,
      handlePresenceChange,
      handleTyping
    );
    
    // Load message history
    loadMessageHistory();
    
    // Cleanup on unmount
    return () => {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.destroy();
      }
      clearTimeout(typingTimeoutRef.current);
    };
  }, [user.username]);

  // Load message history from Vercel KV
  const loadMessageHistory = async () => {
    try {
      const response = await fetch('/api/messages/store?fallback=true', {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📚 Loaded ${data.messages.length} messages from history`);
        
        setMessages(data.messages);
        
        // Scroll to bottom after loading
        setTimeout(() => {
          chatBottom.current?.scrollIntoView({ behavior: 'auto' });
        }, 100);
      }
    } catch (error) {
      console.error('❌ Failed to load message history:', error);
    }
  };

  // Send message with WebRTC and fallback
  const sendMessage = async (e) => {
    e.preventDefault();
    
    const text = input.trim();
    if (!text) return;
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      username: user.username,
      timestamp: Date.now(),
      replyTo,
      edited: false
    };
    
    // Clear input immediately for responsive UI
    setInput('');
    setReplyTo(null);
    
    // Add to UI optimistically
    setMessages(prev => [...prev, message]);
    
    // Try WebRTC first
    const sentViaWebRTC = webrtcManagerRef.current?.sendMessage(message);
    
    if (!sentViaWebRTC) {
      // Fallback to server relay
      console.log('📡 Using server fallback for message delivery');
      
      try {
        const response = await fetch('/api/messages/store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`
          },
          body: JSON.stringify({
            text,
            roomId: 'ammu-vero-private-room',
            isDirect: false,
            replyTo
          })
        });
        
        if (response.ok) {
          console.log('✅ Message sent via server fallback');
        } else {
          console.error('❌ Server fallback failed');
          // Remove optimistic message on failure
          setMessages(prev => prev.filter(m => m.id !== message.id));
        }
      } catch (error) {
        console.error('❌ Fallback send error:', error);
        setMessages(prev => prev.filter(m => m.id !== message.id));
      }
    }
    
    // Scroll to bottom
    setTimeout(() => {
      chatBottom.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Handle typing indicators
  const handleTyping = useCallback(() => {
    // Send typing indicator via WebRTC
    webrtcManagerRef.current?.sendTyping(true);
    
    // Clear previous timeout
    clearTimeout(window.typingTimeout);
    
    // Auto-stop typing after 3 seconds
    window.typingTimeout = setTimeout(() => {
      webrtcManagerRef.current?.sendTyping(false);
    }, 3000);
  }, []);

  // Handle input changes
  const handleInputChange = (e) => {
    setInput(e.target.value);
    handleTyping();
  };

  // Handle key presses
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  // Context menu handlers
  const openContext = (e, messageId) => {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    setContext({
      id: messageId,
      x: rect.right + 10,
      y: rect.top
    });
  };

  const closeContext = () => setContext(null);

  // Message editing
  const handleEdit = (messageId) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.username === user.username) {
      setEditing({ id: messageId, text: message.text });
      closeContext();
    }
  };

  const saveEdit = () => {
    if (!editing.id || !editing.text.trim()) return;
    
    setMessages(prev => prev.map(msg => 
      msg.id === editing.id 
        ? { ...msg, text: editing.text.trim(), edited: true }
        : msg
    ));
    
    setEditing({ id: null, text: '' });
  };

  const cancelEdit = () => {
    setEditing({ id: null, text: '' });
  };

  // Message deletion
  const handleDelete = (messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  // Helper functions
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

  // Get peer display name
  const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
  const DEMO_USERS = { ammu: 'Ammu', vero: 'Vero' };
  const displayPeerName = DEMO_USERS[otherUser] || 'Connect to start chatting';

  // Connection status indicator
  const getConnectionIndicator = () => {
    switch (connectionStatus) {
      case 'connecting':
        return { color: 'bg-yellow-500', text: 'Connecting...' };
      case 'connected':
        return { color: 'bg-green-500', text: 'Direct P2P' };
      case 'disconnected':
        return { color: 'bg-orange-500', text: 'Server relay' };
      default:
        return { color: 'bg-gray-400', text: 'Offline' };
    }
  };

  const connectionInfo = getConnectionIndicator();

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
                <div className={`w-2 h-2 rounded-full ${connectionInfo.color}`} />
                {peerPresence.status === 'online' 
                  ? connectionInfo.text
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
        <div className="chat-messages-container">
          <ScrollArea.Root className="chat-messages-scroll">
            <ScrollArea.Viewport ref={viewportRef} className="chat-messages-viewport">
              {messages.map((msg, idx) => {
                const isOwn = msg.username === user.username;
                const bubbleOwnerClass = isOwn ? 'me' : 'peer';
                
                return (
                  <motion.div
                    key={msg.id}
                    className={`message-group ${isOwn ? 'own' : 'peer'}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ 
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                      delay: idx * 0.05
                    }}
                  >
                    <div className="message-content">
                      {msg.replyTo && (() => {
                        const quoted = messages.find(m => m.id === msg.replyTo);
                        return quoted ? (
                          <div className="reply-quote">
                            ↪ {quoted.username}: {quoted.text}
                          </div>
                        ) : null;
                      })()}
                      
                      <div 
                        className={`bubble ${bubbleOwnerClass}`}
                        onContextMenu={e => openContext(e, msg.id)}
                      >
                        {editing.id === msg.id ? (
                          <div className="bubble-edit">
                            <input 
                              autoFocus 
                              className="bubble-edit-input"
                              value={editing.text}
                              onChange={e => setEditing(ed => ({ ...ed, text: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              onBlur={saveEdit}
                            />
                          </div>
                        ) : (
                          <div>
                            {msg.text}
                            {msg.edited && (
                              <span className="text-system-secondaryLabel text-xs ml-2">(edited)</span>
                            )}
                            {msg.isDirect === false && (
                              <span className="text-orange-500 text-xs ml-2">📡</span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="message-meta">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <button onClick={() => { setReplyTo(context.id); closeContext(); }}>
                📩 Reply
              </button>
              {(() => {
                const msg = messages.find(m => m.id === context.id);
                return msg?.username === user.username && (
                  <>
                    <button onClick={() => handleEdit(context.id)}>
                      ✏️ Edit
                    </button>
                    <button onClick={() => { handleDelete(context.id); closeContext(); }}>
                      🗑️ Delete
                    </button>
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
            <div className="reply-preview">
              <div>
                <strong>{quoted.username}</strong>: {quoted.text.slice(0, 120)}
                {quoted.text.length > 120 && '...'}
              </div>
              <button onClick={() => setReplyTo(null)}>×</button>
            </div>
          ) : null;
        })()}

        {/* Typing Indicator */}
        {isTyping && (
          <motion.div 
            className="typing-indicator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div className="typing-dots">
              <motion.div 
                className="typing-dot"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
              />
              <motion.div 
                className="typing-dot"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div 
                className="typing-dot"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
              />
            </div>
            <span>{displayPeerName} is typing...</span>
          </motion.div>
        )}

        {/* Input Bar */}
        <motion.div 
          className="input-bar-wrapper"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <form className="chat-input-form" onSubmit={sendMessage}>
            <textarea
              ref={textareaRef}
              className="chat-text-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your message..."
              rows={1}
            />
            <motion.button 
              type="submit" 
              className="send-btn-modern"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Send
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
