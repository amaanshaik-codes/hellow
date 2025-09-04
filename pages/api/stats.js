// User stats API - provides login history and unread message counts
// Used for login screen information

let memoryStats = {}; // Development fallback

async function setStatsInUpstash(key, data) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      memoryStats[key] = data;
      return true;
    }

    const url = `${process.env.UPSTASH_REST_URL}/set/${encodeURIComponent(key)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: JSON.stringify(data)
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Set stats error:', error);
    memoryStats[key] = data;
    return false;
  }
}

async function getStatsFromUpstash(key) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return memoryStats[key] || null;
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
    
    return JSON.parse(result.result);
  } catch (error) {
    console.error('Get stats error:', error);
    return memoryStats[key] || null;
  }
}

// Get messages to calculate unread count
async function getMessagesFromUpstash(room) {
  try {
    if (!process.env.UPSTASH_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return [];
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
    
    const messages = result.result.map(item => {
      try {
        if (typeof item === 'object' && item.value) {
          return JSON.parse(item.value);
        }
        if (typeof item === 'string') {
          return JSON.parse(item);
        }
        return item;
      } catch (error) {
        return null;
      }
    }).filter(msg => msg !== null);

    return messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } catch (error) {
    console.error('Get messages error:', error);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Get user stats (last login, unread count)
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    try {
      const statsKey = `stats:${username.toLowerCase()}`;
      const stats = await getStatsFromUpstash(statsKey);
      
      // Get unread message count
      const room = 'ammu-vero-private-room';
      const messages = await getMessagesFromUpstash(room);
      
      // Get last read timestamp
      const lastReadKey = `lastread:${username.toLowerCase()}`;
      const lastReadData = await getStatsFromUpstash(lastReadKey);
      const lastReadTime = lastReadData ? lastReadData.timestamp : 0;
      
      // Count unread messages from other user
      const otherUser = username.toLowerCase() === 'ammu' ? 'vero' : 'ammu';
      const unreadCount = messages.filter(msg => 
        msg.username === otherUser && 
        (msg.timestamp || msg.serverTimestamp || 0) > lastReadTime
      ).length;

      return res.json({
        lastLogin: stats ? stats.lastLogin : null,
        unreadCount,
        totalMessages: messages.length
      });

    } catch (error) {
      console.error('Get stats error:', error);
      return res.status(500).json({ error: 'Failed to get user stats' });
    }
  } 
  else if (req.method === 'POST') {
    // Update user stats (login time, last read)
    const { username, action, timestamp } = req.body;
    
    if (!username || !action) {
      return res.status(400).json({ error: 'Username and action required' });
    }

    try {
      if (action === 'login') {
        const statsKey = `stats:${username.toLowerCase()}`;
        const loginTime = timestamp || new Date().toISOString();
        
        await setStatsInUpstash(statsKey, {
          lastLogin: loginTime,
          loginCount: Date.now() // Simple counter using timestamp
        });
        
        console.log(`📊 Updated login stats for ${username}`);
      } 
      else if (action === 'markread') {
        const lastReadKey = `lastread:${username.toLowerCase()}`;
        const readTime = timestamp || Date.now();
        
        await setStatsInUpstash(lastReadKey, {
          timestamp: readTime,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`📖 Marked messages as read for ${username} at ${new Date(readTime).toLocaleString()}`);
      }

      return res.json({ success: true });

    } catch (error) {
      console.error('Update stats error:', error);
      return res.status(500).json({ error: 'Failed to update user stats' });
    }
  }
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
