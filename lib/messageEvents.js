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
    console.log(`📡 [EVENT] Broadcasting new message in ${room} to ${this.listeners.get(room)?.size || 0} listeners`);
    
    if (this.listeners.has(room)) {
      const roomListeners = this.listeners.get(room);
      for (const callback of roomListeners) {
        try {
          callback(message);
        } catch (error) {
          console.error(`❌ [EVENT] Error in message listener:`, error);
          // Remove broken listener
          roomListeners.delete(callback);
        }
      }
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
