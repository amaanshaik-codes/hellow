/**
 * Hybrid Message Delivery System
 * Combines SSE real-time updates with HTTP polling fallback
 * Ensures messages are delivered even when SSE connections are unstable
 */

export class HybridMessageDelivery {
  constructor(username, jwtToken, room = 'ammu-vero-private-room') {
    this.username = username;
    this.jwtToken = jwtToken;
    this.room = room;
    
    // State
    this.lastMessageId = null;
    this.pollingInterval = null;
    this.isPolling = false;
    
    // Callbacks
    this.onMessage = null;
    this.onTyping = null;
    this.onPresence = null;
  }

  startPolling() {
    if (this.isPolling) return;
    
    console.log('🔄 Starting fallback message polling...');
    this.isPolling = true;
    
    // Poll every 2 seconds when SSE is down
    this.pollingInterval = setInterval(() => {
      this.pollForMessages();
    }, 2000);
  }

  stopPolling() {
    if (!this.isPolling) return;
    
    console.log('⏹️ Stopping message polling');
    this.isPolling = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async pollForMessages() {
    try {
      const url = `/api/fast-chat?action=getMessages&room=${this.room}&since=${this.lastMessageId || 0}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.messages && data.messages.length > 0) {
          console.log(`📦 Polled ${data.messages.length} new messages`);
          
          data.messages.forEach(message => {
            if (this.onMessage) {
              this.onMessage(message);
            }
            this.lastMessageId = Math.max(this.lastMessageId || 0, message.timestamp);
          });
        }
      }
    } catch (error) {
      console.warn('⚠️ Polling failed:', error);
    }
  }

  async getRecentMessages(since = 0) {
    try {
      const response = await fetch(`/api/fast-chat?action=getMessages&room=${this.room}&since=${since}`, {
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.messages || [];
      }
    } catch (error) {
      console.warn('⚠️ Failed to get recent messages:', error);
    }
    
    return [];
  }

  destroy() {
    this.stopPolling();
  }
}

export default HybridMessageDelivery;
