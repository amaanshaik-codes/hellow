/**
 * Pragmatic Fast Messaging System
 * Uses proven techniques that actually work in production
 * Server-Sent Events + Optimistic UI + Smart Caching
 */

// Use a single constant for the room name everywhere
const HELLOW_ROOM = 'ammu-vero-private-room';

export class PragmaticFastMessaging {
  constructor(username, jwtToken, config = {}) {
    this.username = username;
    this.jwtToken = jwtToken;
    this.config = {
      room: HELLOW_ROOM,
      maxRetries: 3,
      heartbeatInterval: 30000,
      typingTimeout: 3000,
      // how long to wait for a socket connection before falling back to HTTP
      sendFallbackTimeout: 5000,
      // per-message socket ack timeout (ms)
      ackTimeout: 8000,
      // how long to wait for socket connect before falling back to SSE (ms)
      socketConnectTimeout: 3000,
      ...config
    };

    // Connection state
    this.isConnected = false;
    this.eventSource = null;
    this.retryCount = 0;
    this.lastEventId = null;
    
    // Message handling
    this.messageHandlers = new Set();
    this.typingHandlers = new Set();
    this.presenceHandlers = new Set();
    this.connectionHandlers = new Set();
    
    // Deduplication tracking
    this.seenMessageIds = new Set();
    
    // Optimistic UI state
    this.pendingMessages = new Map();
  // messageQueue holds objects: { message, resolve, reject, fallbackTimer }
  this.messageQueue = [];
    this.typingTimeout = null;
  // promises map to preserve/attach promises by message id
  this.pendingPromises = new Map();
    
    // Performance tracking
    this.latencyStartTimes = new Map();
    this.averageLatency = 0;
  // Ack samples for adaptive tuning
  this.ackSamples = [];
  this.ackSampleWindow = 50;
    this.connectionStartTime = null;

    this.init();
  }

  // Storage key for persisted message queue
  getQueueStorageKey() {
    return `pragmatic_message_queue_v1_${this.username}`;
  }

