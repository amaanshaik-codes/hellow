// Secure chat history API for Ammu & Vero's private chat
// Stores messages in Upstash Redis for production, memory for development

let memoryStorage = {}; // Development fallback

function isValidMessage(payload) {
  return payload && 
         typeof payload === 'object' &&
         payload.id &&
         payload.username &&
         payload.text &&
         payload.timestamp &&
         ['ammu', 'vero'].includes(payload.username.toLowerCase());
}

async function getMessagesFromUpstash(room) {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Fallback to memory storage in development
      return memoryStorage[room] || [];
    }

    const listKey = `history:${room}`;
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/lrange/${encodeURIComponent(listKey)}/0/-1`;
    
    const response = await fetch(url, {
      headers: { 
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` 
      }
    });

    if (!response.ok) {
      console.error('Upstash error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const messages = (data.result || [])
      .map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(msg => msg && isValidMessage(msg))
      .sort((a, b) => a.timestamp - b.timestamp); // Ensure chronological order

    return messages;
  } catch (error) {
    console.error('Failed to fetch from Upstash:', error);
    return [];
  }
}

async function saveMessageToUpstash(room, message) {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Fallback to memory storage
      if (!memoryStorage[room]) memoryStorage[room] = [];
      memoryStorage[room].push(message);
      return true;
    }

    const listKey = `history:${room}`;
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/rpush/${encodeURIComponent(listKey)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        value: JSON.stringify(message) 
      })
    });

    if (!response.ok) {
      console.error('Failed to save to Upstash:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Upstash save error:', error);
    return false;
  }
}

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

  const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

  if (req.method === 'GET') {
    try {
      let messages = [];
      
      if (hasUpstash) {
        messages = await getMessagesFromUpstash(room);
      } else {
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

      if (hasUpstash) {
        const saved = await saveMessageToUpstash(room, message);
        if (!saved) {
          return res.status(500).json({ error: 'Failed to save message' });
        }
      } else {
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
