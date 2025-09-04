'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ExitIcon } from '@radix-ui/react-icons';
import ThemeToggle from './ThemeToggle';

export default function InstantChat({ user, onLogout }) {
  // Core state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peerPresence, setPeerPresence] = useState({ status: 'offline', lastSeen: null });
  
  // Real-time tracking
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
  const lastTimestampRef = useRef(0);
  const intervalRef = useRef(null);
  const chatBottom = useRef(null);

  // Instant message checking function
  const checkForNewMessages = async () => {
    try {
      const room = 'ammu-vero-private-room';
      const response = await fetch(
        `/api/instant?room=${room}&username=${user.username}&last=${lastTimestampRef.current}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.hasNew && data.messages.length > 0) {
          console.log(`⚡ [${user.username}] INSTANT: Got ${data.messages.length} new messages!`);
          
          // Add new messages immediately
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMessages = data.messages.filter(m => !existingIds.has(m.id));
            
            if (newMessages.length > 0) {
              console.log(`➕ [${user.username}] Adding messages:`, newMessages.map(m => m.text));
              return [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
            }
            return prev;
          });
          
          // Update timestamp
          setLastMessageTimestamp(data.latestTimestamp);
          lastTimestampRef.current = data.latestTimestamp;
        }
      }
    } catch (error) {
      console.error('❌ Instant check error:', error);
    }
  };

  // Load initial messages
  const loadInitialMessages = async () => {
    try {
      const room = 'ammu-vero-private-room';
      const response = await fetch(`/api/history/${room}`);
      
      if (response.ok) {
        const history = await response.json();
        console.log(`📚 [${user.username}] Loaded ${history.length} initial messages`);
        
        setMessages(history);
        
        if (history.length > 0) {
          const latest = Math.max(...history.map(m => m.timestamp || 0));
          setLastMessageTimestamp(latest);
          lastTimestampRef.current = latest;
          console.log(`📅 [${user.username}] Set initial timestamp: ${latest}`);
        }
      }
    } catch (error) {
      console.error('❌ Load initial messages error:', error);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim()) return;

    const messageText = input.trim();
    setInput('');

    const newMessage = {
      id: `${user.username}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: messageText,
      username: user.username,
      timestamp: Date.now(),
      serverTimestamp: Date.now()
    };

    // Add to local state immediately
    setMessages(prev => [...prev, newMessage]);
    
    // Update timestamp
    setLastMessageTimestamp(newMessage.timestamp);
    lastTimestampRef.current = newMessage.timestamp;

    // Save to backend
    try {
      const room = 'ammu-vero-private-room';
      const response = await fetch(`/api/history/${room}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMessage)
      });

      if (response.ok) {
        console.log(`✅ [${user.username}] Message saved: "${messageText}"`);
      } else {
        console.error('❌ Failed to save message');
      }
    } catch (error) {
      console.error('❌ Send message error:', error);
    }
  };

  // Update presence
  const updatePresence = async (status) => {
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          status: status,
          room: 'ammu-vero-private-room'
        })
      });
    } catch (error) {
      console.error('❌ Presence error:', error);
    }
  };

  // Main effect - setup instant messaging
  useEffect(() => {
    console.log(`🚀 [${user.username}] Starting INSTANT messaging system`);
    
    // Load initial messages
    loadInitialMessages();
    
    // Set user online
    updatePresence('online');
    
    // Start aggressive polling every 500ms for instant feel
    intervalRef.current = setInterval(() => {
      checkForNewMessages();
    }, 500);
    
    // Presence heartbeat
    const presenceInterval = setInterval(() => {
      updatePresence('heartbeat');
    }, 15000);

    return () => {
      console.log(`🔌 [${user.username}] Stopping INSTANT messaging`);
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(presenceInterval);
      updatePresence('offline');
    };
  }, [user.username]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatBottom.current) {
      chatBottom.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="flex-1 flex flex-col max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {user.username === 'ammu' ? 'V' : 'A'}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {user.username === 'ammu' ? 'Vero' : 'Ammu'}
                </h3>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${peerPresence.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {peerPresence.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={onLogout}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ExitIcon className="w-5 h-5" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-sm">
                    Logout
                    <Tooltip.Arrow className="fill-gray-900" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea.Root className="flex-1 overflow-hidden">
          <ScrollArea.Viewport className="w-full h-full">
            <div className="p-4 space-y-4">
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${message.username === user.username ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                        message.username === user.username
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={chatBottom} />
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" className="flex select-none touch-none p-0.5 bg-gray-100 dark:bg-gray-800">
            <ScrollArea.Thumb className="flex-1 bg-gray-300 dark:bg-gray-600 rounded-full relative" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        {/* Message Input */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
