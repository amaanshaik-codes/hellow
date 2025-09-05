// Fast Chat API - Handles messages, typing, presence
// Uses Server-Sent Events for real-time delivery
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import { broadcastToRoom } from './sse-chat';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    // Verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT secret not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { action, room, message, username, isTyping, isOnline } = req.method === 'POST' ? req.body : req.query;

    if (!action || !room) {
      return res.status(400).json({ error: 'Missing action or room' });
    }

    const startTime = Date.now();

    switch (action) {
      case 'send_message':
        return await handleSendMessage(res, room, message, decodedToken, startTime);
      
      case 'typing':
        return await handleTyping(res, room, username, isTyping, startTime);
      
      case 'presence':
        return await handlePresence(res, room, username, isOnline, startTime);
      
      case 'getPresence':
        return await handleGetPresence(res, room, startTime);
      
      case 'markOffline':
        return await handleMarkOffline(res, room, username, req.body.lastSeen || Date.now(), startTime);
      
      case 'getMessages':
        return await handleGetMessages(res, room, req.query.since || 0, startTime);
      
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

  } catch (error) {
    console.error('Fast chat API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

async function handleSendMessage(res, room, message, decodedToken, startTime) {
  if (!message || !message.text?.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const messageData = {
    id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    text: message.text.trim(),
    username: decodedToken.username,
    timestamp: message.timestamp || Date.now(),
    type: 'message'
  };

  try {
    // Store in database (non-blocking for speed)
    storeMessageInBackground(room, messageData);

    // Broadcast immediately to all connected users
    const broadcastCount = broadcastToRoom(room, messageData, 'message');
    
    const processingTime = Date.now() - startTime;
    console.log(`📤 Message processed in ${processingTime}ms, broadcasted to ${broadcastCount} users`);

    return res.status(200).json({
      success: true,
      message: messageData,
      broadcastCount,
      processingTime
    });

  } catch (error) {
    console.error('Message handling error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

async function handleTyping(res, room, username, isTyping, startTime) {
  const typingData = {
    type: 'typing',
    username,
    isTyping: Boolean(isTyping),
    timestamp: Date.now()
  };

  try {
    // Broadcast typing indicator immediately (no storage needed)
    const broadcastCount = broadcastToRoom(room, typingData, 'typing');
    
    const processingTime = Date.now() - startTime;
    console.log(`⌨️ Typing indicator processed in ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      broadcastCount,
      processingTime
    });

  } catch (error) {
    console.error('Typing handling error:', error);
    return res.status(500).json({ error: 'Failed to send typing indicator' });
  }
}

async function handlePresence(res, room, username, isOnline, startTime) {
  const presenceData = {
    type: 'presence',
    username,
    isOnline: Boolean(isOnline),
    timestamp: Date.now()
  };

  try {
    // Update presence in storage (background)
    updatePresenceInBackground(room, username, isOnline);

    // Broadcast presence update
    const broadcastCount = broadcastToRoom(room, presenceData, 'presence');
    
    const processingTime = Date.now() - startTime;
    console.log(`👤 Presence update processed in ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      broadcastCount,
      processingTime
    });

  } catch (error) {
    console.error('Presence handling error:', error);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
}

// Background storage functions (non-blocking)
async function storeMessageInBackground(room, messageData) {
  try {
    // Store in messages list
    const messagesKey = `room_messages_${room}`;
    const messages = await kv.get(messagesKey) || [];
    
    // Keep only last 100 messages to prevent memory bloat
    const updatedMessages = [...messages, messageData].slice(-100);
    
    // Store with 24 hour expiry
    await kv.setex(messagesKey, 86400, updatedMessages);
    
    // Also store individual message for reference
    await kv.setex(`message_${messageData.id}`, 3600, messageData);
    
    console.log(`💾 Message stored: ${messageData.id}`);
  } catch (error) {
    console.error('Background message storage failed:', error);
  }
}

async function updatePresenceInBackground(room, username, isOnline) {
  try {
    const presenceKey = `room_presence_${room}`;
    const presence = await kv.get(presenceKey) || {};
    
    if (isOnline) {
      presence[username] = {
        lastSeen: Date.now(),
        isOnline: true
      };
    } else {
      if (presence[username]) {
        presence[username].isOnline = false;
        presence[username].lastSeen = Date.now();
      }
    }
    
    // Store with 1 hour expiry
    await kv.setex(presenceKey, 3600, presence);
    
    console.log(`👤 Presence updated: ${username} = ${isOnline}`);
  } catch (error) {
    console.error('Background presence update failed:', error);
  }
}

// Get presence data for a room
async function handleGetPresence(res, room, startTime) {
  try {
    const presenceKey = `room_presence_${room}`;
    const presence = await kv.get(presenceKey) || {};
    
    const processingTime = Date.now() - startTime;
    console.log(`📋 Presence data retrieved in ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      presence,
      processingTime
    });

  } catch (error) {
    console.error('Get presence error:', error);
    return res.status(500).json({ error: 'Failed to get presence' });
  }
}

// Mark a user as offline
async function handleMarkOffline(res, room, username, lastSeen, startTime) {
  try {
    const presenceKey = `room_presence_${room}`;
    const presence = await kv.get(presenceKey) || {};
    
    if (presence[username]) {
      presence[username].isOnline = false;
      presence[username].lastSeen = lastSeen;
      
      // Store with 1 hour expiry
      await kv.setex(presenceKey, 3600, presence);
      
      console.log(`🔴 Marked ${username} as offline with lastSeen: ${new Date(lastSeen).toISOString()}`);
    }
    
    const processingTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      processingTime
    });

  } catch (error) {
    console.error('Mark offline error:', error);
    return res.status(500).json({ error: 'Failed to mark offline' });
  }
}

// Get recent messages since a timestamp
async function handleGetMessages(res, room, since, startTime) {
  try {
    const messagesKey = `room_messages_${room}`;
    const messages = await kv.get(messagesKey) || [];
    
    // Filter messages since the provided timestamp
    const sinceTime = parseInt(since) || 0;
    const recentMessages = messages
      .filter(msg => msg.timestamp > sinceTime)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-50); // Limit to last 50 messages
    
    const processingTime = Date.now() - startTime;
    console.log(`📦 Retrieved ${recentMessages.length} messages since ${since} in ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      messages: recentMessages,
      processingTime
    });

  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Failed to get messages' });
  }
}
