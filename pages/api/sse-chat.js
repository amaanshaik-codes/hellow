// Pragmatic Server-Sent Events API for real-time chat
// Uses proven SSE technology that works reliably
import { kv } from '@vercel/kv';


// Use a single constant for the room name everywhere
const HELLOW_ROOM = 'ammu-vero-private-room';
import { traceEvent } from '../../lib/messageTrace';
const activeConnections = new Map();
const roomSubscriptions = new Map();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }


  let { room, username, lastEventId } = req.query;
  // Always use the constant room name
  room = HELLOW_ROOM;
  if (!room || !username) {
    return res.status(400).json({ error: 'Missing room or username' });
  }

  // Set up Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  const connectionId = `${username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`📡 SSE connection established: ${connectionId} in room ${room}`);

  // Store connection
  activeConnections.set(connectionId, {
    res,
    username,
    room,
    connectedAt: Date.now()
  });

  // Add to room subscriptions
  if (!roomSubscriptions.has(room)) {
    roomSubscriptions.set(room, new Set());
  }
  roomSubscriptions.get(room).add(connectionId);

  // Send connection confirmation
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    connectionId,
    timestamp: Date.now(),
    room,
    username
  })}\n\n`);

  // Send any missed messages if lastEventId is provided
  if (lastEventId) {
    try {
      await sendMissedMessages(res, room, lastEventId, connectionId);
    } catch (error) {
      console.error('Failed to send missed messages:', error);
    }
  }

  // Start a KV poller to deliver messages from other server instances
  const pollInterval = 1000; // ms
  const poller = setInterval(async () => {
    try {
      const conn = activeConnections.get(connectionId);
      const last = conn?.lastSentTimestamp || lastEventId || 0;
      await sendMissedMessages(res, room, last, connectionId);
    } catch (err) {
      console.error('Poller error:', err);
    }
  }, pollInterval);

  // Store poller reference so cleanup can clear it
  activeConnections.get(connectionId).poller = poller;

  // Send current online users
  const onlineUsers = Array.from(roomSubscriptions.get(room) || [])
    .map(id => activeConnections.get(id)?.username)
    .filter(Boolean);

  res.write(`event: presence\n`);
  res.write(`data: ${JSON.stringify({
    type: 'presence',
    onlineUsers,
    timestamp: Date.now()
  })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`💔 SSE connection closed: ${connectionId}`);
    cleanupConnection(connectionId, room);
  });

  req.on('error', (error) => {
    console.error(`❌ SSE connection error: ${connectionId}`, error);
    cleanupConnection(connectionId, room);
  });

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\n`);
      res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
    } catch (error) {
      console.error('Heartbeat failed:', error);
      clearInterval(heartbeat);
      cleanupConnection(connectionId, room);
    }
  }, 30000); // Every 30 seconds

  // Cleanup interval reference
  activeConnections.get(connectionId).heartbeat = heartbeat;
}

async function sendMissedMessages(res, room, lastEventId, connectionId = null) {
  try {
    // Get recent messages from KV storage
    const messages = await kv.get(`room_messages_${room}`) || [];
    
    // Find messages after lastEventId
    const lastEventTime = parseInt(lastEventId) || 0;
    const missedMessages = messages.filter(msg => msg.timestamp > lastEventTime);

    // Send missed messages
    for (const message of missedMessages) {
      res.write(`event: message\n`);
      res.write(`id: ${message.timestamp}\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
      // Update per-connection last sent timestamp
      if (connectionId) {
        const conn = activeConnections.get(connectionId);
        if (conn) conn.lastSentTimestamp = message.timestamp;
      }
    }

    if (missedMessages.length > 0) console.log(`📬 Sent ${missedMessages.length} missed messages to ${connectionId || 'unknown'}`);
  } catch (error) {
    console.error('Failed to retrieve missed messages:', error);
  }
}

function cleanupConnection(connectionId, room) {
  // Remove from active connections
  const connection = activeConnections.get(connectionId);
  if (connection) {
    if (connection.heartbeat) {
      clearInterval(connection.heartbeat);
    }
    activeConnections.delete(connectionId);
  }

  // Clear any poller if present
  try {
    if (connection && connection.poller) {
      clearInterval(connection.poller);
    }
  } catch (e) {
    console.warn('Failed to clear poller for', connectionId, e);
  }

  // Remove from room subscriptions
  const roomConnections = roomSubscriptions.get(room);
  if (roomConnections) {
    roomConnections.delete(connectionId);
    
    // Clean up empty rooms
    if (roomConnections.size === 0) {
      roomSubscriptions.delete(room);
    } else {
      // Notify remaining users
      broadcastToRoom(room, {
        type: 'presence',
        onlineUsers: Array.from(roomConnections)
          .map(id => activeConnections.get(id)?.username)
          .filter(Boolean),
        timestamp: Date.now()
      }, 'presence');
    }
  }

  console.log(`🗑️ Cleaned up connection: ${connectionId}`);
}

// Function to broadcast to all connections in a room
export function broadcastToRoom(room, data, eventType = 'message', options = {}) {
  const roomConnections = roomSubscriptions.get(room);
  if (!roomConnections) return 0;

  let successCount = 0;
  const timestamp = Date.now();

  // If a specific targetConnectionId is provided, only send to that connection
  const target = options.targetConnectionId;

  roomConnections.forEach(connectionId => {
    if (target && connectionId !== target) return; // skip non-targets

    const connection = activeConnections.get(connectionId);
    if (connection) {
      try {
        connection.res.write(`event: ${eventType}\n`);
        connection.res.write(`id: ${timestamp}\n`);
        connection.res.write(`data: ${JSON.stringify({
          ...data,
          timestamp
        })}\n\n`);
        successCount++;

        // Log deliver per connection for tracing
        console.log(`\ud83d\udcec DELIVER ${eventType} -> ${connectionId} (room=${room}, id=${data.id || timestamp})`);
        // Trace per-connection deliver (non-blocking)
        try {
          if (data?.id) {
            traceEvent(data.id, 'DELIVER', { toConnection: connectionId, eventType, deliveredAt: timestamp });
          }
        } catch (tErr) {
          console.warn('traceEvent DELIVER failed', tErr);
        }
      } catch (error) {
        console.error(`Failed to send to ${connectionId}:`, error);
        cleanupConnection(connectionId, room);
      }
    }
  });

  console.log(`\ud83d\udce1 Broadcasted ${eventType} to ${successCount}/${roomConnections.size} connections in room ${room}`);
  return successCount;
}

// Health check endpoint
export function getConnectionStats() {
  const stats = {
    totalConnections: activeConnections.size,
    rooms: roomSubscriptions.size,
    roomDetails: {}
  };

  roomSubscriptions.forEach((connections, room) => {
    stats.roomDetails[room] = {
      connections: connections.size,
      users: Array.from(connections)
        .map(id => activeConnections.get(id)?.username)
        .filter(Boolean)
    };
  });

  return stats;
}
