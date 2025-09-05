/**
 * Pragmatic Fast Messaging System
 * Uses proven techniques that actually work in production
 * Server-Sent Events + Optimistic UI + Smart Caching
 */

export class PragmaticFastMessaging {
  constructor(username, jwtToken, config = {}) {
    this.username = username;
    this.jwtToken = jwtToken;
    this.config = {
      room: 'ammu-vero-private-room',
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
        this.isConnected = false;
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
  
  async sendMessage(text) {
    if (!text?.trim()) return null;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      id: messageId,
      text: text.trim(),
      username: this.username,
      timestamp: Date.now(),
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
    
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    clearTimeout(this.typingTimeout);
    this.isConnected = false;
    
    // Send offline presence
    this.sendPresenceUpdate(false);
  }
}

export default PragmaticFastMessaging;
