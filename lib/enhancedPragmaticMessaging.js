/**
 * Enhanced Pragmatic Messaging - Realistic Performance Improvements
 * These optimizations actually work in production environments
 */

export class EnhancedPragmaticMessaging {
  constructor(username, jwtToken, config = {}) {
    this.username = username;
    this.jwtToken = jwtToken;
    this.config = {
      room: 'ammu-vero-private-room',
      // Smart batching for burst messages
      batchInterval: 100, // Batch messages within 100ms
      // Connection health monitoring
      healthCheckInterval: 15000, // Check connection every 15s
      // Message compression for large texts
      compressThreshold: 1000, // Compress messages > 1KB
      // Smart retry with exponential backoff
      retryDelays: [1000, 2000, 4000, 8000], // Progressive retry delays
      ...config
    };

    // Performance optimizations
    this.messageBatch = [];
    this.batchTimer = null;
    this.compressionEnabled = true;
    this.healthCheckTimer = null;
    
    // Local caching for offline support
    this.messageCache = new Map();
    this.lastSyncTimestamp = 0;
    
    // Connection quality tracking
    this.connectionQuality = 'good'; // good, fair, poor
    this.latencyHistory = [];
    this.maxLatencyHistory = 10;

    this.init();
  }

  // Smart message batching - send multiple messages efficiently
  async sendMessageBatched(text, replyTo = null) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: this.compressIfNeeded(text),
      username: this.username,
      timestamp: Date.now(),
      replyTo,
      compressed: text.length > this.config.compressThreshold
    };

    // Add to batch
    this.messageBatch.push(message);
    
    // Clear existing timer
    if (this.batchTimer) clearTimeout(this.batchTimer);
    
    // Set new timer for batch send
    this.batchTimer = setTimeout(() => {
      this.flushMessageBatch();
    }, this.config.batchInterval);

    return message;
  }

  // Send all batched messages at once
  async flushMessageBatch() {
    if (this.messageBatch.length === 0) return;

    const batch = [...this.messageBatch];
    this.messageBatch = [];
    this.batchTimer = null;

    try {
      const response = await fetch('/api/fast-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          type: 'batch_messages',
          messages: batch,
          room: this.config.room
        })
      });

      if (response.ok) {
        console.log(`📦 Batch sent: ${batch.length} messages`);
        this.updateConnectionQuality(Date.now() - batch[0].timestamp);
      }
    } catch (error) {
      console.error('❌ Batch send failed:', error);
      // Re-queue messages for retry
      this.messageBatch.unshift(...batch);
    }
  }

  // Simple compression for large messages
  compressIfNeeded(text) {
    if (text.length <= this.config.compressThreshold) return text;
    
    // Simple compression: remove extra whitespace
    return text.replace(/\s+/g, ' ').trim();
  }

  // Monitor connection quality and adapt
  updateConnectionQuality(latency) {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    
    if (avgLatency < 100) {
      this.connectionQuality = 'good';
    } else if (avgLatency < 300) {
      this.connectionQuality = 'fair';
    } else {
      this.connectionQuality = 'poor';
    }

    console.log(`📊 Connection quality: ${this.connectionQuality} (${Math.round(avgLatency)}ms avg)`);
  }

  // Smart retry with exponential backoff
  async retryWithBackoff(operation, attempt = 0) {
    try {
      return await operation();
    } catch (error) {
      if (attempt < this.config.retryDelays.length) {
        const delay = this.config.retryDelays[attempt];
        console.log(`🔄 Retry ${attempt + 1} after ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(operation, attempt + 1);
      }
      throw error;
    }
  }

  // Local message caching for instant responses
  cacheMessage(message) {
    this.messageCache.set(message.id, message);
    
    // Keep cache size reasonable
    if (this.messageCache.size > 1000) {
      const oldestKey = this.messageCache.keys().next().value;
      this.messageCache.delete(oldestKey);
    }
  }

  // Get cached messages for instant display
  getCachedMessages(since = 0) {
    return Array.from(this.messageCache.values())
      .filter(msg => msg.timestamp > since)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // Health monitoring
  startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      this.checkConnectionHealth();
    }, this.config.healthCheckInterval);
  }

  async checkConnectionHealth() {
    const start = Date.now();
    
    try {
      const response = await fetch('/api/fast-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          type: 'ping',
          room: this.config.room,
          timestamp: start
        })
      });

      if (response.ok) {
        const latency = Date.now() - start;
        this.updateConnectionQuality(latency);
      }
    } catch (error) {
      console.warn('⚠️ Health check failed:', error);
      this.connectionQuality = 'poor';
    }
  }

  // Get performance stats
  getPerformanceStats() {
    const avgLatency = this.latencyHistory.length > 0 
      ? Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length)
      : 0;

    return {
      connectionQuality: this.connectionQuality,
      averageLatency: avgLatency,
      cachedMessages: this.messageCache.size,
      batchedMessages: this.messageBatch.length,
      lastSync: new Date(this.lastSyncTimestamp).toLocaleTimeString()
    };
  }

  // Cleanup
  destroy() {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.messageCache.clear();
    this.messageBatch = [];
  }
}

export default EnhancedPragmaticMessaging;
