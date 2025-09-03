// Get chat history (JWT protected, returns encrypted messages)
app.get('/api/history/:room', authenticateJWT, (req, res) => {
  const room = req.params.room;
  const file = `chat_${room}.log`;
  if (!fs.existsSync(file)) return res.json([]);
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  res.json(lines.map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean));
});

// Get user presence info
app.get('/api/presence/:username', authenticateJWT, (req, res) => {
  const username = req.params.username;
  const presence = userPresence[username] || { online: false, lastSeen: null };
  res.json(presence);
});
// JWT authentication middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Image upload setup
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));


// User store with hashed passwords
const USERS = [
  { username: 'jackma', password: '$2b$10$w6QwQwQwQwQwQwQwQwQwQeQwQwQwQwQwQwQwQwQwQwQwQwQwQwQw' }, // 12345 (placeholder, will rehash)
  { username: 'ammu', password: '$2b$10$w6QwQwQwQwQwQwQwQwQwQeQwQwQwQwQwQwQwQwQwQwQwQwQwQwQw' }, // qwerty12345 (placeholder)
  { username: 'vero', password: '$2b$10$w6QwQwQwQwQwQwQwQwQwQeQwQwQwQwQwQwQwQwQwQwQwQwQwQwQw' } // qwerty12345 (placeholder)
];

// On startup, hash passwords if not already hashed
const plainPasswords = {
  'jackma': '12345',
  'ammu': 'qwerty12345',
  'vero': 'qwerty12345'
};
USERS.forEach(user => {
  if (!user.password.startsWith('$2b$')) {
    user.password = bcrypt.hashSync(plainPasswords[user.username], 10);
  }
});

// In-memory chat rooms (max 2 peers) and user presence
const chatRooms = {};
const userPresence = {}; // { username: { online: bool, lastSeen: Date } }

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'hellow_secret';

// Login endpoint (returns JWT)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token });
});

// Image upload endpoint (JWT protected)
app.post('/api/upload', authenticateJWT, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// WebSocket logic with presence, receipts, typing, edit/delete, E2E relay
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'join') {
        // Join or create a room
        let room = chatRooms[msg.room] || [];
        if (room.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
          ws.close();
          return;
        }
        room.push(ws);
        chatRooms[msg.room] = room;
        ws.room = msg.room;
        ws.username = msg.username;
        // Mark user online
        userPresence[msg.username] = { online: true, lastSeen: new Date() };
        // Notify others in room
        room.forEach(peer => {
          if (peer !== ws && peer.readyState === peer.OPEN) {
            peer.send(JSON.stringify({ type: 'presence', username: msg.username, online: true }));
          }
        });
      } else if (msg.type === 'message' || msg.type === 'edit' || msg.type === 'delete') {
        // Relay message/edit/delete to other peer (E2E encrypted payload)
        let room = chatRooms[ws.room] || [];
        room.forEach(peer => {
          if (peer !== ws && peer.readyState === peer.OPEN) {
            peer.send(data);
          }
        });
        // Save to disk (encrypted)
        fs.appendFileSync(`chat_${ws.room}.log`, data + '\n');
      } else if (msg.type === 'typing') {
        // Typing indicator
        let room = chatRooms[ws.room] || [];
        room.forEach(peer => {
          if (peer !== ws && peer.readyState === peer.OPEN) {
            peer.send(JSON.stringify({ type: 'typing', username: ws.username, typing: msg.typing }));
          }
        });
      } else if (msg.type === 'receipt') {
        // Delivery/read receipt
        let room = chatRooms[ws.room] || [];
        room.forEach(peer => {
          if (peer !== ws && peer.readyState === peer.OPEN) {
            peer.send(JSON.stringify({ type: 'receipt', messageId: msg.messageId, status: msg.status, username: ws.username }));
          }
        });
      } else if (msg.type === 'presence') {
        // Manual presence update (optional)
        userPresence[ws.username] = { online: msg.online, lastSeen: new Date() };
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (ws.room && chatRooms[ws.room]) {
      chatRooms[ws.room] = chatRooms[ws.room].filter(peer => peer !== ws);
      if (chatRooms[ws.room].length === 0) delete chatRooms[ws.room];
    }
    if (ws.username) {
      userPresence[ws.username] = { online: false, lastSeen: new Date() };
      // Notify others in room
      let room = chatRooms[ws.room] || [];
      room.forEach(peer => {
        if (peer !== ws && peer.readyState === peer.OPEN) {
          peer.send(JSON.stringify({ type: 'presence', username: ws.username, online: false, lastSeen: userPresence[ws.username].lastSeen }));
        }
      });
    }
  });
});

// Heartbeat for WebSocket connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Hellow backend running on port ${PORT}`);
});
