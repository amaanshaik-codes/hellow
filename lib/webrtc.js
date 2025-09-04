// WebRTC Manager - Handles P2P connections and fallback
class WebRTCManager {
  constructor(userId, roomId, onMessage, onPresenceChange, onTyping) {
    this.userId = userId;
    this.roomId = roomId;
    this.onMessage = onMessage;
    this.onPresenceChange = onPresenceChange;
    this.onTyping = onTyping;
    
    this.peerConnection = null;
    this.dataChannel = null;
    this.isConnected = false;
    this.isInitiator = false;
    this.signalPollInterval = null;
    this.heartbeatInterval = null;
    
    // ICE servers for NAT traversal
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
    
    this.init();
  }
  
  async init() {
    console.log(`🚀 Initializing WebRTC for ${this.userId} in room ${this.roomId}`);
    
    // Join the room
    await this.signalServer('join', {
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    });
    
    // Start polling for signals
    this.startSignalPolling();
    
    // Create peer connection
    await this.createPeerConnection();
    
    // Determine if we should initiate (ammu initiates, vero responds)
    this.isInitiator = this.userId === 'ammu';
    
    if (this.isInitiator) {
      // Create data channel and offer
      setTimeout(() => this.createOffer(), 1000);
    }
  }
  
  async createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });
    
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
        this.signalServer('ice-candidate', event.candidate);
      }
    };
    
    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`🔗 Connection state: ${state}`);
      
      if (state === 'connected') {
        this.isConnected = true;
        this.onPresenceChange({ status: 'online', direct: true });
        this.startHeartbeat();
      } else if (state === 'disconnected' || state === 'failed') {
        this.isConnected = false;
        this.onPresenceChange({ status: 'offline', direct: false });
        this.reconnect();
      }
    };
    
    // Handle incoming data channels
    this.peerConnection.ondatachannel = (event) => {
      console.log('📨 Received data channel');
      this.setupDataChannel(event.channel);
    };
  }
  
  async createOffer() {
    if (!this.peerConnection) return;
    
    console.log('📤 Creating WebRTC offer');
    
    // Create data channel for messaging
    this.dataChannel = this.peerConnection.createDataChannel('messages', {
      ordered: true
    });
    this.setupDataChannel(this.dataChannel);
    
    // Create and send offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    await this.signalServer('offer', offer);
  }
  
  async handleOffer(offer) {
    if (!this.peerConnection) return;
    
    console.log('📥 Handling WebRTC offer');
    
    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    await this.signalServer('answer', answer);
  }
  
  async handleAnswer(answer) {
    if (!this.peerConnection) return;
    
    console.log('✅ Handling WebRTC answer');
    await this.peerConnection.setRemoteDescription(answer);
  }
  
  async handleIceCandidate(candidate) {
    if (!this.peerConnection) return;
    
    console.log('🧊 Adding ICE candidate');
    await this.peerConnection.addIceCandidate(candidate);
  }
  
  setupDataChannel(channel) {
    this.dataChannel = channel;
    
    channel.onopen = () => {
      console.log('✅ Data channel opened');
      this.isConnected = true;
      this.onPresenceChange({ status: 'online', direct: true });
    };
    
    channel.onclose = () => {
      console.log('❌ Data channel closed');
      this.isConnected = false;
      this.onPresenceChange({ status: 'offline', direct: false });
    };
    
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Received P2P message:', data);
        
        if (data.type === 'message') {
          this.onMessage(data);
        } else if (data.type === 'typing') {
          this.onTyping(data);
        } else if (data.type === 'heartbeat') {
          // Respond to heartbeat
          this.sendHeartbeat(true);
        }
      } catch (error) {
        console.error('❌ Error parsing P2P data:', error);
      }
    };
  }
  
  // Send message through WebRTC data channel
  sendMessage(message) {
    const data = {
      type: 'message',
      ...message,
      timestamp: Date.now(),
      direct: true
    };
    
    if (this.isConnected && this.dataChannel?.readyState === 'open') {
      console.log('📤 Sending P2P message:', data);
      this.dataChannel.send(JSON.stringify(data));
      return true;
    } else {
      console.log('⚠️ P2P not available, using fallback');
      return false; // Fallback to server relay
    }
  }
  
  // Send typing indicator
  sendTyping(isTyping) {
    const data = {
      type: 'typing',
      isTyping,
      userId: this.userId,
      timestamp: Date.now()
    };
    
    if (this.isConnected && this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }
  
  // Heartbeat to maintain connection
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat(false);
    }, 10000); // Every 10 seconds
  }
  
  sendHeartbeat(isResponse = false) {
    const data = {
      type: 'heartbeat',
      response: isResponse,
      timestamp: Date.now()
    };
    
    if (this.isConnected && this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }
  
  // Signal server communication
  async signalServer(type, data) {
    try {
      const response = await fetch('/api/webrtc/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          roomId: this.roomId,
          userId: this.userId,
          data
        })
      });
      
      if (!response.ok) {
        throw new Error(`Signal server error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('❌ Signal server error:', error);
      throw error;
    }
  }
  
  // Poll for pending signals
  startSignalPolling() {
    this.signalPollInterval = setInterval(async () => {
      try {
        const result = await this.signalServer('poll');
        
        for (const signal of result.signals || []) {
          switch (signal.type) {
            case 'offer':
              await this.handleOffer(signal.data);
              break;
            case 'answer':
              await this.handleAnswer(signal.data);
              break;
            case 'ice-candidate':
              await this.handleIceCandidate(signal.data);
              break;
            case 'user-left':
              this.onPresenceChange({ status: 'offline', direct: false });
              break;
          }
        }
      } catch (error) {
        console.error('❌ Signal polling error:', error);
      }
    }, 1000); // Poll every second
  }
  
  // Reconnection logic
  async reconnect() {
    console.log('🔄 Attempting WebRTC reconnection...');
    
    // Clean up existing connection
    this.cleanup();
    
    // Wait a bit before reconnecting
    setTimeout(() => {
      this.init();
    }, 2000);
  }
  
  // Clean up resources
  cleanup() {
    if (this.signalPollInterval) {
      clearInterval(this.signalPollInterval);
      this.signalPollInterval = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.isConnected = false;
  }
  
  // Destroy the connection
  async destroy() {
    await this.signalServer('leave');
    this.cleanup();
  }
}

export default WebRTCManager;
