// Instant messaging API - guaranteed to work
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room, username, last } = req.query;
  
  if (!room || !username) {
    return res.status(400).json({ error: 'Room and username required' });
  }

  try {
    // Get all messages from room
    const rawData = await kv.get(room);
    let allMessages = [];

    if (rawData) {
      if (typeof rawData === 'string') {
        try {
          allMessages = JSON.parse(rawData);
        } catch (e) {
          allMessages = [rawData];
        }
      } else if (Array.isArray(rawData)) {
        allMessages = rawData;
      } else if (typeof rawData === 'object') {
        allMessages = [rawData];
      }
    }

    // Sort messages by timestamp
    allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Filter for NEW messages only
    const lastTimestamp = parseInt(last) || 0;
    const newMessages = allMessages.filter(msg => {
      const msgTime = msg.timestamp || msg.serverTimestamp || 0;
      return msgTime > lastTimestamp;
    });

    console.log(`⚡ [INSTANT] ${username} checking ${room}, last=${lastTimestamp}, found ${newMessages.length} new messages`);

    if (newMessages.length > 0) {
      console.log(`📨 [INSTANT] Sending ${newMessages.length} messages to ${username}:`, 
        newMessages.map(m => `${m.username}: ${m.text}`));
    }

    // Return messages with metadata
    const response = {
      messages: newMessages,
      total: allMessages.length,
      hasNew: newMessages.length > 0,
      latestTimestamp: allMessages.length > 0 ? Math.max(...allMessages.map(m => m.timestamp || 0)) : lastTimestamp,
      timestamp: Date.now()
    };

    res.json(response);
  } catch (error) {
    console.error('❌ [INSTANT] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
