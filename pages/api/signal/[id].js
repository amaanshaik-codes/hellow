// WebRTC signal retrieval endpoint
// Fetches and deletes signaling data (one-time use)
// Now using Vercel KV for unified storage
import { kv } from '@vercel/kv';

let memorySignals = {}; // Development fallback (shared with index.js in real app)

async function getFromKV(signalId) {
  try {
    // Get the signal data
    const signalKey = `signal:${signalId}`;
    const signalData = await kv.get(signalKey);
    
    if (!signalData) {
      return null; // Signal not found or expired
    }

    // Delete the signal (one-time use)
    await kv.del(signalKey);

    // Return the payload
    return signalData;
  } catch (error) {
    console.error('Failed to get from Vercel KV:', error);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid signal ID' });
    }

    let payload = null;

    // Always try Vercel KV first
    try {
      payload = await getFromKV(id);
    } catch (kvError) {
      console.warn('🚨 [SIGNAL] Vercel KV unavailable, using memory fallback:', kvError.message);
      // Development fallback - check memory storage
      const signal = memorySignals[id];
      if (signal) {
        // Check if expired
        if (Date.now() > signal.expiresAt) {
          delete memorySignals[id];
          payload = null;
        } else {
          payload = signal.payload;
          delete memorySignals[id]; // One-time use
        }
      }
    }

    if (!payload) {
      return res.status(404).json({ 
        error: 'Signal not found or expired',
        id: id
      });
    }

    res.json({ 
      success: true,
      payload,
      retrievedAt: Date.now()
    });

  } catch (error) {
    console.error('Signal retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve signal',
      message: error.message 
    });
  }
}
