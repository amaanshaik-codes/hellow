'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ExitIcon } from '@radix-ui/react-icons';
import ThemeToggle from './ThemeToggle';
import { usePragmaticChat } from '../hooks/usePragmaticChat';

// UUID generation for message deduplication
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function Chat({ user, onLogout }) {
  // Use the pragmatic messaging hook
  const {
    messages,
    isConnected,
    connectionLatency,
    sendMessage: sendPragmaticMessage,
    sendTyping,
    setPresence,
    isTyping,
    peerStatus,
    peerLastSeen,
    stats
  } = usePragmaticChat(user.username, user.token);

  // UI state
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState({ id: null, text: '' });
  const [replyTo, setReplyTo] = useState(null);
  const [context, setContext] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  
  // Refs
  const textareaRef = useRef(null);
  const viewportRef = useRef(null);
  const chatBottom = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatBottom.current) {
      chatBottom.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle presence - set online when component mounts, offline when unmounts
  useEffect(() => {
    if (setPresence) {
      setPresence(true); // Set online when mounting
      
      // Set offline when unmounting
      return () => {
        setPresence(false);
      };
    }
  }, [setPresence]);

  // Send typing indicator
  const sendTypingIndicator = useCallback(() => {
    if (sendTyping) {
      sendTyping(true);
    }
    
    // Clear existing timeout
    clearTimeout(window.typingTimeout);
    
    // Auto-stop typing after 3 seconds
    window.typingTimeout = setTimeout(() => {
      if (sendTyping) {
        sendTyping(false);
      }
    }, 3000);
  }, [sendTyping]);

  // Send message handler
  const handleSendMessage = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const messageText = input.trim();
    const messageId = generateUUID(); // Generate unique ID for deduplication
    
    setInput(''); // Clear input immediately for better UX
    setReplyTo(null);

    // Stop typing indicator when sending
    if (sendTyping) {
      sendTyping(false);
    }

    try {
      await sendPragmaticMessage(messageText, replyTo, messageId);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Could show error toast here
    }
  }, [input, replyTo, sendPragmaticMessage]);

  // Keyboard handling
  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  }, [handleSendMessage]);

  // Message editing handlers
  const handleEdit = useCallback((messageId) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg && msg.username === user.username) {
      setEditing({ id: messageId, text: msg.text });
    }
    setContext(null);
  }, [messages, user.username]);

  const saveEdit = useCallback(async () => {
    if (editing.id && editing.text.trim()) {
      // For now, just update local state
      // Backend editing would require additional API
      console.log('Edit saved:', editing);
    }
    setEditing({ id: null, text: '' });
  }, [editing]);

  const cancelEdit = useCallback(() => {
    setEditing({ id: null, text: '' });
  }, []);

  // Context menu handlers
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

  // Message grouping for UI
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

  // Helper function to format last seen time
  const formatLastSeen = useCallback((lastSeenTime) => {
    if (!lastSeenTime) return 'some time ago';
    
    const now = Date.now();
    const lastSeen = lastSeenTime;
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(lastSeen).toLocaleDateString();
  }, []);

  // Group messages by date
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

  // Get peer name
  const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
  const DEMO_USERS = { ammu: 'Ammu', vero: 'Vero' };
  const displayPeerName = DEMO_USERS[otherUser] || otherUser;

  // Format connection status
  const formatConnectionStatus = () => {
    if (!isConnected) return 'Connecting...';
    
    const latencyText = connectionLatency > 0 ? ` (${connectionLatency}ms)` : '';
    return `Connected${latencyText}`;
  };

  // Click outside handler for context menu
  useEffect(() => {
    const handleClickOutside = () => {
      setContext(null);
    };
    
    if (context) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [context]);

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
                  isConnected ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
                {formatConnectionStatus()}
                {peerStatus === 'online' 
                  ? ' • Online' 
                  : peerStatus === 'offline' 
                    ? ` • Last seen ${formatLastSeen(peerLastSeen)}`
                    : ''
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
                                  className={`bubble ${bubbleOwnerClass} ${seqClass} ${msg.username === user.username ? 'me' : 'peer'}`}
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
                                        {msg.state === 'confirmed' && (
                                          <span className="text-green-500 text-xs ml-1" title="Message delivered">✓</span>
                                        )}
                                        {msg.state === 'pending' && (
                                          <span className="text-yellow-500 text-xs ml-1" title="Sending...">⏳</span>
                                        )}
                                        {msg.state === 'failed' && (
                                          <span className="text-red-500 text-xs ml-1" title="Failed to send">❌</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
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

              {(() => {
                const msg = messages.find(m => m.id === context.id);
                const isOwnMessage = msg?.username === user.username;
                
                return isOwnMessage ? (
                  <motion.button 
                    onClick={() => handleEdit(context.id)}
                    whileHover={{ x: 2, backgroundColor: 'var(--white-10)' }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    ✏️ Edit
                  </motion.button>
                ) : null;
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
            onSubmit={handleSendMessage}
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
                sendTypingIndicator(); // Send typing indicator on input change
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

        {/* Connection Stats (Debug Info) */}
        {stats && (
          <div className="text-xs text-system-secondaryLabel p-2 border-t border-white-06">
            Messages: {stats.messagesSent} sent, {stats.messagesReceived} received • 
            Latency: {connectionLatency}ms • 
            Connected: {isConnected ? 'Yes' : 'No'}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
