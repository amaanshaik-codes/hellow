// User presence API - Vercel KV for real-time status tracking
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { username, room, status } = req.method === 'POST' ? req.body : req.query;
  
  if (!username || !room) {
    return res.status(400).json({ error: 'Username and room required' });
  }

  const presenceKey = `presence:${room}`;

  try {
    if (req.method === 'POST') {
      // Update user presence
      const presenceStatus = status || 'online';
      const currentTime = Date.now();
      
      // Get current presence data
      const currentPresence = await kv.get(presenceKey) || {};
      
      // Update user's presence
      currentPresence[username] = {
        status: presenceStatus,
        lastSeen: currentTime,
        updatedAt: currentTime
      };

      // Save back to KV with 1 hour expiry
      await kv.set(presenceKey, currentPresence, { ex: 3600 });
      
      console.log(`✅ [PRESENCE] Updated ${username} to ${presenceStatus} in ${room}`);
      
      return res.json({ 
        success: true, 
        username,
        status: presenceStatus,
        timestamp: currentTime
      });
      
    } else if (req.method === 'GET') {
      // Get presence for all users in room
      const presenceData = await kv.get(presenceKey) || {};
      
      return res.json({
        room,
        presence: presenceData,
        timestamp: Date.now()
      });
      
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
  } catch (error) {
    console.error('❌ [PRESENCE] Error:', error);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
}
