// Secure chat history API for Ammu & Vero's private chat
// Uses Vercel KV for unified storage with messages/store.js
import { kv } from '@vercel/kv';

function isValidMessage(payload) {
  return payload && 
         typeof payload === 'object' &&
         payload.id &&
         payload.username &&
         payload.text &&
         payload.timestamp &&
         ['ammu', 'vero'].includes(payload.username.toLowerCase());
}

async function getMessagesFromKV(room) {
  try {
    const roomKey = `messages:${room}`;
    const messages = await kv.get(roomKey) || [];
    
    // Ensure all messages are valid and properly sorted
    const validMessages = messages
      .filter(msg => msg && isValidMessage(msg))
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log(`📖 [HISTORY] Loaded ${validMessages.length} messages from KV for room: ${room}`);
    return validMessages;
  } catch (error) {
    console.error('Failed to fetch from Vercel KV:', error);
    return [];
  }
}

async function saveMessageToKV(room, message) {
  try {
    const roomKey = `messages:${room}`;
    const messages = await kv.get(roomKey) || [];
    
    // Add new message
    messages.push(message);
    
    // Keep only recent 1000 messages
    const recentMessages = messages.slice(-1000);
    
    await kv.set(roomKey, recentMessages);
    console.log(`💾 [HISTORY] Saved message to KV for room: ${room}`);
    return true;
  } catch (error) {
    console.error('KV save error:', error);
    return false;
  }
}

// Development fallback - in-memory storage
const memoryStorage = {};

export default async function handler(req, res) {
  const { room } = req.query;
  
  // Validate room parameter
  if (!room || typeof room !== 'string') {
    return res.status(400).json({ error: 'Invalid room parameter' });
  }

  // Security: Only allow the private room for Ammu & Vero
  const allowedRoom = process.env.NEXT_PUBLIC_WS_ROOM || 'ammu-vero-private-room';
  if (room !== allowedRoom && room !== 'main') {
    return res.status(403).json({ error: 'Access denied to this room' });
  }

  if (req.method === 'GET') {
    try {
      let messages = [];
      
      // Always try Vercel KV first
      try {
        messages = await getMessagesFromKV(room);
      } catch (kvError) {
        console.warn('🚨 [HISTORY] Vercel KV unavailable, using memory fallback:', kvError.message);
        // Development fallback - use memory storage
        messages = memoryStorage[room] || [];
      }

      return res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      return res.status(500).json({ error: 'Failed to fetch chat history' });
    }
  } 
  
  else if (req.method === 'POST') {
    try {
      const message = req.body;

      // Validate message structure
      if (!isValidMessage(message)) {
        return res.status(400).json({ 
          error: 'Invalid message format or unauthorized user' 
        });
      }

      // Add server timestamp for verification
      message.serverTimestamp = Date.now();

      // Always try Vercel KV first
      try {
        const saved = await saveMessageToKV(room, message);
        if (!saved) {
          throw new Error('KV save returned false');
        }
      } catch (kvError) {
        console.warn('🚨 [HISTORY] Vercel KV unavailable, using memory fallback:', kvError.message);
        // Development fallback
        if (!memoryStorage[room]) {
          memoryStorage[room] = [];
        }
        memoryStorage[room].push(message);
        
        // Limit memory storage to last 100 messages
        if (memoryStorage[room].length > 100) {
          memoryStorage[room] = memoryStorage[room].slice(-100);
        }
      }

      return res.json({ 
        success: true, 
        message: 'Message saved successfully',
        timestamp: message.serverTimestamp
      });

    } catch (error) {
      console.error('Error saving message:', error);
      return res.status(500).json({ error: 'Failed to save message' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
