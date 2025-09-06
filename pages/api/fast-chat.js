// Fast Chat API - Handles messages, typing, presence
// Uses Server-Sent Events for real-time delivery
import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import { broadcastToRoom } from './sse-chat';
import { traceEvent } from '../../lib/messageTrace';

// Use a single constant for the room name everywhere
const HELLOW_ROOM = 'ammu-vero-private-room';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    // Verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT secret not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

  const { action, room, message, username, isTyping, isOnline, senderConnectionId, charCount, typingCategory, deviceType } = req.body;

    if (!action || !room) {
      return res.status(400).json({ error: 'Missing action or room' });
    }

    const startTime = Date.now();

    // Always use the constant room name
    const safeRoom = HELLOW_ROOM;
    switch (action) {
      case 'send_message':
        return await handleSendMessage(res, safeRoom, message, decodedToken, startTime, senderConnectionId);
      case 'typing':
        return await handleTyping(res, safeRoom, username, isTyping, startTime, { charCount, typingCategory, deviceType });
      case 'presence':
        return await handlePresence(res, safeRoom, username, isOnline, startTime, deviceType);
      case 'heartbeat':
        return await handleHeartbeat(res, safeRoom, username, startTime, deviceType);
      case 'presence_sync':
        return await handlePresenceSync(res, safeRoom);
      case 'receipt':
        return await handleReceipt(res, safeRoom, username, req.body.messageId, req.body.messageTimestamp);
      case 'receipt_batch':
        return await handleReceiptBatch(res, safeRoom, username, req.body.messageIds);
      case 'reads_sync':
        return await handleReadsSync(res, safeRoom, username, req.body.peer);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

  } catch (error) {
    console.error('Fast chat API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}


async function handleSendMessage(res, room, message, decodedToken, startTime, senderConnectionId) {
  if (!message || !message.text?.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const messageData = {
    id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    text: message.text.trim(),
    username: decodedToken.username,
    // use server-side timestamp as the canonical persisted timestamp
    timestamp: Date.now(),
    type: 'message'
  };

  try {
  // Store in database (await to get canonical persisted timestamp)
  await storeMessageInBackground(room, messageData);
  console.log(`💾 STORE message ${messageData.id} (room=${room})`);
  // Trace STORE for debugging across instances
  traceEvent(messageData.id, 'STORE', { room, storedTimestamp: messageData.timestamp });

    // Broadcast immediately to all connected users
  const broadcastCount = broadcastToRoom(room, messageData, 'message');
  console.log(`📡 [API] Broadcasting message to room: ${room}, users: ${broadcastCount}`);
  // Trace BROADCAST
  traceEvent(messageData.id, 'BROADCAST', { room, broadcastCount });
    const processingTime = Date.now() - startTime;
    console.log(`📤 Message processed in ${processingTime}ms, broadcasted to ${broadcastCount} users`);

    // Return an ACK with the persisted timestamp so clients can clear pending reliably
    const responsePayload = {
      success: true,
      message: messageData,
      storedTimestamp: messageData.timestamp,
      broadcastCount,
      processingTime
    };

    // If senderConnectionId was provided, send a targeted ack event back to the sender
    try {
      if (senderConnectionId) {
        broadcastToRoom(room, { type: 'ack', messageId: messageData.id, timestamp: messageData.timestamp }, 'ack', { targetConnectionId: senderConnectionId });
        console.log(`📣 ACK sent to connection ${senderConnectionId} for message ${messageData.id}`);
        // Trace ACK sent
        traceEvent(messageData.id, 'ACK', { toConnection: senderConnectionId });
      }
    } catch (err) {
      // Don't fail the request on ack errors
      console.warn('Failed to send ack event:', err);
    }

    return res.status(200).json(responsePayload);

  } catch (error) {
    console.error('Message handling error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

// Store message in Vercel KV, keeping only the last 100 messages per room
async function storeMessageInBackground(room, messageData) {
  try {
    const key = `room_messages_${room}`;
    let messages = await kv.get(key) || [];
    // Remove any duplicate by id
    messages = messages.filter(m => m.id !== messageData.id);
    messages.push(messageData);
    // Keep only the last 100 messages
    if (messages.length > 100) messages = messages.slice(-100);
    await kv.set(key, messages);
  } catch (err) {
    console.error('Failed to store message in KV:', err);
  }
}

async function handleTyping(res, room, username, isTyping, startTime, meta = {}) {
  const typingData = {
    type: 'typing',
    username,
    isTyping: Boolean(isTyping),
    timestamp: Date.now(),
    charCount: Number.isFinite(meta.charCount) ? meta.charCount : undefined,
    category: meta.typingCategory || (meta.charCount > 180 ? 'very_long' : meta.charCount > 60 ? 'long' : 'short'),
    deviceType: meta.deviceType || 'unknown'
  };

  try {
    // Broadcast typing indicator immediately (no storage needed)
    const broadcastCount = broadcastToRoom(room, typingData, 'typing');
    
    const processingTime = Date.now() - startTime;
    console.log(`⌨️ Typing indicator processed in ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      broadcastCount,
      processingTime
    });

  } catch (error) {
    console.error('Typing handling error:', error);
    return res.status(500).json({ error: 'Failed to send typing indicator' });
  }
}

async function handlePresence(res, room, username, isOnline, startTime, deviceType = 'unknown') {
  const presenceData = {
    type: 'presence',
    username,
    isOnline: Boolean(isOnline),
  timestamp: Date.now(),
  deviceType
  };

  try {
    // Update presence in storage (background)
  updatePresenceInBackground(room, username, isOnline, { deviceType, reason: 'manual_presence' });

    // Broadcast presence update
    const broadcastCount = broadcastToRoom(room, presenceData, 'presence');
    
    const processingTime = Date.now() - startTime;
    console.log(`👤 Presence update processed in ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      broadcastCount,
      processingTime
    });

  } catch (error) {
    console.error('Presence handling error:', error);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
}


async function updatePresenceInBackground(room, username, isOnline, extra = {}) {
  try {
    const presenceKey = `room_presence_${room}`;
    const presence = await kv.get(presenceKey) || {};
    
    const now = Date.now();
    if (!presence[username]) presence[username] = { lastSeen: now, isOnline: !!isOnline };
    // Update fields
    if (isOnline) {
      presence[username].isOnline = true;
      presence[username].lastSeen = now; // treat as active
    } else {
      presence[username].isOnline = false;
      presence[username].lastSeen = now;
    }
    if (extra.deviceType) presence[username].deviceType = extra.deviceType;
    presence[username].lastUpdateReason = extra.reason || 'unknown';
    
    // Store with 1 hour expiry
    await kv.setex(presenceKey, 3600, presence);
    
    console.log(`👤 Presence updated: ${username} = ${isOnline} (${extra.reason || 'n/a'})`);
  } catch (error) {
    console.error('Background presence update failed:', error);
  }
}

// Heartbeat updates lastSeen without broadcasting presence noise
async function handleHeartbeat(res, room, username, startTime, deviceType = 'unknown') {
  try {
    await updatePresenceInBackground(room, username, true, { deviceType, reason: 'heartbeat' });
    const processingTime = Date.now() - startTime;
    return res.status(200).json({ success: true, processingTime });
  } catch (e) {
    return res.status(500).json({ error: 'Failed heartbeat' });
  }
}

// Returns full presence map for reconciliation
async function handlePresenceSync(res, room) {
  try {
    const presenceKey = `room_presence_${room}`;
    const presence = await kv.get(presenceKey) || {};
    return res.status(200).json({ success: true, presence, timestamp: Date.now() });
  } catch (e) {
    return res.status(500).json({ error: 'Failed presence sync' });
  }
}

// Read / delivery receipt handling
async function handleReceipt(res, room, username, messageId, messageTimestamp) {
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  try {
    await persistReads(room, username, [messageId]);
    const payload = {
      type: 'receipt',
      messageId,
      reader: username,
      timestamp: Date.now(),
      messageTimestamp: messageTimestamp || null
    };
    broadcastToRoom(room, payload, 'receipt');
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send receipt' });
  }
}

async function handleReceiptBatch(res, room, username, messageIds = []) {
  if (!Array.isArray(messageIds) || !messageIds.length) return res.status(400).json({ error: 'messageIds required' });
  try {
    await persistReads(room, username, messageIds);
    const baseTs = Date.now();
    messageIds.forEach((id, idx) => {
      broadcastToRoom(room, {
        type: 'receipt',
        messageId: id,
        reader: username,
        timestamp: baseTs + idx
      }, 'receipt');
    });
    return res.status(200).json({ success: true, count: messageIds.length });
  } catch (e) {
    return res.status(500).json({ error: 'Failed batch receipt' });
  }
}

async function handleReadsSync(res, room, username, peer) {
  try {
    const key = getReadsKey(room, peer || username, peer ? peer : username);
    const reads = await kv.get(key) || [];
    return res.status(200).json({ success: true, reads });
  } catch (e) {
    return res.status(500).json({ error: 'Failed reads sync' });
  }
}

function getReadsKey(room, reader) {
  return `room_reads_${room}_${reader}`;
}

async function persistReads(room, reader, messageIds) {
  try {
    const key = getReadsKey(room, reader);
    const existing = await kv.get(key) || [];
    const set = new Set(existing);
    let changed = false;
    for (const id of messageIds) {
      if (!set.has(id)) { set.add(id); changed = true; }
    }
    if (changed) {
      await kv.set(key, Array.from(set).slice(-500));
    }
  } catch (e) {
    console.warn('persistReads failed', e);
  }
}
