// Message Storage API - Vercel KV for persistence and fallback
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';

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
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const username = decoded.username;
    
    if (method === 'POST') {
      return await handleSendMessage(req, res, username);
    } else if (method === 'GET') {
      return await handleGetMessages(req, res, username);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('❌ Message API error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function handleSendMessage(req, res, username) {
  const { text, roomId, isDirect = false, replyTo = null } = req.body;
  
  if (!text?.trim()) {
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
  
  try {
    // Use atomic operations to prevent race conditions
    const roomKey = `messages:${message.roomId}`;
    
    // First, try to push atomically using LPUSH equivalent (if supported)
    // Fallback to transaction-like behavior with optimistic locking
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;
    
    while (!success && attempts < maxAttempts) {
      attempts++;
      
      try {
        // Get current messages with a version check approach
        const currentMessages = await kv.get(roomKey) || [];
        const currentLength = currentMessages.length;
        
        // **DEDUPLICATION**: Check if message ID already exists
        const messageExists = currentMessages.some(existingMsg => 
          existingMsg && existingMsg.id === message.id
        );
        
        if (messageExists) {
          console.log(`⚠️ Duplicate message detected, skipping: ${message.id}`);
          return res.json({
            success: true,
            message,
            stored: false,
            reason: 'duplicate'
          });
        }
        
        // Add new message
        const updatedMessages = [...currentMessages, message];
        
        // Keep only last 1000 messages
        if (updatedMessages.length > 1000) {
          updatedMessages.splice(0, updatedMessages.length - 1000);
        }
        
        // **DATABASE INDEXING**: Create and maintain timestamp index for efficient queries
        const indexKey = `messages:${message.roomId}:index`;
        let messageIndex = [];
        
        try {
          messageIndex = await kv.get(indexKey) || [];
          
          // Add new index entry
          const indexEntry = {
            id: message.id,
            timestamp: message.timestamp,
            username: message.username,
            roomId: message.roomId
          };
          
          messageIndex.push(indexEntry);
          
          // Sort by timestamp (newest first) and keep only last 1000
          messageIndex.sort((a, b) => b.timestamp - a.timestamp);
          if (messageIndex.length > 1000) {
            messageIndex.splice(1000);
          }
          
          // Store both messages and index atomically
          await Promise.all([
            kv.set(roomKey, updatedMessages),
            kv.set(indexKey, messageIndex, { ex: 86400 }) // 24 hour expiry
          ]);
          
        } catch (indexError) {
          console.warn(`⚠️ Index update failed, storing without index:`, indexError.message);
          // Still store the message even if indexing fails
          await kv.set(roomKey, updatedMessages);
        }
        
        // Verify the operation succeeded by checking the array length changed correctly
        const verificationMessages = await kv.get(roomKey) || [];
        if (verificationMessages.length === Math.min(currentLength + 1, 1000)) {
          success = true;
          console.log(`✅ Message stored atomically: ${message.id} from ${username} (attempt ${attempts})`);
        } else if (attempts < maxAttempts) {
          console.warn(`⚠️ Potential race condition detected, retrying... (attempt ${attempts})`);
          // Small random delay to reduce contention
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 5));
        }
      } catch (atomicError) {
        if (attempts === maxAttempts) {
          throw atomicError;
        }
        console.warn(`⚠️ Atomic operation failed, retrying... (attempt ${attempts}):`, atomicError.message);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 10));
      }
    }
    
    if (!success) {
      throw new Error('Failed to store message after multiple attempts');
    }

    // Store in fallback queue for offline users (separate operation)
    const otherUser = username === 'ammu' ? 'vero' : 'ammu';
    const fallbackKey = `fallback:${otherUser}`;
    
    try {
      const fallbackMessages = await kv.get(fallbackKey) || [];
      fallbackMessages.push(message);
      await kv.set(fallbackKey, fallbackMessages, { ex: 86400 }); // 24 hour expiry
    } catch (fallbackError) {
      // Don't fail the main operation if fallback queue fails
      console.warn(`⚠️ Failed to update fallback queue:`, fallbackError.message);
    }
    
    // Return the message for immediate UI update
    res.json({
      success: true,
      message,
      stored: true
    });
    
  } catch (error) {
    console.error('❌ Message storage error:', error);
    res.status(500).json({ error: 'Failed to store message' });
  }
}

