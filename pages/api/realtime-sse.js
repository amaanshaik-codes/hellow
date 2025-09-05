// Advanced Server-Sent Events API for best-in-class real-time messaging
import { kv } from '@vercel/kv';
import messageEventManager from '../../lib/messageEvents.js';

// Track active connections for real-time notifications
const activeConnections = new Map(); // room -> Set of { username, res, lastSeen }
const presenceData = new Map(); // room -> Map of username -> presence info
const typingStatus = new Map(); // room -> Map of username -> typing info

// **CONNECTION THROTTLING**: Track connections per user to prevent abuse
const userConnections = new Map(); // username -> { count, lastConnect }
const MAX_CONNECTIONS_PER_USER = 5; // Increased for better real-time experience
const CONNECTION_COOLDOWN = 500; // Reduced to 500ms for faster reconnections

// **ADVANCED CACHING**: Memory cache for recent messages to reduce KV queries
const messageCache = new Map(); // room -> { messages: [], lastUpdate: timestamp, ttl: 30000 }
const CACHE_TTL = 30000; // 30 seconds cache
const CACHE_MAX_MESSAGES = 50; // Keep last 50 messages in cache

// Cache management functions
const getCachedMessages = (room) => {
  const cached = messageCache.get(room);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.lastUpdate > CACHE_TTL) {
    messageCache.delete(room);
    return null;
  }
  
  return cached.messages;
};

