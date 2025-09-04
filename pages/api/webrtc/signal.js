// WebRTC Signaling Server - Handles connection establishment
import { kv } from '@vercel/kv';

// Store active connections and signaling data
const connections = new Map();

export default async function handler(req, res) {
  const { method } = req;
  const { roomId, userId, type, data } = req.body;

  // Enable CORS for real-time communication
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    switch (type) {
      case 'join':
        // User joins room for WebRTC connection
        await handleJoin(roomId, userId, data);
        break;
        
      case 'offer':
        // WebRTC offer from initiating peer
        await handleOffer(roomId, userId, data);
        break;
        
      case 'answer':
        // WebRTC answer from receiving peer
        await handleAnswer(roomId, userId, data);
        break;
        
      case 'ice-candidate':
        // ICE candidate for connection establishment
        await handleIceCandidate(roomId, userId, data);
        break;
        
      case 'leave':
        // User leaves room
        await handleLeave(roomId, userId);
        break;
        
      case 'poll':
        // Poll for pending signals
        const signals = await pollSignals(roomId, userId);
        return res.json({ signals });
        
      default:
        return res.status(400).json({ error: 'Unknown signal type' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Signaling error:', error);
    res.status(500).json({ error: 'Signaling failed' });
  }
}

async function handleJoin(roomId, userId, data) {
  const key = `signal:${roomId}:${userId}`;
  await kv.set(key, {
    userId,
    status: 'online',
    joinedAt: Date.now(),
    ...data
  }, { ex: 300 }); // 5 minute expiry
  
  console.log(`✅ User ${userId} joined room ${roomId}`);
}

async function handleOffer(roomId, fromUserId, offer) {
  // Store offer for the other user to retrieve
  const otherUserId = fromUserId === 'ammu' ? 'vero' : 'ammu';
  const key = `signal:${roomId}:${otherUserId}:pending`;
  
  const signals = await kv.get(key) || [];
  signals.push({
    type: 'offer',
    from: fromUserId,
    data: offer,
    timestamp: Date.now()
  });
  
  await kv.set(key, signals, { ex: 60 }); // 1 minute expiry
  console.log(`📤 Offer sent from ${fromUserId} to ${otherUserId}`);
}

async function handleAnswer(roomId, fromUserId, answer) {
  // Store answer for the offering user
  const otherUserId = fromUserId === 'ammu' ? 'vero' : 'ammu';
  const key = `signal:${roomId}:${otherUserId}:pending`;
  
  const signals = await kv.get(key) || [];
  signals.push({
    type: 'answer',
    from: fromUserId,
    data: answer,
    timestamp: Date.now()
  });
  
  await kv.set(key, signals, { ex: 60 });
  console.log(`📥 Answer sent from ${fromUserId} to ${otherUserId}`);
}

async function handleIceCandidate(roomId, fromUserId, candidate) {
  // Store ICE candidate for the other user
  const otherUserId = fromUserId === 'ammu' ? 'vero' : 'ammu';
  const key = `signal:${roomId}:${otherUserId}:pending`;
  
  const signals = await kv.get(key) || [];
  signals.push({
    type: 'ice-candidate',
    from: fromUserId,
    data: candidate,
    timestamp: Date.now()
  });
  
  await kv.set(key, signals, { ex: 60 });
  console.log(`🧊 ICE candidate sent from ${fromUserId} to ${otherUserId}`);
}

async function handleLeave(roomId, userId) {
  // Clean up user's presence
  const key = `signal:${roomId}:${userId}`;
  await kv.del(key);
  
  // Notify other user of disconnection
  const otherUserId = userId === 'ammu' ? 'vero' : 'ammu';
  const pendingKey = `signal:${roomId}:${otherUserId}:pending`;
  
  const signals = await kv.get(pendingKey) || [];
  signals.push({
    type: 'user-left',
    from: userId,
    timestamp: Date.now()
  });
  
  await kv.set(pendingKey, signals, { ex: 60 });
  console.log(`👋 User ${userId} left room ${roomId}`);
}

async function pollSignals(roomId, userId) {
  // Get pending signals for this user
  const key = `signal:${roomId}:${userId}:pending`;
  const signals = await kv.get(key) || [];
  
  // Clear the signals after retrieving
  if (signals.length > 0) {
    await kv.del(key);
  }
  
  return signals;
}
