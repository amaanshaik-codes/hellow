// WebRTC signal retrieval endpoint
// Fetches and deletes signaling data (one-time use)

let memorySignals = {}; // Development fallback (shared with index.js in real app)

async function getFromUpstash(signalId) {
  try {
    // Get the signal data
    const getUrl = `${process.env.UPSTASH_REST_URL}/get/${encodeURIComponent(signalId)}`;
    const getResponse = await fetch(getUrl, {
      headers: { 
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` 
      }
    });

    if (!getResponse.ok) {
      console.error('Upstash get error:', getResponse.status);
      return null;
    }

    const getData = await getResponse.json();
    if (!getData.result) {
      return null; // Signal not found or expired
    }

    // Delete the signal (one-time use)
    const deleteUrl = `${process.env.UPSTASH_REST_URL}/del/${encodeURIComponent(signalId)}`;
    await fetch(deleteUrl, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` 
      }
    });

    // Parse and return the payload
    try {
      return JSON.parse(getData.result);
    } catch {
      return getData.result; // Return as-is if not JSON
    }
  } catch (error) {
    console.error('Failed to get from Upstash:', error);
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

    const hasUpstash = process.env.UPSTASH_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
    let payload = null;

    if (hasUpstash) {
      payload = await getFromUpstash(id);
    } else {
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
