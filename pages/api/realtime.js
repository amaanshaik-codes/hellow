// Real-time messaging API - Facebook Messenger style
// Provides instant message delivery, presence updates, and typing indicators

let memoryStorage = {};
let memoryPresence = {};

// Get messages from Upstash with proper parsing
async function getMessagesFromUpstash(room) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return memoryStorage[`history:${room}`] || [];
    }

    const listKey = `history:${room}`;
    const url = `${process.env.UPSTASH_REST_URL}/lrange/${encodeURIComponent(listKey)}/0/-1`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
      }
    });
    
    if (!response.ok) return [];
    
    const result = await response.json();
    if (!result.result || !Array.isArray(result.result)) return [];
    
    // Parse messages correctly - handle both string and object formats
    const messages = result.result.map(item => {
      try {
        // If item is already an object with value property, parse the value
        if (typeof item === 'object' && item.value) {
          return JSON.parse(item.value);
        }
        // If item is a string, parse it directly
        if (typeof item === 'string') {
          return JSON.parse(item);
        }
        // If item is already a parsed object, return it
        return item;
      } catch (error) {
        console.error('Failed to parse message:', item, error);
        return null;
      }
    }).filter(msg => msg !== null);

    // Sort by timestamp to ensure chronological order
    return messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } catch (error) {
    console.error('Get messages error:', error);
    return memoryStorage[`history:${room}`] || [];
  }
}

// Get presence from Upstash
async function getPresenceFromUpstash(key) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
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
    if (!result.result) return null;
    
    const data = JSON.parse(result.result);
    
    // Check if expired
    if (data.expiresAt && Date.now() > data.expiresAt) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Get presence error:', error);
    return memoryPresence[key] || null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room, since, username } = req.query;
  
  if (!room || !username) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Get all messages for the room
    const allMessages = await getMessagesFromUpstash(room);
    
    // Filter messages newer than the 'since' timestamp
    const sinceTime = since ? parseInt(since) : 0;
    const newMessages = allMessages.filter(msg => {
      const msgTime = msg.timestamp || msg.serverTimestamp || 0;
      return msgTime > sinceTime;
    });

    // Get presence info for the other user
    const otherUser = username.toLowerCase() === 'ammu' ? 'vero' : 'ammu';
    const presenceKey = `presence:${otherUser}`;
    const presenceInfo = await getPresenceFromUpstash(presenceKey);
    
    // Prepare presence data
    const presence = presenceInfo ? {
      status: 'online',
      lastSeen: presenceInfo.lastSeen,
      username: otherUser
    } : {
      status: 'offline',
      lastSeen: null,
      username: otherUser
    };

    // Console log for debugging (remove in production)
    if (newMessages.length > 0) {
      console.log(`📨 ${newMessages.length} new messages for ${username} since ${new Date(sinceTime).toLocaleString()}`);
    }

    return res.json({
      messages: newMessages,
      presence,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Realtime API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      messages: [],
      presence: { status: 'offline', lastSeen: null, username: 'unknown' },
      timestamp: Date.now()
    });
  }
}
