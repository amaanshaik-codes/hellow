// User stats API - provides login history and unread message counts
// Used for login screen information
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Get user stats (last login, unread count)
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    try {
      // Get stats from KV
      const statsKey = `stats:${username.toLowerCase()}`;
      const stats = await kv.get(statsKey) || {};
      
      // Get unread message count
      const room = 'ammu-vero-private-room';
      const roomKey = `messages:${room}`;
      const messages = await kv.get(roomKey) || [];
      
      // Get last read timestamp
      const lastReadKey = `lastread:${room}:${username.toLowerCase()}`;
      const lastReadTime = await kv.get(lastReadKey) || 0;
      
      // Count unread messages from other user
      const otherUser = username.toLowerCase() === 'ammu' ? 'vero' : 'ammu';
      const unreadCount = Array.isArray(messages) ? messages.filter(msg => 
        msg.username === otherUser && 
        msg.timestamp > lastReadTime
      ).length : 0;

      return res.json({
        username: username.toLowerCase(),
        lastLogin: stats.lastLogin || null,
        totalLogins: stats.totalLogins || 0,
        unreadCount,
        totalMessages: Array.isArray(messages) ? messages.length : 0
      });
      
    } catch (error) {
      console.error('Stats API error:', error);
      return res.status(500).json({ error: 'Failed to get user stats' });
    }
  } 
  
  else if (req.method === 'POST') {
    // Update user stats (login, activity)
    const { username, action, timestamp } = req.body;
    
    if (!username || !action) {
      return res.status(400).json({ error: 'Username and action required' });
    }

    try {
      const statsKey = `stats:${username.toLowerCase()}`;
      const currentStats = await kv.get(statsKey) || {};
      
      if (action === 'login') {
        currentStats.lastLogin = timestamp ? new Date(timestamp).getTime() : Date.now();
        currentStats.totalLogins = (currentStats.totalLogins || 0) + 1;
      }
      
      currentStats.lastActivity = Date.now();
      
      await kv.set(statsKey, currentStats, { ex: 86400 * 30 }); // 30 days
      
      return res.json({ success: true, stats: currentStats });
      
    } catch (error) {
      console.error('Stats update error:', error);
      return res.status(500).json({ error: 'Failed to update stats' });
    }
  }
  
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
