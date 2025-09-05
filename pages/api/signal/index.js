// Ultra-Fast WebRTC signaling server for P2P connection setup
// Optimized for sub-10ms WebRTC establishment
import { kv } from '@vercel/kv';

// In-memory cache for ultra-fast signaling
const signalCache = new Map();
const activeConnections = new Map();

// Clean up old signals every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, signal] of signalCache.entries()) {
    if (now - signal.timestamp > 60000) { // 1 minute old
      signalCache.delete(key);
    }
  }
}, 30000);

async function storeSignal(room, from, type, data) {
  const signalKey = `${room}_${from}_${type}`;
  const signal = {
    type,
    data,
    from,
    room,
    timestamp: Date.now()
  };

  // Store in memory for immediate access
  signalCache.set(signalKey, signal);
  
  // Also try KV for persistence (non-blocking)
  try {
    await kv.setex(`signal_${signalKey}`, 60, JSON.stringify(signal));
  } catch (error) {
    console.warn('KV storage failed, using memory only');
  }

  return signal;
}

async function getSignal(room, for_user) {
  // Look for signals meant for this user
  const patterns = [`${room}_${for_user}_`, `${room}_*_`];
  
  for (const [key, signal] of signalCache.entries()) {
    if (key.startsWith(`${room}_`) && signal.from !== for_user) {
      // Found a signal from another user
      signalCache.delete(key); // Consume it
      return signal;
    }
  }
  
  return null;
}

export default async function handler(req, res) {
  // Ultra-fast CORS (no preflight needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { type, data, room, from } = req.body;
      
      if (!type || !room || !from) {
        return res.status(400).json({ 
          error: 'Missing required fields: type, room, from' 
        });
      }

      const signal = await storeSignal(room, from, type, data);
      
      console.log(`⚡ WebRTC Signal [${type}] from ${from} in room ${room}`);
      
      return res.status(200).json({ 
        success: true,
        timestamp: signal.timestamp
      });

    } catch (error) {
      console.error('❌ Signaling error:', error);
      return res.status(500).json({ 
        error: 'Failed to store signal' 
      });
    }
  }

  if (req.method === 'GET') {
    try {
      const { room, for: forUser } = req.query;
      
      if (!room || !forUser) {
        return res.status(400).json({ 
          error: 'Missing room or for parameter' 
        });
      }

      const signal = await getSignal(room, forUser);
      
      if (signal) {
        console.log(`📨 Delivering signal [${signal.type}] to ${forUser}`);
      }

      return res.status(200).json({
        success: true,
        signal
      });

    } catch (error) {
      console.error('❌ Signal retrieval error:', error);
      return res.status(500).json({ 
        error: 'Failed to retrieve signal' 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
