// WebRTC signaling server for P2P connection setup
// Stores temporary signaling data in Upstash Redis

let memorySignals = {}; // Development fallback

async function saveToUpstash(key, payload, ttlSeconds = 300) {
  try {
    const url = `${process.env.UPSTASH_REST_URL}/set/${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        value: JSON.stringify(payload), 
        ex: ttlSeconds 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upstash save error:', response.status, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to save to Upstash:', error);
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

    const hasUpstash = process.env.UPSTASH_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

    if (hasUpstash) {
      const saved = await saveToUpstash(signalId, payload, ttlSeconds);
      if (!saved) {
        return res.status(500).json({ 
          error: 'Failed to save signaling data',
          fallback: true
        });
      }
    } else {
      // Development fallback - use memory storage with TTL simulation
      memorySignals[signalId] = {
        payload,
        expiresAt: Date.now() + (ttlSeconds * 1000)
      };

      // Clean up expired signals
      setTimeout(() => {
        delete memorySignals[signalId];
      }, ttlSeconds * 1000);
    }

    res.json({ 
      success: true,
      id: signalId,
      expiresIn: ttlSeconds,
      storage: hasUpstash ? 'redis' : 'memory'
    });

  } catch (error) {
    console.error('Signal creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create signal',
      message: error.message 
    });
  }
}
