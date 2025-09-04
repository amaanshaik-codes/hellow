// Auto-logout utility for inactivity detection
export class AutoLogoutManager {
  constructor(timeoutMinutes = 5, onLogout = null) {
    this.timeoutMs = timeoutMinutes * 60 * 1000; // Convert to milliseconds
    this.onLogout = onLogout;
    this.activityTimeout = null;
    this.lastActivityKey = 'hellow_last_activity';
    this.logoutCheckInterval = null;
    
    this.init();
  }
  
  init() {
    console.log(`🔒 Auto-logout initialized: ${this.timeoutMs / 1000 / 60} minutes`);
    
    // Update activity timestamp immediately
    this.updateActivity();
    
    // Set up activity listeners
    this.setupActivityListeners();
    
    // Set up periodic checks (every 30 seconds)
    this.logoutCheckInterval = setInterval(() => {
      this.checkForInactivity();
    }, 30000);
    
    // Check immediately on init (handles refresh case)
    setTimeout(() => this.checkForInactivity(), 1000);
  }
  
  setupActivityListeners() {
    const events = [
      'mousedown',
      'mousemove', 
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown',
      'focus'
    ];
    
    events.forEach(event => {
      document.addEventListener(event, this.handleActivity.bind(this), true);
    });
    
    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.handleActivity();
      }
    });
    
    // Handle window focus
    window.addEventListener('focus', this.handleActivity.bind(this));
  }
  
  handleActivity() {
    this.updateActivity();
    this.resetTimeout();
  }
  
  updateActivity() {
    const now = Date.now();
    localStorage.setItem(this.lastActivityKey, now.toString());
    // console.log(`🔄 Activity updated: ${new Date(now).toLocaleTimeString()}`);
  }
  
  resetTimeout() {
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }
    
    this.activityTimeout = setTimeout(() => {
      console.log('⏰ Auto-logout triggered by inactivity');
      this.performLogout();
    }, this.timeoutMs);
  }
  
  checkForInactivity() {
    const lastActivity = localStorage.getItem(this.lastActivityKey);
    
    if (!lastActivity) {
      console.log('🔒 No activity record found, logging out');
      this.performLogout();
      return;
    }
    
    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime;
    
    console.log(`🕐 Time since last activity: ${Math.round(timeSinceLastActivity / 1000 / 60)}m`);
    
    if (timeSinceLastActivity > this.timeoutMs) {
      console.log(`⏰ Auto-logout: ${Math.round(timeSinceLastActivity / 1000 / 60)}m > ${this.timeoutMs / 1000 / 60}m`);
      this.performLogout();
    }
  }
  
  performLogout() {
    console.log('🚪 Performing auto-logout...');
    
    // Clear all authentication data
    localStorage.removeItem('hellow_token');
    localStorage.removeItem('hellow_user');
    localStorage.removeItem('hellow_displayName');
    localStorage.removeItem(this.lastActivityKey);
    
    // Clear any other session data
    localStorage.removeItem('installPromptDismissed');
    
    // Call the logout callback if provided
    if (this.onLogout && typeof this.onLogout === 'function') {
      this.onLogout('AUTO_LOGOUT_INACTIVITY');
    }
    
    // Force page reload to trigger login screen
    window.location.reload();
  }
  
  // Get remaining time until auto-logout
  getRemainingTime() {
    const lastActivity = localStorage.getItem(this.lastActivityKey);
    if (!lastActivity) return 0;
    
    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime;
    const remaining = this.timeoutMs - timeSinceLastActivity;
    
    return Math.max(0, remaining);
  }
  
  // Get remaining time in human readable format
  getRemainingTimeFormatted() {
    const remaining = this.getRemainingTime();
    const minutes = Math.floor(remaining / 1000 / 60);
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  // Extend session (reset activity)
  extendSession() {
    console.log('🔄 Session extended manually');
    this.handleActivity();
  }
  
  // Cleanup
  destroy() {
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }
    
    if (this.logoutCheckInterval) {
      clearInterval(this.logoutCheckInterval);
    }
    
    // Remove event listeners would require storing references
    // For now, we'll let them persist as they're lightweight
    console.log('🗑️ Auto-logout manager destroyed');
  }
}