const setCachedMessages = (room, messages) => {
  const now = Date.now();
  const cachedMessages = Array.isArray(messages) ? messages.slice(-CACHE_MAX_MESSAGES) : [];
  
  messageCache.set(room, {
    messages: cachedMessages,
    lastUpdate: now,
    ttl: CACHE_TTL
  });
  
  // Cleanup old cache entries every 100 operations
  if (messageCache.size > 100 && Math.random() < 0.01) {
    for (const [cacheRoom, cacheData] of messageCache.entries()) {
      if (now - cacheData.lastUpdate > CACHE_TTL) {
        messageCache.delete(cacheRoom);
      }
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room, username, since } = req.query;
  
  if (!room || !username) {
    return res.status(400).json({ error: 'Room and username required' });
  }

  // **CONNECTION THROTTLING**: Check if user has too many connections
  const userConnInfo = userConnections.get(username) || { count: 0, lastConnect: 0 };
  const now = Date.now();
  
  // Reset count if enough time has passed
  if (now - userConnInfo.lastConnect > 30000) { // Reset every 30 seconds
    userConnInfo.count = 0;
  }
  
  // Check connection limits
  if (userConnInfo.count >= MAX_CONNECTIONS_PER_USER) {
    console.warn(`🚫 [SSE] Connection limit exceeded for ${username}: ${userConnInfo.count}/${MAX_CONNECTIONS_PER_USER}`);
    return res.status(429).json({ 
      error: 'Too many connections', 
      retryAfter: Math.ceil((CONNECTION_COOLDOWN - (now - userConnInfo.lastConnect)) / 1000)
    });
  }
  
  // Check cooldown period
  if (now - userConnInfo.lastConnect < CONNECTION_COOLDOWN) {
    console.warn(`⏳ [SSE] Connection cooldown active for ${username}`);
    return res.status(429).json({ 
      error: 'Connection too frequent', 
      retryAfter: Math.ceil((CONNECTION_COOLDOWN - (now - userConnInfo.lastConnect)) / 1000)
    });
  }
  
  // Update connection tracking
  userConnInfo.count++;
  userConnInfo.lastConnect = now;
  userConnections.set(username, userConnInfo);

  // Set up SSE headers with better compatibility
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'X-Accel-Buffering': 'no', // Disable Nginx buffering
  });

  const lastSince = parseInt(since) || 0;
  let lastMessageCheck = lastSince;
  let connectionAlive = true;

  console.log(`🔗 [SSE] ${username} connected to ${room}, since: ${lastSince}`);

  // Track this connection
  if (!activeConnections.has(room)) {
    activeConnections.set(room, new Set());
  }
  
  const connectionInfo = {
    username,
    res,
    lastSeen: Date.now(),
    connected: Date.now()
  };
  
  activeConnections.get(room).add(connectionInfo);

  // Update presence in KV and local cache
  if (!presenceData.has(room)) {
    presenceData.set(room, new Map());
  }
  
  const presenceInfo = {
    status: 'online',
    lastSeen: Date.now(),
    connectedAt: Date.now()
  };
  
  presenceData.get(room).set(username, presenceInfo);
  
  // Save to KV for persistence
  try {
    const presenceKey = `presence:${room}`;
    const storedPresence = await kv.get(presenceKey) || {};
    storedPresence[username] = presenceInfo;
    await kv.set(presenceKey, storedPresence, { ex: 3600 }); // 1 hour expiry
  } catch (error) {
    console.error('❌ [SSE] Failed to save online presence:', error);
  }

  // Send initial connection confirmation
  const sendSSEMessage = (data) => {
    if (!connectionAlive) return false;
    
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (error) {
      console.error(`❌ [SSE] Failed to send message to ${username}:`, error);
      connectionAlive = false;
      return false;
    }
  };

  // Send connection established
  sendSSEMessage({ 
    type: 'connected', 
    timestamp: Date.now(),
    room,
    username
  });
  
  // **REAL-TIME MESSAGE LISTENER**: Listen for new messages from the message store
  const handleNewMessage = (newMessage) => {
    if (!connectionAlive) return;
    
    // Don't send the message back to the sender
    if (newMessage.username === username) return;
    
    console.log(`📨 [SSE] Broadcasting new message to ${username}:`, newMessage.text);
    
    sendSSEMessage({
      type: 'messages',
      messages: [newMessage],
      timestamp: Date.now()
    });
  };
  
  // Register the event listener
  messageEventManager.addListener(room, handleNewMessage);
  console.log(`📡 [SSE] Registered real-time message listener for ${username} in ${room}`);

  // Send current presence info for all users in room
  const currentPresence = presenceData.get(room);
  if (currentPresence && currentPresence.size > 0) {
    const presenceInfo = Object.fromEntries(currentPresence);
    sendSSEMessage({
      type: 'presence',
      presence: presenceInfo,
      timestamp: Date.now()
    });
  }

  // Function to get and send new messages from Vercel KV
  const checkForMessages = async () => {
    if (!connectionAlive) return false;
    
    try {
      // **ADVANCED CACHING**: Try cache first to reduce KV queries
      let messages = getCachedMessages(room);
      let fromCache = true;
      
      if (!messages) {
        // Cache miss - fetch from KV
        fromCache = false;
        const roomKey = `messages:${room}`;
        
        try {
          const rawMessages = await kv.get(roomKey);
          
          if (rawMessages) {
            if (Array.isArray(rawMessages)) {
              messages = rawMessages;
            } else if (typeof rawMessages === 'object' && rawMessages !== null) {
              // Single message object
              messages = [rawMessages];
            } else {
              console.warn(`⚠️ [SSE] Unexpected message data type: ${typeof rawMessages}, using empty array`);
              messages = [];
            }
          } else {
            messages = [];
          }
          
          // **ADVANCED CACHING**: Update cache with fresh data
          setCachedMessages(room, messages);
          
        } catch (kvError) {
          console.error(`❌ [SSE] KV get error (possibly WRONGTYPE):`, kvError);
          
          // Try to delete corrupted key and continue with empty messages
          try {
            await kv.del(roomKey);
            console.log(`🧹 [SSE] Deleted corrupted key: ${roomKey}`);
          } catch (deleteError) {
            console.error(`❌ [SSE] Failed to delete corrupted key:`, deleteError);
          }
          messages = [];
        }
      }
      
      // Filter for new messages since last check
      const newMessages = messages.filter(msg => {
        if (!msg || typeof msg !== 'object' || !msg.id) return false;
        const msgTime = msg.timestamp || 0;
        return msgTime > lastMessageCheck && msg.username !== username;
      });

      if (newMessages.length > 0) {
        console.log(`📨 [SSE] Sending ${newMessages.length} new messages to ${username} ${fromCache ? '(cached)' : '(fresh)'}`);
        
        // Update last check timestamp
        lastMessageCheck = Math.max(...newMessages.map(m => m.timestamp || 0));
        
        const sent = sendSSEMessage({ 
          type: 'messages', 
          messages: newMessages,
          timestamp: Date.now(),
          lastCheck: lastMessageCheck,
          cached: fromCache
        });
        
        return sent;
      }
      
      return true; // No new messages but connection still alive
    } catch (error) {
      console.error('❌ [SSE] Error checking messages:', error);
      return false;
    }
  };

  // Function to check for presence updates
  const checkForPresence = async () => {
    if (!connectionAlive) return false;
    
    try {
      // Get latest presence from KV
      const presenceKey = `presence:${room}`;
      const storedPresence = await kv.get(presenceKey) || {};
      
      // Compare with our cached presence
      const currentPresence = presenceData.get(room) || new Map();
      let hasChanges = false;
      
      // Check for updates
      for (const [user, info] of Object.entries(storedPresence)) {
        const cached = currentPresence.get(user);
        if (!cached || cached.lastSeen !== info.lastSeen || cached.status !== info.status) {
          currentPresence.set(user, info);
          hasChanges = true;
        }
      }
      
      if (hasChanges) {
        presenceData.set(room, currentPresence);
        
        const presenceInfo = Object.fromEntries(currentPresence);
        sendSSEMessage({
          type: 'presence',
          presence: presenceInfo,
          timestamp: Date.now()
        });
      }
      
      return true;
    } catch (error) {
      console.error('❌ [SSE] Error checking presence:', error);
      return false;
    }
  };

  // Function to check for typing indicators
  const checkForTyping = async () => {
    if (!connectionAlive) return false;
    
    try {
      const typingKey = `typing:${room}:${username}`;
      const typingInfo = await kv.get(typingKey);
      
      if (typingInfo && typingInfo.isTyping !== undefined) {
        const cached = typingStatus.get(room)?.get(username);
        
        if (!cached || cached.isTyping !== typingInfo.isTyping) {
          // Update cache
          if (!typingStatus.has(room)) {
            typingStatus.set(room, new Map());
          }
          typingStatus.get(room).set(username, typingInfo);
          
          // Only send typing updates from other users
          if (typingInfo.targetUser === username || typingInfo.username !== username) {
            sendSSEMessage({
              type: 'typing',
              username: typingInfo.username,
              isTyping: typingInfo.isTyping,
              timestamp: Date.now()
            });
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ [SSE] Error checking typing:', error);
      return false;
    }
  };

  // Initial data load
  await checkForMessages();
  await checkForPresence();

  // Set up real-time polling with staggered intervals for better performance
  let messageCheckCounter = 0;
  
  const mainInterval = setInterval(async () => {
    if (!connectionAlive) {
      clearInterval(mainInterval);
      return;
    }
    
    messageCheckCounter++;
    
    // Check messages every cycle (500ms)
    const messagesOk = await checkForMessages();
    
    // Check presence every 2 seconds (every 4th cycle)
    if (messageCheckCounter % 4 === 0) {
      await checkForPresence();
    }
    
    // Check typing every second (every 2nd cycle)
    if (messageCheckCounter % 2 === 0) {
      await checkForTyping();
    }
    
    // Send heartbeat every 10 seconds (every 20th cycle)
    if (messageCheckCounter % 20 === 0) {
      const sent = sendSSEMessage({ 
        type: 'heartbeat', 
        timestamp: Date.now(),
        connectionTime: Date.now() - connectionInfo.connected,
        messagesSince: lastMessageCheck
      });
      
      if (!sent) {
        connectionAlive = false;
        clearInterval(mainInterval);
      }
    }
    
    if (!messagesOk) {
      connectionAlive = false;
      clearInterval(mainInterval);
    }
  }, 500); // Check every 500ms for ultra-responsive messaging

  // Broadcast new message to all connected clients in room (except sender)
  const broadcastToRoom = async (messageData, excludeUsername = null) => {
    const connections = activeConnections.get(room);
    if (!connections) return;
    
    const messageToSend = {
      type: 'messages',
      messages: [messageData],
      timestamp: Date.now()
    };
    
    for (const conn of connections) {
      if (conn.username !== excludeUsername && conn.res) {
        try {
          conn.res.write(`data: ${JSON.stringify(messageToSend)}\n\n`);
        } catch (error) {
          console.error(`❌ [SSE] Failed to broadcast to ${conn.username}:`, error);
          connections.delete(conn);
        }
      }
    }
  };

  // Cleanup function
  const cleanup = async () => {
    console.log(`🔌 [SSE] ${username} disconnecting from ${room}`);
    connectionAlive = false;
    
    // **REAL-TIME CLEANUP**: Remove the message event listener
    messageEventManager.removeListener(room, handleNewMessage);
    console.log(`📡 [SSE] Removed real-time message listener for ${username} in ${room}`);
    
    // **CONNECTION THROTTLING**: Decrease user connection count
    const userConnInfo = userConnections.get(username);
    if (userConnInfo && userConnInfo.count > 0) {
      userConnInfo.count--;
      if (userConnInfo.count <= 0) {
        userConnections.delete(username);
      } else {
        userConnections.set(username, userConnInfo);
      }
      console.log(`🔢 [SSE] Connection count for ${username}: ${userConnInfo.count}`);
    }
    
    // Clear the polling interval to prevent memory leaks
    clearInterval(mainInterval);
    
    // Remove from active connections
    const connections = activeConnections.get(room);
    if (connections) {
      connections.delete(connectionInfo);
      if (connections.size === 0) {
        activeConnections.delete(room);
      }
    }
    
    // Update presence to offline
    try {
      const presenceKey = `presence:${room}`;
      const storedPresence = await kv.get(presenceKey) || {};
      
      storedPresence[username] = {
        status: 'offline',
        lastSeen: Date.now()
      };
      
      await kv.set(presenceKey, storedPresence, { ex: 3600 }); // 1 hour expiry
      
      // Update local cache
      const currentPresence = presenceData.get(room);
      if (currentPresence) {
        currentPresence.set(username, storedPresence[username]);
        
        // Broadcast presence update to remaining connections
        const remainingConnections = activeConnections.get(room);
        if (remainingConnections && remainingConnections.size > 0) {
          const presenceInfo = Object.fromEntries(currentPresence);
          const presenceMessage = {
            type: 'presence',
            presence: presenceInfo,
            timestamp: Date.now()
          };
          
          for (const conn of remainingConnections) {
            try {
              conn.res.write(`data: ${JSON.stringify(presenceMessage)}\n\n`);
            } catch (error) {
              console.error(`❌ [SSE] Failed to send presence update:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ [SSE] Error updating presence on disconnect:', error);
    }
    
    clearInterval(mainInterval);
    
    try {
      res.end();
    } catch (error) {
      // Connection might already be closed
    }
  };

  // Handle client disconnect
  req.on('close', cleanup);
  req.on('error', (error) => {
    console.log(`❌ [SSE] Connection error for ${username} in ${room}:`, error);
    cleanup();
  });

  // Handle server shutdown
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
