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
    // Store in Vercel KV
    const roomKey = `messages:${message.roomId}`;
    const messages = await kv.get(roomKey) || [];
    
    messages.push(message);
    
    // Keep only last 1000 messages
    if (messages.length > 1000) {
      messages.splice(0, messages.length - 1000);
    }
    
    await kv.set(roomKey, messages);
    
    // Store in fallback queue for offline users
    const otherUser = username === 'ammu' ? 'vero' : 'ammu';
    const fallbackKey = `fallback:${otherUser}`;
    const fallbackMessages = await kv.get(fallbackKey) || [];
    
    fallbackMessages.push(message);
    await kv.set(fallbackKey, fallbackMessages, { ex: 86400 }); // 24 hour expiry
    
    console.log(`✅ Message stored: ${message.id} from ${username}`);
    
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
  const { roomId, since, fallback } = req.query;
  const room = roomId || 'ammu-vero-private-room';
  
  try {
    // Get stored messages
    const roomKey = `messages:${room}`;
    let messages = await kv.get(roomKey) || [];
    
    // Filter by timestamp if 'since' is provided
    if (since) {
      const sinceTime = parseInt(since);
      messages = messages.filter(msg => msg.timestamp > sinceTime);
    }
    
    // If fallback requested, get pending fallback messages
    if (fallback === 'true') {
      const fallbackKey = `fallback:${username}`;
      const fallbackMessages = await kv.get(fallbackKey) || [];
      
      if (fallbackMessages.length > 0) {
        // Add fallback messages and clear the queue
        messages = [...messages, ...fallbackMessages];
        await kv.del(fallbackKey);
        
        console.log(`📨 Delivered ${fallbackMessages.length} fallback messages to ${username}`);
      }
    }
    
    // Sort by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);
    
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
