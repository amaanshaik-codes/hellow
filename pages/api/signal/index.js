// WebRTC signaling server for P2P connection setup
// Stores temporary signaling data in Vercel KV
import { kv } from '@vercel/kv';

let memorySignals = {}; // Development fallback

async function saveToKV(key, payload, ttlSeconds = 300) {
  try {
    const signalKey = `signal:${key}`;
    await kv.set(signalKey, payload, { ex: ttlSeconds });
    return true;
  } catch (error) {
    console.error('Failed to save to Vercel KV:', error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, payload, ttlSeconds = 300 } = req.body || {};
    
    // Validate payload
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }

    // Generate unique signal ID if not provided
    const signalId = id || `sig:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    // Always try Vercel KV first
    try {
      const saved = await saveToKV(signalId, payload, ttlSeconds);
      if (!saved) {
        throw new Error('KV save returned false');
      }
      
      res.json({ 
        success: true,
        id: signalId,
        expiresIn: ttlSeconds,
        storage: 'vercel-kv'
      });
      
    } catch (kvError) {
      console.warn('🚨 [SIGNAL] Vercel KV unavailable, using memory fallback:', kvError.message);
      
      // Development fallback - use memory storage with TTL simulation
      memorySignals[signalId] = {
        payload,
        expiresAt: Date.now() + (ttlSeconds * 1000)
      };

      // Clean up expired signals
      setTimeout(() => {
        delete memorySignals[signalId];
      }, ttlSeconds * 1000);

      res.json({ 
        success: true,
        id: signalId,
        expiresIn: ttlSeconds,
        storage: 'memory-fallback'
      });
    }

  } catch (error) {
    console.error('Signal creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create signal',
      message: error.message 
    });
  }
}
