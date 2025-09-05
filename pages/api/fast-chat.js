// Fast Chat API - Handles messages, typing, presence
// Uses Server-Sent Events for real-time delivery
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import { broadcastToRoom } from './sse-chat';

// Use a single constant for the room name everywhere
const HELLOW_ROOM = 'ammu-vero-private-room';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

    const { action, room, message, username, isTyping, isOnline } = req.body;

    if (!action || !room) {
      return res.status(400).json({ error: 'Missing action or room' });
    }

    const startTime = Date.now();

    // Always use the constant room name
    const safeRoom = HELLOW_ROOM;
    switch (action) {
      case 'send_message':
        return await handleSendMessage(res, safeRoom, message, decodedToken, startTime);
      case 'typing':
        return await handleTyping(res, safeRoom, username, isTyping, startTime);
      case 'presence':
        return await handlePresence(res, safeRoom, username, isOnline, startTime);
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
    console.log(`📡 [API] Broadcasting message to room: ${room}, users:`, broadcastCount);
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

// Store message in Vercel KV, keeping only the last 100 messages per room
async function storeMessageInBackground(room, messageData) {
  try {
    const key = `room_messages_${room}`;
    let messages = await kv.get(key) || [];
    // Remove any duplicate by id
    messages = messages.filter(m => m.id !== messageData.id);
    messages.push(messageData);
    // Keep only the last 100 messages
    if (messages.length > 100) messages = messages.slice(-100);
    await kv.set(key, messages);
  } catch (err) {
    console.error('Failed to store message in KV:', err);
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
