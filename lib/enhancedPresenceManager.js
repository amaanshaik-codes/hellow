/**
 * Enhanced Presence Manager
 * Provides accurate online/offline detection with last seen timestamps
 * Handles connection drops, heartbeats, and offline detection
 */

export class EnhancedPresenceManager {
  constructor(username, jwtToken, room = 'ammu-vero-private-room') {
    this.username = username;
    this.jwtToken = jwtToken;
    this.room = room;
    
    // State
    this.isOnline = false;
    this.lastSeen = Date.now();
    this.heartbeatInterval = null;
    this.offlineDetectionInterval = null;
    
    // Callbacks
    this.onPresenceChange = null;
    
    // Start monitoring
    this.startPresenceMonitoring();
  }

  startPresenceMonitoring() {
    // Send heartbeat every 15 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 15000);

    // Check for offline users every 45 seconds (3 missed heartbeats = offline)
    this.offlineDetectionInterval = setInterval(() => {
      this.checkOfflineUsers();
    }, 45000);

    // Initial presence update
    this.setOnline();
  }

  async setOnline() {
    this.isOnline = true;
    this.lastSeen = Date.now();
    await this.sendPresenceUpdate(true);
  }

  async setOffline() {
    this.isOnline = false;
    this.lastSeen = Date.now();
    await this.sendPresenceUpdate(false);
  }

  async sendHeartbeat() {
    if (this.isOnline) {
      this.lastSeen = Date.now();
      await this.sendPresenceUpdate(true);
    }
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
          room: this.room,
          username: this.username,
          isOnline,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.warn('⚠️ Failed to send presence update:', error);
    }
  }

  async checkOfflineUsers() {
    try {
      const response = await fetch(`/api/fast-chat?action=getPresence&room=${this.room}`, {
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`
        }
      });
      const data = await response.json();
      
      if (data.presence && this.onPresenceChange) {
        // Check each user's last activity
        const now = Date.now();
        const offlineThreshold = 60000; // 1 minute offline threshold
        
        Object.entries(data.presence).forEach(([username, presenceData]) => {
          if (username !== this.username) {
            const timeSinceLastSeen = now - presenceData.lastSeen;
            const shouldBeOffline = timeSinceLastSeen > offlineThreshold;
            
            if (presenceData.isOnline && shouldBeOffline) {
              console.log(`🔴 [PRESENCE] ${username} detected offline (${Math.round(timeSinceLastSeen/1000)}s inactive)`);
              // Update to offline
              this.markUserOffline(username, presenceData.lastSeen);
            }
            
            // Notify of presence change
            this.onPresenceChange({
              username,
              isOnline: presenceData.isOnline && !shouldBeOffline,
              lastSeen: presenceData.lastSeen
            });
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ Failed to check offline users:', error);
    }
  }

  async markUserOffline(username, lastSeen) {
    try {
      // Update their presence to offline in the database
      await fetch('/api/fast-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          action: 'markOffline',
          room: this.room,
          username: username,
          lastSeen: lastSeen
        })
      });
    } catch (error) {
      console.warn('⚠️ Failed to mark user offline:', error);
    }
  }

  destroy() {
    clearInterval(this.heartbeatInterval);
    clearInterval(this.offlineDetectionInterval);
    this.setOffline(); // Mark as offline when destroying
  }
}

export default EnhancedPresenceManager;
