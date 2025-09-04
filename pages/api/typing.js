import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { method } = req;

  if (method === 'POST') {
    // Update typing status
    try {
      const { username, targetUser, isTyping } = req.body;
      
      if (!username || !targetUser) {
        return res.status(400).json({ error: 'Username and targetUser required' });
      }

      const typingKey = `typing:${targetUser}:from:${username}`;
      
      if (isTyping) {
        // Set typing indicator with 5 second expiration
        await kv.setex(typingKey, 5, JSON.stringify({
          username,
          targetUser,
          isTyping: true,
          timestamp: Date.now()
        }));
        console.log(`⌨️  ${username} is typing to ${targetUser}`);
      } else {
        // Remove typing indicator
        await kv.del(typingKey);
        console.log(`🛑 ${username} stopped typing to ${targetUser}`);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Typing status error:', error);
      res.status(500).json({ error: 'Failed to update typing status' });
    }
  } else if (method === 'GET') {
    // Get typing status for current user
    try {
      const { username } = req.query;
      
      if (!username) {
        return res.status(400).json({ error: 'Username required' });
      }

      // Check if someone is typing to this user
      const otherUser = username === 'ammu' ? 'vero' : 'ammu';
      const typingKey = `typing:${username}:from:${otherUser}`;
      
      const typingData = await kv.get(typingKey);
      
      if (typingData) {
        const parsedData = typeof typingData === 'string' ? JSON.parse(typingData) : typingData;
        res.status(200).json({ 
          isTyping: true,
          username: parsedData.username,
          timestamp: parsedData.timestamp
        });
      } else {
        res.status(200).json({ isTyping: false });
      }
    } catch (error) {
      console.error('Get typing status error:', error);
      res.status(500).json({ error: 'Failed to get typing status' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'GET']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}
