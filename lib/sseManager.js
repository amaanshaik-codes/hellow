/**
 * Advanced Server-Sent Events Manager
 * Best-in-class real-time messaging with automatic fallbacks,
 * connection recovery, and sophisticated message delivery guarantees
 */
import { kv } from '@vercel/kv';

export class SSEManager {
  constructor(username, roomId, config = {}) {
    this.username = username;
    this.roomId = roomId;
    this.config = {
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatTimeout: 60000,
      messageTimeout: 10000,
      bufferSize: 100,
      ...config
    };
    
    // Connection state
    this.eventSource = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.lastHeartbeat = 0;
    this.connectionQuality = 'good'; // good, poor, offline
    
    // Message handling
    this.messageBuffer = new Map(); // id -> message
    this.pendingMessages = new Set(); // message IDs waiting for delivery confirmation
    this.deliveryCallbacks = new Map(); // message ID -> callback
    this.lastMessageTimestamp = 0;
    this.messageQueue = []; // Queue for messages when offline
    
    // Event handlers
    this.onMessage = null;
    this.onPresence = null;
    this.onTyping = null;
    this.onConnectionChange = null;
    this.onError = null;
    
    // Timers
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.presenceTimer = null;
    this.messageTimeoutTimer = null;
    
    // Initialize
    this.init();
  }

  init() {
    console.log(`🚀 [SSE] Initializing SSE Manager for ${this.username} in room ${this.roomId}`);
    this.connect();
    this.startPresenceHeartbeat();
    this.startHeartbeatMonitor();
  }

  connect() {
    if (this.isConnecting || this.isConnected) {
      console.log(`⚠️ [SSE] Already connecting/connected, skipping...`);
      return;
    }

    this.isConnecting = true;
    
    try {
      const url = new URL('/api/realtime-sse', window.location.origin);
      url.searchParams.set('room', this.roomId);
      url.searchParams.set('username', this.username);
      url.searchParams.set('since', this.lastMessageTimestamp.toString());
      
      console.log(`🔗 [SSE] Connecting to: ${url.toString()}`);
      
      this.eventSource = new EventSource(url.toString());
      
      this.eventSource.onopen = () => {
        console.log(`✅ [SSE] Connected successfully`);
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.connectionQuality = 'good';
        this.updateConnectionStatus('connected');
        this.processMessageQueue();
      };
      
      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event);
      };
      
