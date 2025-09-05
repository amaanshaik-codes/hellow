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
    this.messageQueue = [];
    this.typingTimeout = null;
    
    // Performance tracking
    this.latencyStartTimes = new Map();
    this.averageLatency = 0;
    this.connectionStartTime = null;

    this.init();
  }

  async init() {
    console.log('🚀 Starting Pragmatic Fast Messaging...');
    this.connectionStartTime = Date.now();
    
    // Cleanup any existing connections first
    this.disconnect();
    
    // Start Server-Sent Events connection
    this.connectSSE();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Process queued messages
    this.processMessageQueue();
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
      // Send via HTTP (reliable)
      const response = await fetch('/api/fast-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          action: 'send_message',
          room: this.config.room,
          message
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Calculate latency
        const latency = Date.now() - this.latencyStartTimes.get(messageId);
        this.updateLatencyStats(latency);
        this.latencyStartTimes.delete(messageId);
        
        console.log(`📤 Message sent in ${latency}ms`);
        return result.message;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
    // Retry failed messages every 5 seconds
    setInterval(() => {
      if (this.messageQueue.length > 0 && this.isConnected) {
        const message = this.messageQueue.shift();
        console.log('🔄 Retrying message:', message.id);
        this.sendMessage(message.text);
      }
    }, 5000);
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
