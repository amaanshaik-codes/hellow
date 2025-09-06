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
    peerPresence,
  stats,
  sendReadReceipt
  } = usePragmaticChat(user.username, user.token);

  // Derived presence state (precision + fading categories)
  const [presenceView, setPresenceView] = useState({ label: 'Offline', raw: null });
  const [typingDescriptor, setTypingDescriptor] = useState('is typing');

  useEffect(() => {
    if (!peerPresence) return;
    const now = Date.now();
    if (peerPresence.isOnline) {
      setPresenceView({ label: peerPresence.deviceType ? `Online · ${peerPresence.deviceType}` : 'Online', raw: peerPresence });
      return;
    }
    const lastSeen = peerPresence.lastSeen || now;
    const diff = now - lastSeen;
    let label = 'Offline';
    if (diff < 5 * 60 * 1000) label = 'Last seen just now';
    else if (diff < 60 * 60 * 1000) label = `Last seen ${Math.round(diff/60000)}m ago`;
    else if (diff < 24 * 60 * 60 * 1000) label = `Last seen ${Math.round(diff/3600000)}h ago`;
    else label = 'Last seen days ago';
    setPresenceView({ label, raw: peerPresence });
  }, [peerPresence]);

  // Listen for long typing (heuristic: if typing lasts >5s show different text)
  useEffect(() => {
    if (!isTyping) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const diff = Date.now() - start;
      if (diff > 8000) setTypingDescriptor('is crafting a long message');
      else if (diff > 4000) setTypingDescriptor('is typing a longer message');
      else setTypingDescriptor('is typing');
    }, 1000);
    return () => clearInterval(interval);
  }, [isTyping]);

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
  const typingTimeoutRef = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const readObserverRef = useRef(null);
  const readSentRef = useRef(new Set());
  const visibilityCheckRef = useRef(null);

  const markVisibleUnread = useCallback(() => {
    try {
      const root = viewportRef.current;
      if (!root || !sendReadReceipt) return;
      const rect = root.getBoundingClientRect();
      const MIN_VIS = 0.55; // 55% visible
      const candidates = Array.from(root.querySelectorAll('[data-owner="peer"][data-mid]'));
      candidates.forEach(el => {
        const mid = el.getAttribute('data-mid');
        if (!mid || readSentRef.current.has(mid)) return;
        const r = el.getBoundingClientRect();
        const height = r.height || 1;
        const visible = Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top);
        const ratio = visible / height;
        if (ratio >= MIN_VIS) {
          const m = messages.find(mm => mm.id === mid);
            if (m) {
              readSentRef.current.add(mid);
              sendReadReceipt(m);
            }
        }
      });
    } catch (e) {}
  }, [messages, sendReadReceipt]);

  // Auto-scroll to bottom when new messages arrive, but only if user is near the bottom
  useEffect(() => {
    try {
      const viewport = viewportRef.current;
      if (!viewport) {
        // Fallback to chatBottom behavior
        chatBottom.current && chatBottom.current.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      // Determine if user is near the bottom (within 150px)
      const scrollTop = viewport.scrollTop;
      const clientHeight = viewport.clientHeight;
      const scrollHeight = viewport.scrollHeight;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

      const isNearBottom = distanceFromBottom < 150;

      // If near bottom OR the latest message was sent by local user, scroll
      const lastMsg = messages[messages.length - 1];
      const lastIsLocal = lastMsg && lastMsg.username === user.username;

      if (isNearBottom || lastIsLocal) {
        // Scroll smoothly
        chatBottom.current && chatBottom.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e) {
      console.warn('Auto-scroll failed:', e);
    }
  }, [messages]);

  // Prevent mobile address-bar/layout jumps by setting a CSS variable to the innerHeight
  useEffect(() => {
    const setAppHeight = () => {
      try {
        // Use a small debounce for frequent resize events
        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = setTimeout(() => {
          document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
        }, 50);
      } catch (e) {
        // ignore
      }
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

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
    
    // Clear existing timeout (use ref to avoid global)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Auto-stop typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      if (sendTyping) {
        sendTyping(false);
      }
      typingTimeoutRef.current = null;
    }, 3000);
  }, [sendTyping]);

  // Keep input visible when keyboard opens on mobile and scroll messages to bottom
  const handleInputFocus = useCallback(() => {
    try {
      // Small delay to allow mobile keyboard to open and viewport to stabilize
      setTimeout(() => {
        // Scroll the message viewport to bottom
        const vp = viewportRef.current;
        if (vp) {
          vp.scrollTop = vp.scrollHeight;
        }

        // On mobile, ensure the input stays visible above the keyboard
        if (window.innerWidth <= 800) {
          // Scroll the entire page to keep input visible
          const inputElement = textareaRef.current;
          if (inputElement) {
            inputElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'end',
              inline: 'nearest'
            });
          }
        }
      }, 150); // Increased delay for better keyboard handling
      
      // Don't collapse header on input focus anymore - keep peer info visible
    } catch (e) {
      console.warn('Input focus handler failed:', e);
    }
  }, []);

  // restore header after input blur - no longer needed since we don't collapse
  const handleInputBlur = useCallback(() => {
    // No header manipulation needed
  }, []);

  // Auto-resize textarea based on content
  const autoResizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on content, with min and max constraints
      const newHeight = Math.max(44, Math.min(100, textarea.scrollHeight));
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Haptic feedback for mobile interactions
  const triggerHapticFeedback = useCallback((type = 'light') => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      // Different vibration patterns for different feedback types
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30],
        success: [10, 50, 10]
      };
      window.navigator.vibrate(patterns[type] || patterns.light);
    }
  }, []);

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

    // Trigger haptic feedback on send
    triggerHapticFeedback('light');

    try {
      await sendPragmaticMessage(messageText, replyTo, messageId);
      // Success haptic feedback
      triggerHapticFeedback('success');
      // Auto-resize textarea after clearing
      autoResizeTextarea();
    } catch (error) {
      console.error('Failed to send message:', error);
      // Error haptic feedback
      triggerHapticFeedback('heavy');
    }
  }, [input, replyTo, sendPragmaticMessage, triggerHapticFeedback, sendTyping, autoResizeTextarea]);

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

  // Lightweight mobile optimization: only render last N messages (flatten then regroup)
  const visibleGrouped = useMemo(() => {
    try {
      const FLATTENED = messages || [];
      const MAX = 80;
      const visible = FLATTENED.length > MAX ? FLATTENED.slice(-MAX) : FLATTENED;
      const groups = [];
      visible.forEach(msg => {
        const d = new Date(msg.timestamp);
        const label = d.toLocaleDateString(undefined, {
          weekday: 'short', day: '2-digit', month: 'short'
        });
        const last = groups[groups.length - 1];
        if (!last || last.label !== label) groups.push({ label, items: [msg] });
        else last.items.push(msg);
      });
      return groups;
    } catch (e) {
      return grouped;
    }
  }, [messages, grouped]);

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

  // Helper to format relative time (e.g., "5m ago")
  const formatRelative = (ts) => {
    if (!ts) return null;
    const delta = Math.floor((Date.now() - ts) / 1000);
    if (delta < 5) return 'just now';
    if (delta < 60) return `${delta}s ago`;
    if (delta < 3600) return `${Math.floor(delta/60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta/3600)}h ago`;
    return `${Math.floor(delta/86400)}d ago`;
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

  // Visibility driven read marking (debounced)
  useEffect(() => {
    if (visibilityCheckRef.current) clearTimeout(visibilityCheckRef.current);
    visibilityCheckRef.current = setTimeout(markVisibleUnread, 120);
  }, [messages, markVisibleUnread]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    const handler = () => {
      if (visibilityCheckRef.current) clearTimeout(visibilityCheckRef.current);
      visibilityCheckRef.current = setTimeout(markVisibleUnread, 120);
    };
    root.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      root.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [markVisibleUnread]);

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
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0"> {/* Allow text to truncate */}
              <div className="font-bold text-lg text-system-label truncate">
                {displayPeerName}
              </div>
              <div className="text-system-secondaryLabel text-sm flex items-center gap-2">
                <motion.div
                  className="status-dot flex-shrink-0"
                  aria-hidden
                  animate={{ opacity: peerPresence?.isOnline ? 1 : [0.4,0.2,0.4] }}
                  transition={peerPresence?.isOnline ? { duration: .2 } : { duration: 3, repeat: Infinity }}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    backgroundColor: peerPresence?.isOnline ? 'var(--status-online, #16a34a)' : 'var(--status-offline, #8e8e93)'
                  }}
                />
                <div className="truncate">
                  {presenceView.label}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <ThemeToggle />
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button 
                  onClick={onLogout} 
                  className="bg-transparent border-none cursor-pointer flex items-center justify-center"
                  style={{ padding: '4px', minWidth: '32px', minHeight: '32px' }}
                  aria-label="Logout"
                >
                  <ExitIcon className="text-system-accent w-5 h-5" />
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
        <div className="messages-column" style={{ display: 'flex', flex: '1 1 auto', minHeight: 0, flexDirection: 'column' }}>
          <ScrollArea.Root className="messages-scroll-root" style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <ScrollArea.Viewport ref={viewportRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {visibleGrouped.map((g, gi) => (
                <div key={`${g.label}-${gi}`} className="date-group">
                  <div className="date-divider text-system-secondaryLabel text-xs py-2 text-center">{g.label}</div>
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
                            delay: idx * 0.02 
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
                                    animationDelay: `${idx * 0.02}s`
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
                                        {msg.username === user.username && msg.readAt && (
                                          <span className="text-blue-400 text-xs ml-1" title="Read">
                                            ✓✓
                                          </span>
                                        )}
                                        {msg.username === user.username && !msg.readAt && msg.state === 'confirmed' && (
                                          <span className="text-green-500 text-xs ml-1" title="Delivered">✓</span>
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
            className="typing-indicator px-6 py-2 text-sm text-system-secondaryLabel"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1 items-end" style={{ height: 14 }}>
                {[0,1,2].map(i => (
                  <motion.div key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ background: 'var(--system-secondaryLabel)' }}
                    animate={{
                      y: [0,-3,0],
                      opacity: [0.4,1,0.4]
                    }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <span className="truncate">
                {displayPeerName} {typingDescriptor || 'is typing'}...
              </span>
            </div>
          </motion.div>
        )}

        {/* Input Bar */}
        <motion.div
          className="input-bar-wrapper"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}
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
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onChange={(e) => {
                setInput(e.target.value);
                sendTypingIndicator(); // Send typing indicator on input change
                autoResizeTextarea(); // Auto-resize textarea
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your message..."
              rows={1}
              style={{ 
                maxHeight: '120px',
                minHeight: '44px',
                resize: 'none',
                lineHeight: '1.4'
              }}
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck="true"
              enterKeyHint="send"
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
          <div className="connection-stats-footer text-xs text-system-secondaryLabel p-2 border-t border-white-06">
            Messages: {stats.messagesSent} sent, {stats.messagesReceived} received •
            Latency: {connectionLatency}ms •
            Connected: {isConnected ? 'Yes' : 'No'}
          </div>
        )}
        {/* Outgoing message status line */}
        {messages.length > 0 && (() => {
          const mine = [...messages].filter(m => m.username === user.username);
          if (!mine.length) return null;
          const last = mine[mine.length - 1];
          return (
            <div className="text-[11px] px-4 py-1 text-system-secondaryLabel text-right" aria-live="polite">
              {last.readAt ? 'Read' : last.state === 'confirmed' ? 'Delivered' : last.state === 'failed' ? 'Failed to send' : 'Sending…'}
            </div>
          );
        })()}
      </motion.div>
    </motion.div>
  );
}