      this.eventSource.onerror = (error) => {
        console.error(`❌ [SSE] Connection error:`, error);
        
        // Check if this is a network error vs server error
        if (this.eventSource.readyState === EventSource.CLOSED) {
          console.log(`🔌 [SSE] Connection closed by server, will reconnect`);
        } else if (this.eventSource.readyState === EventSource.CONNECTING) {
          console.log(`🔄 [SSE] Connection lost while connecting, will retry`);
        }
        
        this.isConnected = false;
        this.isConnecting = false;
        this.connectionQuality = 'poor';
        this.updateConnectionStatus('error');
        
        // Close the current connection before reconnecting
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        
        this.scheduleReconnect();
      };
      
    } catch (error) {
      console.error(`❌ [SSE] Failed to create EventSource:`, error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  handleSSEMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.lastHeartbeat = Date.now();
      
      switch (data.type) {
        case 'connected':
          console.log(`🔗 [SSE] Server confirmed connection`);
          break;
          
        case 'messages':
          this.handleIncomingMessages(data.messages);
          break;
          
        case 'presence':
          this.handlePresenceUpdate(data);
          break;
          
        case 'typing':
          this.handleTypingUpdate(data);
          break;
          
        case 'delivery_confirmation':
          this.handleDeliveryConfirmation(data);
          break;
          
        case 'heartbeat':
          // Update heartbeat and confirm connection is alive
          console.log(`💓 [SSE] Heartbeat received, connection stable`);
          this.connectionQuality = 'good';
          this.updateConnectionStatus('connected');
          break;
          
        default:
          console.log(`🔍 [SSE] Unknown message type: ${data.type}`, data);
      }
    } catch (error) {
      console.error(`❌ [SSE] Failed to parse message:`, error, event.data);
    }
  }

  handleIncomingMessages(messages) {
    if (!Array.isArray(messages)) return;
    
    console.log(`📨 [SSE] Received ${messages.length} messages`);
    
    const newMessages = [];
    
    for (const message of messages) {
      // Skip if we already have this message
      if (this.messageBuffer.has(message.id)) {
        continue;
      }
      
      // Add to buffer
      this.messageBuffer.set(message.id, message);
      
      // Update last message timestamp
      if (message.timestamp > this.lastMessageTimestamp) {
        this.lastMessageTimestamp = message.timestamp;
      }
      
      // Only forward messages from other users
      if (message.username !== this.username) {
        newMessages.push(message);
      }
    }
    
    // Trim buffer if too large
    if (this.messageBuffer.size > this.config.bufferSize) {
      const entries = Array.from(this.messageBuffer.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      this.messageBuffer.clear();
      entries.slice(0, this.config.bufferSize).forEach(([id, msg]) => {
        this.messageBuffer.set(id, msg);
      });
    }
    
    // Call message handler
    if (newMessages.length > 0 && this.onMessage) {
      this.onMessage(newMessages);
    }
  }

  handlePresenceUpdate(data) {
    console.log(`👥 [SSE] Presence update:`, data);
    if (this.onPresence) {
      this.onPresence(data);
    }
  }

  handleTypingUpdate(data) {
    console.log(`⌨️ [SSE] Typing update:`, data);
    if (this.onTyping) {
      this.onTyping(data);
    }
  }

  handleDeliveryConfirmation(data) {
    const { messageId, status } = data;
    console.log(`✅ [SSE] Delivery confirmation for ${messageId}: ${status}`);
    
    // Remove from pending
    this.pendingMessages.delete(messageId);
    
    // Call delivery callback
    const callback = this.deliveryCallbacks.get(messageId);
    if (callback) {
      callback(status);
      this.deliveryCallbacks.delete(messageId);
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`❌ [SSE] Max reconnection attempts reached`);
      this.connectionQuality = 'offline';
      this.updateConnectionStatus('failed');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    
    console.log(`🔄 [SSE] Scheduling reconnect #${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.disconnect();
      this.connect();
    }, delay);
  }

  async sendMessage(message) {
    console.log(`📤 [SSE] Sending message:`, message);
    
    // Check if we have a valid token
    const token = this.getUserToken();
    if (!token) {
      console.error(`❌ [SSE] No authentication token available`);
      return { success: false, error: 'No authentication token' };
    }
    
    // Add to pending messages
    this.pendingMessages.add(message.id);
    
    // Set timeout for delivery confirmation
    const timeoutId = setTimeout(() => {
      if (this.pendingMessages.has(message.id)) {
        console.warn(`⚠️ [SSE] Message delivery timeout: ${message.id}`);
        this.pendingMessages.delete(message.id);
        
        const callback = this.deliveryCallbacks.get(message.id);
        if (callback) {
          callback('timeout');
          this.deliveryCallbacks.delete(message.id);
        }
      }
    }, this.config.messageTimeout);

    try {
      console.log(`🔐 [SSE] Sending with token: ${token.substring(0, 20)}...`);
      
      const response = await fetch('/api/messages/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...message,
          roomId: this.roomId,
          timestamp: Date.now()
        })
      });
      
      console.log(`📡 [SSE] API Response status: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ [SSE] Message sent successfully:`, result);
        
        // Update last message timestamp
        if (result.message && result.message.timestamp > this.lastMessageTimestamp) {
          this.lastMessageTimestamp = result.message.timestamp;
        }
        
        clearTimeout(timeoutId);
        return { success: true, result };
      } else {
        const errorText = await response.text();
        console.error(`❌ [SSE] API Error: ${response.status} - ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      console.error(`❌ [SSE] Failed to send message:`, error);
      clearTimeout(timeoutId);
      
      // Add to queue for retry when connection is restored
      if (!this.isConnected) {
        this.messageQueue.push(message);
        console.log(`📦 [SSE] Message queued for retry`);
      }
      
      return { success: false, error: error.message || error };
    }
  }  async sendTyping(isTyping) {
    if (!this.isConnected) return;
    
    try {
      const otherUser = this.username === 'ammu' ? 'vero' : 'ammu';
      await fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          targetUser: otherUser,
          isTyping,
          roomId: this.roomId
        })
      });
    } catch (error) {
      console.error(`❌ [SSE] Failed to send typing indicator:`, error);
    }
  }

  async sendReadReceipt(roomId, readTime) {
    if (!this.isConnected) return;
    
    try {
      // Send read receipt notification via SSE
      console.log(`📖 [SSE] Sending read receipt for ${this.username} at ${readTime}`);
      
      // This will be sent as a special message type to notify the other user
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          room: roomId,
          status: 'read',
          lastReadTime: readTime,
          type: 'read_receipt'
        })
      });
    } catch (error) {
      console.error(`❌ [SSE] Failed to send read receipt:`, error);
    }
  }

  async updatePresence(status) {
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          room: this.roomId,
          status: status === 'heartbeat' ? 'online' : status
        })
      });
    } catch (error) {
      console.error(`❌ [SSE] Failed to update presence:`, error);
    }
  }

  processMessageQueue() {
    if (this.messageQueue.length === 0) return;
    
    console.log(`📦 [SSE] Processing ${this.messageQueue.length} queued messages`);
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const message of messages) {
      this.sendMessage(message);
    }
  }

  startPresenceHeartbeat() {
    this.updatePresence('online');
    
    this.presenceTimer = setInterval(() => {
      this.updatePresence('heartbeat');
    }, 30000); // Every 30 seconds
  }

  startHeartbeatMonitor() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;
      
      if (timeSinceLastHeartbeat > this.config.heartbeatTimeout) {
        console.warn(`💔 [SSE] Heartbeat timeout (${timeSinceLastHeartbeat}ms)`);
        this.connectionQuality = 'poor';
        this.updateConnectionStatus('timeout');
        
        // Force reconnection
        this.disconnect();
        this.connect();
      }
    }, 15000); // Check every 15 seconds
  }

  updateConnectionStatus(status) {
    const statusInfo = {
      status,
      quality: this.connectionQuality,
      reconnectAttempts: this.reconnectAttempts,
      pendingMessages: this.pendingMessages.size,
      queuedMessages: this.messageQueue.length,
      isConnected: this.isConnected
    };
    
    console.log(`🔄 [SSE] Connection status update:`, statusInfo);
    
    if (this.onConnectionChange) {
      this.onConnectionChange(statusInfo);
    }
  }

  disconnect() {
    console.log(`🔌 [SSE] Disconnecting...`);
    
    this.isConnected = false;
    this.isConnecting = false;
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.updateConnectionStatus('disconnected');
  }

  destroy() {
    console.log(`🔥 [SSE] Destroying SSE Manager`);
    
    // Update presence to offline
    this.updatePresence('offline');
    
    // Clear all timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.messageTimeoutTimer) {
      clearTimeout(this.messageTimeoutTimer);
      this.messageTimeoutTimer = null;
    }
    
    // Disconnect
    this.disconnect();
    
    // Clear data
    this.messageBuffer.clear();
    this.pendingMessages.clear();
    this.deliveryCallbacks.clear();
    this.messageQueue = [];
    
    // Remove event handlers
    this.onMessage = null;
    this.onPresence = null;
    this.onTyping = null;
    this.onConnectionChange = null;
    this.onError = null;
  }

  // Helper methods
  getUserToken() {
    return localStorage.getItem('hellow_token') || '';
  }

  getConnectionInfo() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      quality: this.connectionQuality,
      reconnectAttempts: this.reconnectAttempts,
      pendingMessages: this.pendingMessages.size,
      queuedMessages: this.messageQueue.length,
      bufferSize: this.messageBuffer.size,
      lastHeartbeat: this.lastHeartbeat,
      lastMessageTimestamp: this.lastMessageTimestamp
    };
  }

  // Advanced features
  async getMessageHistory(limit = 50) {
    try {
      const response = await fetch(`/api/messages/store?roomId=${this.roomId}&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${this.getUserToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.messages || [];
      }
    } catch (error) {
      console.error(`❌ [SSE] Failed to get message history:`, error);
    }
    
    return [];
  }

  async markMessageAsRead(messageId) {
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getUserToken()}`
        },
        body: JSON.stringify({
          messageId,
          roomId: this.roomId,
          username: this.username
        })
      });
    } catch (error) {
      console.error(`❌ [SSE] Failed to mark message as read:`, error);
    }
  }

  // Message delivery tracking
  onMessageDelivery(messageId, callback) {
    this.deliveryCallbacks.set(messageId, callback);
  }

  // Event handler setters
  setMessageHandler(handler) {
    this.onMessage = handler;
  }

  setPresenceHandler(handler) {
    this.onPresence = handler;
  }

  setTypingHandler(handler) {
    this.onTyping = handler;
  }

  setConnectionHandler(handler) {
    this.onConnectionChange = handler;
  }

  setErrorHandler(handler) {
    this.onError = handler;
  }
}

export default SSEManager;
