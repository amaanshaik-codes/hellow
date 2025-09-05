// Message Storage API - Vercel KV for persistence and fallback
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import messageEventManager from '../../../lib/messageEvents.js';

export default async function handler(req, res) {
  const { method } = req;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Verify JWT token
  const token = req.headers.authorization?.replace('Bearer ', '');
  console.log(`🔐 [MESSAGE-API] Received token: ${token ? `${token.substring(0, 20)}...` : 'NONE'}`);
  
  if (!token) {
    console.error('❌ [MESSAGE-API] No token provided in request');
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    if (!process.env.JWT_SECRET) {
      console.error('❌ [MESSAGE-API] JWT_SECRET environment variable not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const username = decoded.username;
    console.log(`✅ [MESSAGE-API] Token verified for user: ${username}`);
    
    if (method === 'POST') {
      return await handleSendMessage(req, res, username);
    } else if (method === 'GET') {
      return await handleGetMessages(req, res, username);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('❌ Message API error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

async function handleSendMessage(req, res, username) {
  console.log(`📤 [MESSAGE-API] handleSendMessage called by ${username}`);
  console.log(`📤 [MESSAGE-API] Request body:`, req.body);
  
  const { text, roomId, isDirect = false, replyTo = null } = req.body;
  
  if (!text?.trim()) {
    console.error('❌ [MESSAGE-API] Empty message text provided');
    return res.status(400).json({ error: 'Message text required' });
  }
  
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    text: text.trim(),
    username,
    roomId: roomId || 'ammu-vero-private-room',
    timestamp: Date.now(),
    isDirect, // Whether sent via WebRTC or fallback
    replyTo,
    edited: false
  };
  
  console.log(`💬 [MESSAGE-API] Storing message:`, message);
  
  try {
    // Use atomic operations to prevent race conditions
    const roomKey = `messages:${message.roomId}`;
    console.log(`🔑 [MESSAGE-API] Using room key: ${roomKey}`);
    
    // Get current messages (with error handling for potential type mismatches)
    let currentMessages = [];
    try {
      const stored = await kv.get(roomKey);
      if (Array.isArray(stored)) {
        currentMessages = stored;
      } else if (stored !== null) {
        console.warn(`⚠️ [MESSAGE-API] Room key contains non-array data, resetting`);
        currentMessages = [];
      }
    } catch (kvError) {
      console.error(`❌ [MESSAGE-API] KV get error:`, kvError);
      currentMessages = [];
    }
    
    console.log(`📊 [MESSAGE-API] Current messages count: ${currentMessages.length}`);
    
    // Check if message ID already exists
    const messageExists = currentMessages.some(existingMsg => 
      existingMsg && existingMsg.id === message.id
    );
    
    if (messageExists) {
      console.log(`⚠️ [MESSAGE-API] Duplicate message detected, skipping: ${message.id}`);
      return res.json({
        success: true,
        message,
        stored: false,
        reason: 'duplicate'
      });
    }
    
    // Add new message
    const updatedMessages = [...currentMessages, message];
    
    // Keep only last 1000 messages to prevent unbounded growth
    if (updatedMessages.length > 1000) {
      updatedMessages.splice(0, updatedMessages.length - 1000);
    }
    
    // Store updated messages
    await kv.set(roomKey, updatedMessages);
    console.log(`✅ [MESSAGE-API] Message stored successfully`);
    
    // **REAL-TIME NOTIFICATION**: Notify all SSE connections about the new message
    try {
      messageEventManager.notifyNewMessage(message.roomId, message);
      console.log(`📡 [MESSAGE-API] Broadcasted new message to SSE listeners`);
    } catch (broadcastError) {
      console.warn(`⚠️ [MESSAGE-API] Failed to broadcast message:`, broadcastError);
      // Don't fail the entire operation if broadcast fails
    }
    
    // Also store individual message for quick access
    const msgKey = `msg:${message.id}`;
    await kv.set(msgKey, message, { ex: 86400 }); // 24 hour expiry
    
    console.log(`📤 [MESSAGE-API] Returning success response`);
    return res.status(200).json({
      success: true,
      message,
      totalMessages: updatedMessages.length,
      roomId: message.roomId
    });
    
  } catch (error) {
    console.error('❌ Message storage error:', error);
    return res.status(500).json({ 
      error: 'Failed to store message',
      details: error.message 
    });
  }
}

async function handleGetMessages(req, res, username) {
  const { roomId, limit = 100, since } = req.query;
  const room = roomId || 'ammu-vero-private-room';

  try {
    const roomKey = `messages:${room}`;
    
    // Get current messages (with error handling for potential type mismatches)
    let currentMessages = [];
    try {
      const stored = await kv.get(roomKey);
      if (Array.isArray(stored)) {
        currentMessages = stored;
      } else if (stored !== null) {
        console.warn(`⚠️ [GET] Room key contains non-array data, resetting`);
        currentMessages = [];
        await kv.set(roomKey, []); // Reset to empty array
      }
    } catch (kvError) {
      if (kvError.message && kvError.message.includes('WRONGTYPE')) {
        console.error(`❌ [GET] KV type error, resetting room:`, kvError);
        try {
          await kv.del(roomKey);
          await kv.set(roomKey, []);
        } catch (deleteError) {
          console.error(`❌ [GET] Failed to reset room:`, deleteError);
        }
        currentMessages = [];
      } else {
        throw kvError;
      }
    }

    // Filter by timestamp if 'since' is provided
    let messages = currentMessages;
    if (since) {
      const sinceTimestamp = parseInt(since);
      messages = currentMessages.filter(msg => msg.timestamp > sinceTimestamp);
    }

    // Apply limit
    const limitNum = parseInt(limit);
    if (messages.length > limitNum) {
      messages = messages.slice(-limitNum);
    }

    res.json({
      success: true,
      messages,
      roomId: room,
      total: messages.length,
      since: since || null
    });

  } catch (error) {
    console.error('❌ Message retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
}

// Cleanup function for managing storage limits
export async function cleanupOldMessages() {
  try {
    const roomKey = 'messages:ammu-vero-private-room';
    const messages = await kv.get(roomKey) || [];
    
    if (messages.length > 1000) {
      const cleanedMessages = messages.slice(-500); // Keep latest 500
      await kv.set(roomKey, cleanedMessages);
      console.log(`🧹 Cleaned up messages: ${messages.length} -> ${cleanedMessages.length}`);
    }
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}
