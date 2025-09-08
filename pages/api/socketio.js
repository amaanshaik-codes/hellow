import { Server } from 'socket.io';
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import { traceEvent } from '../../lib/messageTrace';

const HELLOW_ROOM = 'ammu-vero-private-room';

async function storeMessageInKV(room, messageData) {
  try {
    const key = `room_messages_${room}`;
    let messages = (await kv.get(key)) || [];
    messages = messages.filter(m => m.id !== messageData.id);
    messages.push(messageData);
    if (messages.length > 100) messages = messages.slice(-100);
    await kv.set(key, messages);
  } catch (err) {
    console.error('Failed to store message in KV (socketio):', err);
  }
}

async function updatePresenceInKV(room, username, isOnline) {
  try {
    const presenceKey = `room_presence_${room}`;
    const presence = (await kv.get(presenceKey)) || {};
    if (isOnline) {
      presence[username] = { lastSeen: Date.now(), isOnline: true };
    } else {
      if (presence[username]) {
        presence[username].isOnline = false;
        presence[username].lastSeen = Date.now();
      }
    }
    await kv.setex(presenceKey, 3600, presence);
  } catch (err) {
    console.error('Failed to update presence in KV (socketio):', err);
  }
}

export default async function handler(req, res) {
  // Explicit CORS handling for cross-origin socket.io polling / handshake
  try {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  } catch (e) {}
  // Only initialize the Socket.io server once and attach to the underlying HTTP server
  if (!res.socket.server.io) {
    console.log('🔌 Initializing Socket.io server...');
    const io = new Server(res.socket.server, {
      path: '/api/socketio',
      cors: {
        origin: (origin, cb) => cb(null, true),
        credentials: true
      }
    });

    io.on('connection', (socket) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
          socket.disconnect(true);
          return;
        }

        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
          console.warn('Socket auth failed', e);
          socket.disconnect(true);
          return;
        }

        const username = decoded.username;
        socket.data.username = username;
        // Mark admin users for privileged actions (if token includes role/isAdmin)
        socket.data.isAdmin = !!decoded.isAdmin || decoded.role === 'admin' || false;
        socket.join(HELLOW_ROOM);
        socket.emit('connected', { connectionId: socket.id });

        socket.on('send_message', async (message, cb) => {
          const messageData = {
            id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
            text: message.text?.trim() || '',
            username,
            timestamp: Date.now(),
            type: 'message',
            replyTo: message.replyTo || null
          };

          // persist first
          await storeMessageInKV(HELLOW_ROOM, messageData);
          traceEvent(messageData.id, 'STORE', { room: HELLOW_ROOM, storedTimestamp: messageData.timestamp });

          // broadcast
          io.to(HELLOW_ROOM).emit('message', messageData);
          traceEvent(messageData.id, 'BROADCAST', { room: HELLOW_ROOM });

          // ack via callback
          try {
            if (typeof cb === 'function') cb({ success: true, message: messageData, storedTimestamp: messageData.timestamp });
          } catch (e) {}
        });

        socket.on('typing', (data) => {
          io.to(HELLOW_ROOM).emit('typing', { username, isTyping: !!data.isTyping, timestamp: Date.now() });
        });

        socket.on('presence', async (data) => {
          const isOnline = !!data.isOnline;
          await updatePresenceInKV(HELLOW_ROOM, username, isOnline);
          io.to(HELLOW_ROOM).emit('presence', { username, isOnline, timestamp: Date.now() });
        });

        // Simple ping test (client can emit 'ping-test' and receive server timestamp)
        socket.on('ping-test', (payload, cb) => {
          try {
            const serverTs = Date.now();
            if (typeof cb === 'function') cb({ serverTs });
          } catch (e) {
            if (typeof cb === 'function') cb({ error: 'ping failed' });
          }
        });

        socket.on('disconnect', async () => {
          await updatePresenceInKV(HELLOW_ROOM, username, false);
          io.to(HELLOW_ROOM).emit('presence', { username, isOnline: false, timestamp: Date.now() });
        });

      } catch (err) {
        console.error('Socket connection error:', err);
      }
    });

    // keep reference
    res.socket.server.io = io;
  }

  res.end();
}
