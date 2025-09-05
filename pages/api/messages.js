// Unified Messages API - Supports both Supabase and KV fallback
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  const { method } = req;
  
  // Enable CORS with restricted origins
  const allowedOrigins = ['http://localhost:3000', 'https://helloww.vercel.app', 'https://hellow-git-main-amaanshaik-codes.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // JWT Authentication
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  let authenticatedUser;
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    authenticatedUser = decoded.username;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const { room, limit, after } = req.query;
  const roomId = room || 'ammu-vero-private-room';
  
  if (method === 'GET') {
    return await handleGetMessages(req, res, roomId, limit, after, authenticatedUser);
  } else if (method === 'POST') {
    return await handleSendMessage(req, res, roomId, authenticatedUser);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGetMessages(req, res, roomId, limit = 50, after = null, authenticatedUser) {
  try {
    console.log(`📚 [API/MESSAGES] Getting messages for room: ${roomId} (user: ${authenticatedUser})`);
    
    const roomKey = `messages:${roomId}`;
    let messages = await kv.get(roomKey) || [];
    
    // Ensure we have an array
    if (!Array.isArray(messages)) {
      messages = [];
    }
    
    // Filter by timestamp if 'after' is provided
    if (after) {
      const afterTimestamp = parseInt(after);
      messages = messages.filter(msg => msg.timestamp > afterTimestamp);
    }
    
    // Apply limit
    const limitNum = parseInt(limit);
    if (messages.length > limitNum) {
      messages = messages.slice(-limitNum);
    }
    
    // Convert to expected format
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      text: msg.text,
      username: msg.username,
      created_at: new Date(msg.timestamp).toISOString(),
      timestamp: msg.timestamp,
      reply_to: msg.replyTo || null,
      edited: msg.edited || false
    }));
    
    console.log(`📚 [API/MESSAGES] Returning ${formattedMessages.length} messages`);
    
    return res.json({
      success: true,
      messages: formattedMessages,
      total: formattedMessages.length
    });
    
  } catch (error) {
    console.error('❌ [API/MESSAGES] Get error:', error);
    return res.status(500).json({ error: 'Failed to get messages' });
  }
}

async function handleSendMessage(req, res, roomId, authenticatedUser) {
  try {
    const { text, reply_to } = req.body;
    
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Message text required' });
    }
    
    console.log(`💬 [API/MESSAGES] Sending message from ${authenticatedUser}: "${text}"`);
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: text.trim(),
      username: authenticatedUser, // Use authenticated user
      roomId,
      timestamp: Date.now(),
      replyTo: reply_to || null,
      edited: false
    };
    
    // Store in KV
    const roomKey = `messages:${roomId}`;
    let messages = await kv.get(roomKey) || [];
    
    if (!Array.isArray(messages)) {
      messages = [];
    }
    
    messages.push(message);
    
    // Keep only last 1000 messages
    if (messages.length > 1000) {
      messages = messages.slice(-1000);
    }
    
    await kv.set(roomKey, messages);
    
    // Return in expected format
    const formattedMessage = {
      id: message.id,
      text: message.text,
      username: message.username,
      created_at: new Date(message.timestamp).toISOString(),
      timestamp: message.timestamp,
      reply_to: message.replyTo,
      edited: message.edited
    };
    
    console.log(`✅ [API/MESSAGES] Message sent successfully`);
    
    return res.json({
      success: true,
      message: formattedMessage
    });
    
  } catch (error) {
    console.error('❌ [API/MESSAGES] Send error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}
