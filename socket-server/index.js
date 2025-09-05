const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const PORT = process.env.PORT || 3001;
const HELLOW_ROOM = 'ammu-vero-private-room';

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('Hellow socket server'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return socket.disconnect(true);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return socket.disconnect(true);
    }

    const username = decoded.username;
    socket.data.username = username;
    socket.join(HELLOW_ROOM);
    socket.emit('connected', { connectionId: socket.id });

    socket.on('send_message', (message, cb) => {
      const messageData = {
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
        text: message.text || '',
        username,
        timestamp: Date.now(),
        type: 'message',
        replyTo: message.replyTo || null
      };

      // Broadcast
      io.to(HELLOW_ROOM).emit('message', messageData);

      // Ack
      if (typeof cb === 'function') cb({ success: true, message: messageData, storedTimestamp: messageData.timestamp });
    });

    socket.on('typing', (data) => {
      io.to(HELLOW_ROOM).emit('typing', { username, isTyping: !!data.isTyping, timestamp: Date.now() });
    });

    socket.on('presence', (data) => {
      const isOnline = !!data.isOnline;
      io.to(HELLOW_ROOM).emit('presence', { username, isOnline, timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      io.to(HELLOW_ROOM).emit('presence', { username, isOnline: false, timestamp: Date.now() });
    });

  } catch (err) {
    console.error('socket err', err);
  }
});

server.listen(PORT, () => console.log(`Socket server listening on ${PORT}`));