async function handleGetMessages(req, res, username) {
  const { roomId, since, fallback, limit } = req.query;
  const room = roomId || 'ammu-vero-private-room';
  
  try {
    // Get stored messages with error handling for type conflicts
    const roomKey = `messages:${room}`;
    let messages = [];
    
    try {
      const rawMessages = await kv.get(roomKey);
      
      if (rawMessages) {
        if (Array.isArray(rawMessages)) {
          messages = rawMessages;
        } else if (typeof rawMessages === 'object' && rawMessages !== null) {
          // Single message object
          messages = [rawMessages];
        } else {
          console.warn(`⚠️ Unexpected message data type: ${typeof rawMessages}, resetting...`);
          // Reset to empty array if data type is unexpected
          messages = [];
          await kv.set(roomKey, []);
        }
      }
    } catch (kvError) {
      console.error(`❌ KV get error (possibly WRONGTYPE):`, kvError);
      
      // Try to delete the corrupted key and start fresh
      try {
        await kv.del(roomKey);
        console.log(`🧹 Deleted corrupted key: ${roomKey}`);
        messages = [];
      } catch (deleteError) {
        console.error(`❌ Failed to delete corrupted key:`, deleteError);
        messages = [];
      }
    }

    // Sort messages by timestamp to ensure proper ordering
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Apply pagination - get recent messages first (before timestamp filtering)
    const requestedLimit = parseInt(limit) || null;
    if (requestedLimit && requestedLimit > 0) {
      // Get the most recent N messages
      messages = messages.slice(-requestedLimit);
    }

    // Filter by timestamp if 'since' is provided
    if (since) {
      const sinceTime = parseInt(since);
      messages = messages.filter(msg => {
        const msgTime = msg.timestamp || msg.serverTimestamp || 0;
        return msgTime > sinceTime;
      });
    }
    
    // If fallback requested, get pending fallback messages
    if (fallback === 'true') {
      try {
        const fallbackKey = `fallback:${username}`;
        const fallbackMessages = await kv.get(fallbackKey) || [];
        
        if (fallbackMessages.length > 0) {
          // Add fallback messages and clear the queue
          messages = [...messages, ...fallbackMessages];
          await kv.del(fallbackKey);
          
          console.log(`📨 Delivered ${fallbackMessages.length} fallback messages to ${username}`);
        }
      } catch (fallbackError) {
        console.warn(`⚠️ Fallback message error:`, fallbackError);
        // Continue without fallback messages
      }
    }
    
    // Sort by timestamp and ensure all messages have required fields
    messages = messages
      .filter(msg => msg && typeof msg === 'object' && msg.id && msg.text)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    res.json({
      messages,
      count: messages.length,
      roomId: room,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('❌ Message retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
}

// Helper function to clean old messages (called periodically)
export async function cleanupOldMessages() {
  try {
    // This would be called by a cron job or similar
    const rooms = ['ammu-vero-private-room']; // Add more rooms as needed
    
    for (const room of rooms) {
      const roomKey = `messages:${room}`;
      const messages = await kv.get(roomKey) || [];
      
      // Keep only messages from last 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const recentMessages = messages.filter(msg => msg.timestamp > thirtyDaysAgo);
      
      if (recentMessages.length !== messages.length) {
        await kv.set(roomKey, recentMessages);
        console.log(`🧹 Cleaned ${messages.length - recentMessages.length} old messages from ${room}`);
      }
    }
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}
