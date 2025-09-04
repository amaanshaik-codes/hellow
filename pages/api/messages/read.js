// Message Read Status API for delivery tracking
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
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
    
    if (req.method === 'POST') {
      return await handleMarkAsRead(req, res, username);
    } else if (req.method === 'GET') {
      return await handleGetReadStatus(req, res, username);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('❌ Message read API error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function handleMarkAsRead(req, res, username) {
  const { messageId, roomId, markAllAsRead } = req.body;
  
  const room = roomId || 'ammu-vero-private-room';
  
  try {
    if (markAllAsRead) {
      // Mark all messages in room as read by updating last read timestamp
      const userReadKey = `lastread:${room}:${username}`;
      const currentTime = Date.now();
      await kv.set(userReadKey, currentTime, { ex: 86400 * 30 }); // 30 days
      
      console.log(`📖 ${username} marked ALL messages as read in ${room}`);
      
      return res.json({
        success: true,
        action: 'markAllAsRead',
        readBy: username,
        readAt: currentTime,
        roomId: room
      });
    }
    
    if (!messageId) {
      return res.status(400).json({ error: 'Message ID required when not marking all as read' });
    }
    
    // Store read receipt for specific message
    const readKey = `read:${room}:${messageId}`;
    const readData = {
      messageId,
      readBy: username,
      readAt: Date.now(),
      roomId: room
    };
    
    await kv.set(readKey, readData, { ex: 86400 }); // 24 hour expiry
    
    // Update user's last read timestamp for the room
    const userReadKey = `lastread:${room}:${username}`;
    await kv.set(userReadKey, readData.readAt, { ex: 86400 * 30 }); // 30 days
    
    console.log(`📖 ${username} marked message ${messageId} as read in ${room}`);
    
    return res.json({
      success: true,
      messageId,
      readBy: username,
      readAt: readData.readAt,
      roomId: room
    });
    
  } catch (error) {
    console.error('❌ Error marking message as read:', error);
    return res.status(500).json({ error: 'Failed to mark message as read' });
  }
}

async function handleGetReadStatus(req, res, username) {
  const { messageId, roomId } = req.query;
  const room = roomId || 'ammu-vero-private-room';
  
  if (messageId) {
    // Get read status for specific message
    try {
      const readKey = `read:${room}:${messageId}`;
      const readData = await kv.get(readKey);
      
      return res.json({
        messageId,
        isRead: !!readData,
        readBy: readData?.readBy || null,
        readAt: readData?.readAt || null,
        roomId: room
      });
    } catch (error) {
      console.error('❌ Error getting read status:', error);
      return res.status(500).json({ error: 'Failed to get read status' });
    }
  } else {
    // Get user's last read timestamp for room
    try {
      const userReadKey = `lastread:${room}:${username}`;
      const lastReadTime = await kv.get(userReadKey) || 0;
      
      return res.json({
        roomId: room,
        username,
        lastReadTime,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Error getting last read time:', error);
      return res.status(500).json({ error: 'Failed to get last read time' });
    }
  }
}

// Utility function to get unread message count
export async function getUnreadCount(username, roomId = 'ammu-vero-private-room') {
  try {
    // Get user's last read time
    const userReadKey = `lastread:${roomId}:${username}`;
    const lastReadTime = await kv.get(userReadKey) || 0;
    
    // Get all messages in room
    const roomKey = `messages:${roomId}`;
    const messages = await kv.get(roomKey) || [];
    
    // Count unread messages (from other users, after last read time)
    const unreadMessages = messages.filter(msg => 
      msg.username !== username && 
      msg.timestamp > lastReadTime
    );
    
    return {
      count: unreadMessages.length,
      messages: unreadMessages,
      lastReadTime
    };
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return { count: 0, messages: [], lastReadTime: 0 };
  }
}
