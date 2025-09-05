import { WebSocketServer } from 'ws';
import { parse } from 'url';

// In-memory storage for active connections
const rooms = new Map();
const connections = new Map();

// Performance tracking
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesPerSecond: 0,
  avgLatency: 0
};

function createWebSocketHandler() {
  const wss = new WebSocketServer({ 
    port: 0, // Will be set by the platform
    verifyClient: (info) => {
      // Basic verification - you can add JWT verification here
      return true;
    }
  });

  wss.on('connection', (ws, req) => {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    stats.totalConnections++;
    stats.activeConnections++;
    
    console.log(`🔗 New WebSocket connection: ${connectionId}`);
    
    // Store connection
    connections.set(connectionId, {
      ws,
      id: connectionId,
      username: null,
      room: null,
      joinedAt: Date.now(),
      lastPing: Date.now()
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(connectionId, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    ws.on('close', () => {
      console.log(`💔 WebSocket disconnected: ${connectionId}`);
      handleDisconnection(connectionId);
      stats.activeConnections--;
    });

    ws.on('pong', () => {
      const conn = connections.get(connectionId);
      if (conn) {
        conn.lastPing = Date.now();
      }
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      connectionId,
      serverTime: Date.now()
    }));
  });

  return wss;
}

function handleMessage(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection) return;

  const messageWithTimestamp = {
    ...message,
    serverTimestamp: Date.now(),
    connectionId
  };

  switch (message.type) {
    case 'join':
      handleJoin(connectionId, message);
      break;
    
    case 'message':
      handleChatMessage(connectionId, messageWithTimestamp);
      break;
    
    case 'typing':
      handleTyping(connectionId, messageWithTimestamp);
      break;
    
    case 'presence':
      handlePresence(connectionId, messageWithTimestamp);
      break;
    
    case 'ping':
      handlePing(connectionId, messageWithTimestamp);
      break;
    
    default:
      console.warn(`Unknown message type: ${message.type}`);
  }
}

function handleJoin(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection) return;

  const { room, username } = message;
  
  // Update connection info
  connection.username = username;
  connection.room = room;
  
  // Add to room
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  rooms.get(room).add(connectionId);
  
  console.log(`👤 ${username} joined room: ${room}`);
  
  // Notify others in room
  broadcastToRoom(room, {
    type: 'user_joined',
    username,
    timestamp: Date.now()
  }, connectionId);
  
  // Send room info to new user
  const roomConnections = Array.from(rooms.get(room) || [])
    .map(id => connections.get(id))
    .filter(conn => conn && conn.username)
    .map(conn => ({
      username: conn.username,
      joinedAt: conn.joinedAt
    }));
  
  connection.ws.send(JSON.stringify({
    type: 'room_joined',
    room,
    users: roomConnections,
    timestamp: Date.now()
  }));
}

function handleChatMessage(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection || !connection.room) return;

  console.log(`💬 Message from ${connection.username}: ${message.text?.substring(0, 50)}...`);
  
  // Broadcast to all room members immediately
  broadcastToRoom(connection.room, {
    type: 'message',
    id: message.id,
    text: message.text,
    username: connection.username,
    timestamp: message.timestamp,
    serverTimestamp: message.serverTimestamp
  });
  
  // Update stats
  stats.messagesPerSecond++;
}

function handleTyping(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection || !connection.room) return;

  // Broadcast typing indicator to others (not self)
  broadcastToRoom(connection.room, {
    type: 'typing',
    username: connection.username,
    isTyping: message.isTyping,
    timestamp: message.timestamp,
    serverTimestamp: message.serverTimestamp
  }, connectionId);
}

function handlePresence(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection || !connection.room) return;

  // Broadcast presence update
  broadcastToRoom(connection.room, {
    type: 'presence',
    username: connection.username,
    online: message.online,
    timestamp: message.timestamp,
    serverTimestamp: message.serverTimestamp
  }, connectionId);
}

function handlePing(connectionId, message) {
  const connection = connections.get(connectionId);
  if (!connection) return;

  // Calculate latency
  const latency = Date.now() - message.timestamp;
  
  // Send pong back
  connection.ws.send(JSON.stringify({
    type: 'pong',
    originalTimestamp: message.timestamp,
    serverTimestamp: Date.now(),
    latency
  }));
  
  // Update stats
  stats.avgLatency = (stats.avgLatency + latency) / 2;
}

function broadcastToRoom(room, message, excludeConnectionId = null) {
  const roomConnections = rooms.get(room);
  if (!roomConnections) return;

  let deliveredCount = 0;
  
  roomConnections.forEach(connectionId => {
    if (connectionId === excludeConnectionId) return;
    
    const connection = connections.get(connectionId);
    if (connection && connection.ws.readyState === connection.ws.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
        deliveredCount++;
      } catch (error) {
        console.error(`Failed to send to ${connectionId}:`, error);
        // Remove dead connection
        handleDisconnection(connectionId);
      }
    }
  });
  
  console.log(`📡 Broadcasted to ${deliveredCount} connections in room: ${room}`);
}

function handleDisconnection(connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;

  // Remove from room
  if (connection.room) {
    const roomConnections = rooms.get(connection.room);
    if (roomConnections) {
      roomConnections.delete(connectionId);
      
      // Notify others of disconnection
      if (connection.username) {
        broadcastToRoom(connection.room, {
          type: 'user_left',
          username: connection.username,
          timestamp: Date.now()
        });
      }
      
      // Clean up empty rooms
      if (roomConnections.size === 0) {
        rooms.delete(connection.room);
      }
    }
  }
  
  // Remove connection
  connections.delete(connectionId);
  
  console.log(`🗑️ Cleaned up connection: ${connectionId}`);
}

// Health monitoring
function startHealthMonitoring() {
  setInterval(() => {
    // Ping all connections
    connections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === connection.ws.OPEN) {
        const timeSinceLastPing = Date.now() - connection.lastPing;
        
        if (timeSinceLastPing > 60000) { // 1 minute
          console.log(`🏥 Pinging stale connection: ${connectionId}`);
          connection.ws.ping();
        }
        
        if (timeSinceLastPing > 120000) { // 2 minutes
          console.log(`💀 Terminating dead connection: ${connectionId}`);
          connection.ws.terminate();
          handleDisconnection(connectionId);
        }
      }
    });
    
    // Reset message counter
    stats.messagesPerSecond = 0;
    
    // Log stats
    console.log(`📊 Stats: ${stats.activeConnections} active, ${rooms.size} rooms, avg latency: ${Math.round(stats.avgLatency)}ms`);
  }, 30000); // Every 30 seconds
}

// Export for Next.js API routes
export default function handler(req, res) {
  if (req.method === 'GET') {
    // Return server stats
    res.json({
      success: true,
      stats: {
        ...stats,
        rooms: rooms.size,
        roomDetails: Array.from(rooms.entries()).map(([room, connections]) => ({
          room,
          connections: connections.size
        }))
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// Initialize WebSocket server if running in appropriate environment
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  const wss = createWebSocketHandler();
  startHealthMonitoring();
  
  console.log('🚀 Ultra-Fast WebSocket Server initialized!');
  console.log('⚡ Expected latency: 10-50ms for local connections');
  console.log('🌐 Expected latency: 50-150ms for global connections');
}
