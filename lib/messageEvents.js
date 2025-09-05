// Global message event system for real-time notifications
class MessageEventManager {
  constructor() {
    this.listeners = new Map(); // room -> Set of callback functions
  }

  // Add a listener for a specific room
  addListener(room, callback) {
    if (!this.listeners.has(room)) {
      this.listeners.set(room, new Set());
    }
    this.listeners.get(room).add(callback);
    
    console.log(`📡 [EVENT] Added listener for room ${room}. Total: ${this.listeners.get(room).size}`);
  }

  // Remove a listener
  removeListener(room, callback) {
    if (this.listeners.has(room)) {
      this.listeners.get(room).delete(callback);
      if (this.listeners.get(room).size === 0) {
        this.listeners.delete(room);
      }
      console.log(`📡 [EVENT] Removed listener for room ${room}`);
    }
  }

  // Notify all listeners about a new message
  notifyNewMessage(room, message) {
    const listenerCount = this.listeners.get(room)?.size || 0;
    console.log(`📡 [EVENT] Broadcasting new message in ${room} to ${listenerCount} listeners`);
    
    if (this.listeners.has(room)) {
      const roomListeners = this.listeners.get(room);
      const listenersToRemove = new Set();
      
      for (const callback of roomListeners) {
        try {
          // Execute callback immediately for instant delivery
          callback(message);
          console.log(`✅ [EVENT] Successfully notified listener in ${room}`);
        } catch (error) {
          console.error(`❌ [EVENT] Error in message listener:`, error);
          // Mark broken listener for removal
          listenersToRemove.add(callback);
        }
      }
      
      // Remove broken listeners
      for (const brokenCallback of listenersToRemove) {
        roomListeners.delete(brokenCallback);
      }
      
      if (listenersToRemove.size > 0) {
        console.log(`🧹 [EVENT] Removed ${listenersToRemove.size} broken listeners from ${room}`);
      }
    } else {
      console.warn(`⚠️ [EVENT] No listeners found for room ${room}`);
    }
  }

  // Get current stats
  getStats() {
    const stats = {};
    for (const [room, listeners] of this.listeners.entries()) {
      stats[room] = listeners.size;
    }
    return stats;
  }
}

// Global instance (singleton pattern for serverless)
global.messageEventManager = global.messageEventManager || new MessageEventManager();

export default global.messageEventManager;
