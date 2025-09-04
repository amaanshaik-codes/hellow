// Presence API for real-time online/offline status
// Uses Upstash Redis for production, memory for development

let memoryPresence = {}; // Development fallback

async function setPresenceInUpstash(key, data, expiry = null) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Fallback to memory storage in development
      memoryPresence[key] = { ...data, expiresAt: expiry ? Date.now() + expiry * 1000 : null };
      return true;
    }

    const url = expiry 
      ? `${process.env.UPSTASH_REST_URL}/setex/${encodeURIComponent(key)}/${expiry}/${encodeURIComponent(JSON.stringify(data))}`
      : `${process.env.UPSTASH_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(data))}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Upstash set error:', error);
    // Fallback to memory
    memoryPresence[key] = { ...data, expiresAt: expiry ? Date.now() + expiry * 1000 : null };
    return true;
  }
}

async function getPresenceFromUpstash(key) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Fallback to memory storage
      const data = memoryPresence[key];
      if (!data) return null;
      if (data.expiresAt && Date.now() > data.expiresAt) {
        delete memoryPresence[key];
        return null;
      }
      return data;
    }

    const url = `${process.env.UPSTASH_REST_URL}/get/${encodeURIComponent(key)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
      }
    });
    
    if (!response.ok) return null;
    
    const result = await response.json();
    return result.result ? JSON.parse(result.result) : null;
  } catch (error) {
    console.error('Upstash get error:', error);
    // Fallback to memory
    const data = memoryPresence[key];
    if (!data) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      delete memoryPresence[key];
      return null;
    }
    return data;
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { username, action, lastSeen } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    try {
      const presenceKey = `presence:${username}`;
      
      if (action === 'online') {
        // Set user as online with timestamp
        await setPresenceInUpstash(presenceKey, {
          status: 'online',
          lastSeen: new Date().toISOString(),
          heartbeat: Date.now()
        }, 30); // Expire in 30 seconds if not updated
        
        console.log(`👋 ${username} is now online`);
      } else if (action === 'offline') {
        // Set user as offline with last seen time
        await setPresenceInUpstash(presenceKey, {
          status: 'offline',
          lastSeen: lastSeen || new Date().toISOString(),
          heartbeat: Date.now()
        });
        
        console.log(`👋 ${username} went offline`);
      } else if (action === 'heartbeat') {
        // Update heartbeat to keep online status alive
        await setPresenceInUpstash(presenceKey, {
          status: 'online',
          lastSeen: new Date().toISOString(),
          heartbeat: Date.now()
        }, 30);
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Presence update error:', error);
      res.status(500).json({ error: 'Failed to update presence' });
    }
  } else if (req.method === 'GET') {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    try {
      const presenceKey = `presence:${username}`;
      const presence = await getPresenceFromUpstash(presenceKey);
      
      if (!presence) {
        return res.status(200).json({
          status: 'offline',
          lastSeen: null
        });
      }
      
      // Check if heartbeat is too old (more than 45 seconds)
      const now = Date.now();
      const heartbeatAge = now - presence.heartbeat;
      
      if (heartbeatAge > 45000) {
        // User is considered offline if heartbeat is too old
        return res.status(200).json({
          status: 'offline',
          lastSeen: presence.lastSeen
        });
      }
      
      res.status(200).json(presence);
    } catch (error) {
      console.error('Get presence error:', error);
      res.status(500).json({ error: 'Failed to get presence' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