  // IndexedDB helpers using idb package
  async openIdb() {
    if (this._idbPromise) return this._idbPromise;
    try {
      const { openDB } = await import('idb');
      this._idbPromise = openDB('pragmatic-fast-messaging-db', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('queuedMessages')) {
            db.createObjectStore('queuedMessages', { keyPath: 'id' });
          }
        },
      });
      return this._idbPromise;
    } catch (e) {
      console.warn('Failed to open IndexedDB:', e);
      throw e;
    }
  }

  async idbPutQueue(arr) {
    try {
      const db = await this.openIdb();
      const tx = db.transaction('queuedMessages', 'readwrite');
      // Clear existing entries
      await tx.store.clear();
      // Add new entries
      for (const item of arr) {
        await tx.store.put({ 
          id: item.message.id, 
          createdAt: item.createdAt || Date.now(), 
          message: item.message 
        });
      }
      await tx.done;
    } catch (e) {
      console.warn('idbPutQueue failed', e);
    }
  }

  async idbGetQueue() {
    try {
      const db = await this.openIdb();
      return await db.getAll('queuedMessages') || [];
    } catch (e) {
      console.warn('idbGetQueue failed', e);
      return [];
    }
  }

  async idbRemoveById(id) {
    try {
      const db = await this.openIdb();
      await db.delete('queuedMessages', id);
    } catch (e) {
      console.warn('idbRemoveById failed', e);
    }
  }

  persistQueueToStorage() {
    // Persist queue to IndexedDB (fire-and-forget)
    try {
      if (typeof window === 'undefined' || !window.indexedDB) return;
      const toStore = this.messageQueue.map(e => ({ message: e.message, createdAt: e.createdAt || Date.now() }));
      this.idbPutQueue(toStore);
    } catch (e) {
      console.warn('Failed to persist message queue (idb):', e);
    }
  }

  loadQueueFromStorage() {
    // Async load from IndexedDB
    return (async () => {
      try {
        if (typeof window === 'undefined' || !window.indexedDB) return;
        const arr = await this.idbGetQueue();
        for (const item of arr) {
          const entry = { message: item.message, resolve: null, reject: null, createdAt: item.createdAt || Date.now(), fallbackTimer: null };
          entry.fallbackTimer = setTimeout(async () => {
            try {
              if (this.socket && this.socket.connected) return;
              const result = await this.sendViaHttp(entry.message);
              const storedTs = result.storedTimestamp || result.message?.timestamp || Date.now();
              if (this.latencyStartTimes.has(entry.message.id)) {
                const latency = Date.now() - this.latencyStartTimes.get(entry.message.id);
                this.updateLatencyStats(latency);
                this.latencyStartTimes.delete(entry.message.id);
              }
              this.pendingMessages.delete(entry.message.id);
              try { this.seenMessageIds.add(entry.message.id); } catch (e) {}
              await this.idbRemoveById(entry.message.id);
              entry.resolve && entry.resolve({ ...result.message, timestamp: storedTs });
            } catch (err) {
              console.warn('Persisted queued message failed via HTTP fallback', err);
              entry.reject && entry.reject(err);
              await this.idbRemoveById(entry.message.id);
            }
          }, this.config.sendFallbackTimeout);
          this.messageQueue.push(entry);
        }
      } catch (e) {
        console.warn('Failed to load persisted message queue (idb):', e);
      }
    })();
  }

  removeFromStorageById(id) {
    // remove persisted entry from IndexedDB
    try {
      if (typeof window === 'undefined' || !window.indexedDB) return;
      this.idbRemoveById(id);
    } catch (e) {
      console.warn('Failed to remove queued message from storage (idb):', e);
    }
  }

  // Adaptive tuning: record ack latency and adjust timeouts
  recordAckLatency(latency) {
    try {
      if (!Number.isFinite(latency) || latency <= 0) return;
      this.ackSamples.push(latency);
      if (this.ackSamples.length > this.ackSampleWindow) this.ackSamples.shift();
      // recompute average
      const sum = this.ackSamples.reduce((s, v) => s + v, 0);
      const avg = sum / this.ackSamples.length;
      this.averageLatency = Math.round(avg);
      this.adjustTimeouts();
    } catch (e) {
      console.warn('Failed to record ack latency', e);
    }
  }

  adjustTimeouts() {
    try {
      const avg = this.averageLatency || 0;
      // ackTimeout should be generous: 2x avg, clamped
      const newAck = Math.min(Math.max(Math.round(avg * 2.0), 2000), 20000);
      const newFallback = Math.min(Math.max(Math.round(avg * 1.25), 1500), 10000);
      this.config.ackTimeout = newAck;
      this.config.sendFallbackTimeout = newFallback;
    } catch (e) {
      console.warn('Failed to adjust timeouts', e);
    }
  }

  async init() {
    console.log('🚀 Starting Pragmatic Fast Messaging...');
    this.connectionStartTime = Date.now();
    
    // Cleanup any existing connections first
    this.disconnect();
    
  // Prefer Socket.io (lower latency) and fall back to SSE
  await this.connectSocketOrSSE();
    
    // Start heartbeat
    this.startHeartbeat();
    
  // Load any persisted queued messages from storage and process them
  await this.loadQueueFromStorage();
  // Process queued messages (no-op, queue entries handle their own timers)
  this.processMessageQueue();
  }

  // Helper: send message via socket and return ack/result
  sendViaSocket(message) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.socket) return reject(new Error('No socket'));
        let ackTimer = null;
        this.socket.emit('send_message', message, (resp) => {
          if (ackTimer) clearTimeout(ackTimer);
          if (resp && resp.success) {
            // record ack latency if we started timing
            try {
              const start = this.latencyStartTimes.get(message.id);
              if (start) this.recordAckLatency(Date.now() - start);
            } catch (e) {}
            resolve(resp);
          } else reject(new Error('Socket ack failed'));
        });

        // Ack timeout (configurable)
        ackTimer = setTimeout(() => reject(new Error('Socket ack timeout')), this.config.ackTimeout);
      } catch (e) {
        reject(e);
      }
    });
  }

  // Helper: send message over HTTP (fast path)
  async sendViaHttp(message) {
    const response = await fetch('/api/fast-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.jwtToken}`
      },
      body: JSON.stringify({
        action: 'send_message',
        room: this.config.room,
        message,
        senderConnectionId: this.connectionId || null
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
  }

  // Enqueue a message until socket connects; returns a promise resolved when message is sent
  enqueueUntilSocket(message) {
    return new Promise((resolve, reject) => {
      const entry = { message, resolve, reject, createdAt: Date.now(), fallbackTimer: null };

      // Start fallback timer — if socket doesn't connect within timeout, use HTTP
      entry.fallbackTimer = setTimeout(async () => {
        try {
          // If socket became available in the meantime, flush will handle it
          if (this.socket && this.socket.connected) return;
          const result = await this.sendViaHttp(message);
          // mark latency and pending state cleanup
          const storedTs = result.storedTimestamp || result.message?.timestamp || Date.now();
          if (this.latencyStartTimes.has(message.id)) {
            const latency = Date.now() - this.latencyStartTimes.get(message.id);
            this.updateLatencyStats(latency);
            this.latencyStartTimes.delete(message.id);
          }
          this.pendingMessages.delete(message.id);
          try { this.seenMessageIds.add(message.id); } catch (e) {}
          // Remove from persisted storage
          await this.idbRemoveById(message.id);
          // resolve preserved promise if attached
          const preserved = this.pendingPromises.get(message.id);
          if (preserved) {
            try { preserved.resolve({ ...result.message, timestamp: storedTs }); } catch (e) {}
            this.pendingPromises.delete(message.id);
          }
          entry.resolve({ ...result.message, timestamp: storedTs });
        } catch (err) {
          // Remove from storage to avoid stuck retries if HTTP consistently fails
          await this.idbRemoveById(message.id);
          const preserved = this.pendingPromises.get(message.id);
          if (preserved) {
            try { preserved.reject(err); } catch (e) {}
            this.pendingPromises.delete(message.id);
          }
          entry.reject(err);
        }
      }, this.config.sendFallbackTimeout);

  this.messageQueue.push(entry);
  // store promise handlers so callers or reconcilers can attach
  try { this.pendingPromises.set(message.id, { resolve, reject }); } catch (e) {}
  // Persist current queue
  this.persistQueueToStorage();
    });
  }

  // Flush queued messages via socket when it becomes available
  async flushMessageQueueForSocket() {
    if (!this.socket || !this.socket.connected) return;
    // Drain the queue (shallow copy to avoid mutation while iterating)
    const queue = this.messageQueue.slice();
    this.messageQueue = [];
    for (const entry of queue) {
      try {
        if (entry.fallbackTimer) clearTimeout(entry.fallbackTimer);
        const ack = await this.sendViaSocket(entry.message);
        const storedTs = ack.storedTimestamp || ack.message?.timestamp || Date.now();
        if (this.latencyStartTimes.has(entry.message.id)) {
          const latency = Date.now() - this.latencyStartTimes.get(entry.message.id);
          this.updateLatencyStats(latency);
          this.latencyStartTimes.delete(entry.message.id);
        }
        this.pendingMessages.delete(entry.message.id);
        try { this.seenMessageIds.add(entry.message.id); } catch (e) {}
        // Remove from persisted storage if present
        await this.idbRemoveById(entry.message.id);
        // resolve preserved promise if attached
        const preserved = this.pendingPromises.get(entry.message.id);
        if (preserved) {
          try { preserved.resolve({ ...ack.message, timestamp: storedTs }); } catch (e) {}
          this.pendingPromises.delete(entry.message.id);
        }
        entry.resolve && entry.resolve({ ...ack.message, timestamp: storedTs });
      } catch (err) {
        // If socket send failed, push back to queue for retry with some backoff
        console.warn('Failed to flush queued message via socket, re-queueing:', err);
        // small backoff: push back to messageQueue and keep its fallback timer
  this.messageQueue.push(entry);
  // Persist updated queue
  this.persistQueueToStorage();
      }
    }
  }

  // Allows callers to attach promise handlers to a queued message by id.
  // Returns a promise that resolves/rejects when the message is delivered or fails.
  attachPromiseForMessageId(id) {
    return new Promise((resolve, reject) => {
      try {
        // If entry already resolved in pendingPromises, return immediately
        if (this.pendingPromises.has(id)) {
          const preserved = this.pendingPromises.get(id);
          // wire through
          const origResolve = preserved.resolve;
          const origReject = preserved.reject;
          preserved.resolve = (...args) => { origResolve && origResolve(...args); resolve(...args); };
          preserved.reject = (...args) => { origReject && origReject(...args); reject(...args); };
          return;
        }

        // Otherwise, attach to map so when flush/fallback resolves, it will call us
        this.pendingPromises.set(id, { resolve, reject });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Try Socket.io first, fallback to SSE
  async connectSocketOrSSE() {
    // Attempt to dynamically load socket.io-client
    try {
  const { io } = await import('socket.io-client');
  const socketUrl = (typeof window !== 'undefined' && window?.__NEXT_DATA__?.env?.NEXT_PUBLIC_SOCKET_URL) || process.env.NEXT_PUBLIC_SOCKET_URL || null;
  const connectOpts = socketUrl ? { auth: { token: this.jwtToken }, path: '/api/socketio' } : { auth: { token: this.jwtToken }, path: '/api/socketio' };
  this.socket = socketUrl ? io(socketUrl, connectOpts) : io('/api/socketio', connectOpts);

      this.socket.on('connect', () => {
        console.log('✅ Socket.io connected', this.socket.id);
        this.isConnected = true;
        this.connectionId = this.socket.id;
  this.connectionHandlers.forEach(h => h(true, 0));
  // Flush any queued messages now that socket is available
  this.flushMessageQueueForSocket().catch(e => console.warn('Failed flushing queue on connect', e));
        // send presence
        this.sendPresenceUpdate(true);
      });

      this.socket.on('message', (data) => this.handleIncomingEvent(data));
      this.socket.on('typing', (data) => this.handleIncomingEvent({ ...data, type: 'typing' }));
      this.socket.on('presence', (data) => this.handleIncomingEvent({ ...data, type: 'presence' }));

      this.socket.on('disconnect', (reason) => {
        console.warn('⚠️ Socket.io disconnected:', reason);
        this.isConnected = false;
        this.connectionHandlers.forEach(h => h(false, 0));
        // fallback to SSE after a short delay
        setTimeout(() => this.connectSSE(), 500);
      });

      // If socket connects successfully within 2s, keep it
      const connected = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), this.config.socketConnectTimeout);
        this.socket.once('connect', () => { clearTimeout(t); resolve(true); });
      });

      if (!connected) {
        console.warn('Socket.io not available, falling back to SSE');
        try { this.socket.close(); } catch (e) {}
        this.socket = null;
        this.connectSSE();
      }
    } catch (err) {
      console.warn('Socket.io client not available, using SSE:', err);
      this.connectSSE();
    }
  }

  // ============================================
  // Server-Sent Events (Reliable & Fast)
  // ============================================
  
  connectSSE() {
    try {
      // Prevent multiple simultaneous OPEN connections
      if (this.eventSource) {
        try {
          // EventSource.OPEN === 1
          if (this.eventSource.readyState === 1) {
            console.log('🚫 Connection already open, skipping new connection.');
            return;
          }
        } catch (e) {
          // If accessing readyState throws, close and reset
          try { this.eventSource.close(); } catch (_) {}
        }
        // If we have a stale EventSource, close it before creating a new one
        try { this.eventSource.close(); } catch (_) {}
        this.eventSource = null;
      }
      
      console.log('📡 Connecting to real-time stream...');
      
      const url = new URL('/api/sse-chat', window.location.origin);
      url.searchParams.set('room', this.config.room);
      url.searchParams.set('username', this.username);
      if (this.lastEventId) {
        url.searchParams.set('lastEventId', this.lastEventId);
      }

      this.eventSource = new EventSource(url.toString());

      this.eventSource.onopen = () => {
        console.log('✅ SSE Connected!');
        this.isConnected = true;
        this.retryCount = 0;
        
        const connectionTime = Date.now() - this.connectionStartTime;
        console.log(`🎯 Connection established in ${connectionTime}ms`);
        
        // Send online presence when connected
        this.sendPresenceUpdate(true);
        
        // Notify connection handlers
        this.connectionHandlers.forEach(handler => handler(true, 0));
        
        // Send presence update
        this.sendPresenceUpdate(true);
      };

      // Listen for the server-assigned connection id
      this.eventSource.addEventListener('connected', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.connectionId) {
            this.connectionId = data.connectionId;
            console.log(`🔑 Assigned SSE connectionId: ${this.connectionId}`);
          }
        } catch (e) {
          console.warn('Failed to parse connected event', e);
        }
      });

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingEvent(data);
          this.lastEventId = event.lastEventId;
        } catch (error) {
          console.error('❌ Failed to parse SSE message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.warn('⚠️ SSE Connection error:', error);
        // Defensive: try closing the EventSource to force a clean reconnect
        try {
          if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
          }
        } catch (e) {
          console.warn('⚠️ Failed to close EventSource after error', e);
        }
        this.isConnected = false;
        // Notify connection handlers
        this.connectionHandlers.forEach(handler => handler(false, 0));
        // Schedule reconnect
        this.reconnectSSE();
      };

      // Handle specific event types
      this.eventSource.addEventListener('message', (event) => {
        this.handleMessageEvent(JSON.parse(event.data));
      });

      this.eventSource.addEventListener('typing', (event) => {
        this.handleTypingEvent(JSON.parse(event.data));
      });

      this.eventSource.addEventListener('presence', (event) => {
        this.handlePresenceEvent(JSON.parse(event.data));
      });

    } catch (error) {
      console.error('❌ Failed to establish SSE connection:', error);
      this.reconnectSSE();
    }
  }

  reconnectSSE() {
    if (this.retryCount >= this.config.maxRetries) {
      console.error('💀 Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000);
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.retryCount + 1})`);
    
    setTimeout(() => {
      this.retryCount++;
      this.connectSSE();
    }, delay);
  }

  // ============================================
  // Message Sending (Fast with Optimistic UI)
  // ============================================
  
  async sendMessage(text, replyTo = null, providedId = null) {
    if (!text?.trim()) return null;

    // Use provided ID for deduplication or generate new one
    const messageId = providedId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      id: messageId,
      text: text.trim(),
      username: this.username,
      timestamp: Date.now(),
      replyTo,
      type: 'message'
    };

    // Optimistic UI - show message immediately
    this.messageHandlers.forEach(handler => handler({
      ...message,
      isPending: true
    }));

    // Track latency
    this.latencyStartTimes.set(messageId, Date.now());
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);

    try {
      // If socket is connected, send via socket
      if (this.socket && this.socket.connected) {
        const ack = await this.sendViaSocket(message);
        const storedTs = ack.storedTimestamp || ack.message?.timestamp || Date.now();
        const latency = Date.now() - this.latencyStartTimes.get(messageId);
        this.updateLatencyStats(latency);
        this.latencyStartTimes.delete(messageId);
        this.pendingMessages.delete(messageId);
        try { this.seenMessageIds.add(messageId); } catch (e) {}
        return { ...ack.message, timestamp: storedTs };
      }

      // If socket isn't connected yet, enqueue until socket connects or fallback timer triggers
      if (!this.socket || !this.socket.connected) {
        return await this.enqueueUntilSocket(message);
      }

    } catch (error) {
      console.error('❌ Failed to send message:', error);
      
      // Mark as failed in UI
      this.messageHandlers.forEach(handler => handler({
        ...message,
        isFailed: true
      }));
      
      // Add to retry queue
      this.messageQueue.push(message);
      
      throw error;
    }
  }

  // ============================================
  // Typing Indicators (Fast & Throttled)
  // ============================================
  
  sendTyping(isTyping = true) {
    // Throttle typing indicators
    clearTimeout(this.typingTimeout);
    
    if (isTyping) {
      this.sendTypingUpdate(true);
      
      // Auto-stop typing after timeout
      this.typingTimeout = setTimeout(() => {
        this.sendTypingUpdate(false);
      }, this.config.typingTimeout);
    } else {
      this.sendTypingUpdate(false);
    }
  }

  async sendTypingUpdate(isTyping) {
    try {
      // Send via fast endpoint
      await fetch('/api/fast-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          action: 'typing',
          room: this.config.room,
          username: this.username,
          isTyping,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.warn('⚠️ Failed to send typing indicator:', error);
    }
  }

  // ============================================
  // Event Handlers
  // ============================================
  
  handleIncomingEvent(data) {
    switch (data.type) {
      case 'message':
        this.handleMessageEvent(data);
        break;
      case 'typing':
        this.handleTypingEvent(data);
        break;
      case 'presence':
        this.handlePresenceEvent(data);
        break;
      case 'ack':
        this.handleAckEvent(data);
        break;
    }
  }

  handleMessageEvent(data) {
    // Debug: log all received messages
    console.log('📨 [PRAGMATIC] Received message event:', data);
    // Message deduplication check
    if (this.seenMessageIds.has(data.id)) {
      console.log('🚫 [PRAGMATIC] Duplicate message prevented:', data.id);
      return;
    }
    // Add to seen messages (keep last 1000 to prevent memory leaks)
    this.seenMessageIds.add(data.id);
    if (this.seenMessageIds.size > 1000) {
      const firstId = this.seenMessageIds.values().next().value;
      this.seenMessageIds.delete(firstId);
    }
    // Remove from pending if it's our message
    if (this.pendingMessages.has(data.id)) {
      this.pendingMessages.delete(data.id);
      // Calculate round-trip latency
      if (this.latencyStartTimes.has(data.id)) {
        const latency = Date.now() - this.latencyStartTimes.get(data.id);
  this.updateLatencyStats(latency);
  this.recordAckLatency(latency);
        this.latencyStartTimes.delete(data.id);
        console.log(`🔄 Round-trip latency: ${latency}ms`);
      }
    }
    // Notify handlers
    this.messageHandlers.forEach(handler => handler({
      ...data,
      isPending: false,
      isFailed: false
    }));
  }

  handleTypingEvent(data) {
    if (data.username === this.username) return; // Ignore own typing
    
    this.typingHandlers.forEach(handler => handler(data));
  }

  handlePresenceEvent(data) {
    this.presenceHandlers.forEach(handler => handler(data));
  }

  handleAckEvent(data) {
    console.log(`✅ Message acknowledged: ${data.messageId}`);
    // Clear pending and mark message as seen
    try {
      const id = data.messageId;
      if (this.pendingMessages.has(id)) {
        this.pendingMessages.delete(id);
      }
      this.seenMessageIds.add(id);

      // If we tracked latency start, compute persisted latency
      if (this.latencyStartTimes.has(id)) {
        const latency = Date.now() - this.latencyStartTimes.get(id);
  this.updateLatencyStats(latency);
  this.recordAckLatency(latency);
  this.latencyStartTimes.delete(id);
  console.log(`🔔 Persisted latency: ${latency}ms`);
      }
    } catch (e) {
      console.warn('Failed to process ack event', e);
    }
  }

  // ============================================
  // Performance & Reliability
  // ============================================
  
  updateLatencyStats(latency) {
    this.averageLatency = this.averageLatency === 0 
      ? latency 
      : (this.averageLatency + latency) / 2;
  }

  async processMessageQueue() {
  // Message queue entries manage their own fallback timers and will be flushed
  // when a socket connects. No periodic sweeping required here.
  return;
  }

  startHeartbeat() {
    setInterval(() => {
      if (this.isConnected) {
        this.sendPresenceUpdate(true);
      }
    }, this.config.heartbeatInterval);
  }

  async sendPresenceUpdate(isOnline) {
    try {
      await fetch('/api/fast-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          action: 'presence',
          room: this.config.room,
          username: this.username,
          isOnline,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.warn('⚠️ Failed to send presence update:', error);
    }
  }

  // ============================================
  // Public API
  // ============================================
  
  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onTyping(handler) {
    this.typingHandlers.add(handler);
    return () => this.typingHandlers.delete(handler);
  }

  onPresence(handler) {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  onConnectionChange(handler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  getStats() {
    return {
      isConnected: this.isConnected,
      averageLatency: Math.round(this.averageLatency),
      pendingMessages: this.pendingMessages.size,
      queuedMessages: this.messageQueue.length,
      retryCount: this.retryCount
    };
  }

  disconnect() {
    console.log('🛑 Disconnecting...');
    
    // Close SSE connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // Clear timeouts
    clearTimeout(this.typingTimeout);
    clearTimeout(this.reconnectTimeout);
    clearInterval(this.heartbeatInterval);
    
    // Reset state
    this.isConnected = false;
    this.retryCount = 0;
    this.lastEventId = null;
    
    // Send offline presence
    if (this.isConnected) {
      this.sendPresenceUpdate(false);
    }
  }
}

export default PragmaticFastMessaging;
