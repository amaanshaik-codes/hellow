// Server-Sent Events API for true real-time messaging
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room, username, since } = req.query;
  
  if (!room || !username) {
    return res.status(400).json({ error: 'Room and username required' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

  const lastSince = parseInt(since) || 0;
  console.log(`🔗 [SSE] ${username} connected to ${room}, since: ${lastSince}`);

  // Function to get and send new messages
  const checkForMessages = async () => {
    try {
      const rawData = await redis.get(room);
      let messages = [];

      if (rawData) {
        if (typeof rawData === 'string') {
          try {
            messages = JSON.parse(rawData);
          } catch (e) {
            console.log('🔧 [SSE] String data, treating as array:', rawData);
            messages = [rawData];
          }
        } else if (Array.isArray(rawData)) {
          messages = rawData;
        } else if (typeof rawData === 'object') {
          messages = [rawData];
        }
      }

      // Filter for new messages
      const newMessages = messages.filter(msg => {
        const msgTime = msg.timestamp || msg.serverTimestamp || 0;
        return msgTime > lastSince;
      });

      if (newMessages.length > 0) {
        console.log(`📨 [SSE] Sending ${newMessages.length} new messages to ${username}`);
        res.write(`data: ${JSON.stringify({ 
          type: 'messages', 
          messages: newMessages,
          timestamp: Date.now()
        })}\n\n`);
        return true; // Found new messages
      }
      return false; // No new messages
    } catch (error) {
      console.error('❌ [SSE] Error checking messages:', error);
      return false;
    }
  };

  // Initial check
  await checkForMessages();

  // Set up polling every 1 second for new messages
  const interval = setInterval(async () => {
    const foundMessages = await checkForMessages();
    
    // Send heartbeat if no messages
    if (!foundMessages) {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    }
  }, 1000);

  // Cleanup on client disconnect
  req.on('close', () => {
    console.log(`🔌 [SSE] ${username} disconnected from ${room}`);
    clearInterval(interval);
    res.end();
  });

  req.on('error', () => {
    console.log(`❌ [SSE] Error for ${username} in ${room}`);
    clearInterval(interval);
    res.end();
  });
}
