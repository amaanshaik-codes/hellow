const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const PORT = process.env.PORT || 3001;
const HELLOW_ROOM = 'ammu-vero-private-room';

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required');
  process.exit(1);
}

const app = express();

// Add middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Hellow Socket Server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io ? io.engine.clientsCount : 0
  });
});

// Additional health endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: io ? io.engine.clientsCount : 0 
  });
});

app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    connections: io ? io.engine.clientsCount : 0,
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

const server = http.createServer(app);

// Configure Socket.io with better options
const io = new Server(server, {
  cors: { 
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Track connected users
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      console.log(`❌ No token provided for ${socket.id}`);
      return socket.disconnect(true);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      console.log(`❌ Invalid token for ${socket.id}:`, e.message);
      return socket.disconnect(true);
    }

    const username = decoded.username;
    socket.data.username = username;
    socket.join(HELLOW_ROOM);
    
    // Track user connection
    connectedUsers.set(socket.id, { username, connectedAt: Date.now() });
    
    console.log(`✅ User ${username} joined room (${socket.id})`);
    socket.emit('connected', { connectionId: socket.id });

    // Send current user count
    const userCount = connectedUsers.size;
    io.to(HELLOW_ROOM).emit('user_count', { count: userCount });

    socket.on('send_message', (message, cb) => {
      try {
        const messageData = {
          id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
          text: message.text || '',
          username,
          timestamp: Date.now(),
          type: 'message',
          replyTo: message.replyTo || null
        };

        console.log(`📨 Message from ${username}: ${messageData.text.substring(0, 50)}...`);

        // Broadcast to room
        io.to(HELLOW_ROOM).emit('message', messageData);

        // Send acknowledgment
        if (typeof cb === 'function') {
          cb({ 
            success: true, 
            message: messageData, 
            storedTimestamp: messageData.timestamp 
          });
        }
      } catch (err) {
        console.error('❌ Error handling send_message:', err);
        if (typeof cb === 'function') {
          cb({ success: false, error: 'Failed to send message' });
        }
      }
    });

    socket.on('typing', (data) => {
      try {
        const typingData = { 
          username, 
          isTyping: !!data.isTyping, 
          timestamp: Date.now() 
        };
        socket.to(HELLOW_ROOM).emit('typing', typingData);
      } catch (err) {
        console.error('❌ Error handling typing:', err);
      }
    });

    socket.on('presence', (data) => {
      try {
        const presenceData = { 
          username, 
          isOnline: !!data.isOnline, 
          timestamp: Date.now() 
        };
        socket.to(HELLOW_ROOM).emit('presence', presenceData);
      } catch (err) {
        console.error('❌ Error handling presence:', err);
      }
    });

    socket.on('disconnect', (reason) => {
      try {
        console.log(`🔌 User ${username} disconnected (${socket.id}): ${reason}`);
        
        // Remove from tracking
        connectedUsers.delete(socket.id);
        
        // Notify others of disconnection
        socket.to(HELLOW_ROOM).emit('presence', { 
          username, 
          isOnline: false, 
          timestamp: Date.now() 
        });

        // Send updated user count
        const userCount = connectedUsers.size;
        io.to(HELLOW_ROOM).emit('user_count', { count: userCount });
      } catch (err) {
        console.error('❌ Error handling disconnect:', err);
      }
    });

    socket.on('error', (err) => {
      console.error(`❌ Socket error for ${username} (${socket.id}):`, err);
    });

  } catch (err) {
    console.error('❌ Connection setup error:', err);
    socket.disconnect(true);
  }
});

// Server startup with better error handling
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Hellow Socket Server started successfully`);
  console.log(`📡 Listening on http://0.0.0.0:${PORT}`);
  console.log(`🔐 JWT_SECRET configured: ${process.env.JWT_SECRET ? '✅' : '❌'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});

// Error handling
server.on('error', (err) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
