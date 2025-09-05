/**
 * Advanced Real-time Messaging Manager
 * Implements hybrid DB + broadcast approach for instant messaging
 * Features: optimistic UI, message queue, retry logic, presence tracking
 */
import { createClient } from '@supabase/supabase-js'

export class AdvancedMessagingManager {
  constructor(username, jwtToken, config = {}) {
    this.username = username;
    this.jwtToken = jwtToken;
    this.config = {
      room: 'ammu-vero-private-room',
      ...config
    };

    // Initialize Supabase
    this.initializeSupabase();
    
    // Message states and queues
    this.messageQueue = new Map(); // pending messages
    this.messageStates = new Map(); // message state tracking
    this.lastSyncTimestamp = this.getLastSyncTime();
    
    // Connection state
    this.isConnected = false;
    this.channels = {
      messages: null,    // For DB changes
      broadcast: null,   // For instant delivery
      presence: null     // For online status
    };
    
    // Event handlers
    this.onMessage = null;
    this.onPresence = null;
    this.onTyping = null;
    this.onConnectionChange = null;
    this.onMessageStateChange = null;
    
    // Retry and sync timers
    this.retryInterval = null;
    this.syncInterval = null;
    this.typingTimeout = null;
  }

  initializeSupabase() {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl === 'undefined' || supabaseKey === 'undefined') {
        console.warn('⚠️ [ADVANCED] Supabase credentials missing, falling back to KV');
        this.kvMode = true;
        return;
      }

      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { 
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          params: {
            eventsPerSecond: 50 // Higher rate for instant messaging
          }
        }
      });
      
      this.kvMode = false;
      console.log('🚀 [ADVANCED] Supabase client initialized');
    } catch (error) {
      console.error('❌ [ADVANCED] Supabase initialization failed:', error);
      this.kvMode = true;
    }
  }

  async connect() {
    if (this.kvMode) {
      console.log('🔗 [ADVANCED] Starting in KV mode (Supabase unavailable)');
      return this.connectKV();
    }
    
    try {
      console.log(`🔗 [ADVANCED] Connecting ${this.username} with hybrid approach...`);
      
      // 🔹 Channel 1: Database changes (persistent messages)
      this.channels.messages = this.supabase
        .channel(`messages-${this.config.room}`)
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `room_id=eq.${this.config.room}`
          },
          (payload) => this.handleDatabaseMessage(payload.new)
        )
        .subscribe();

      // 🔹 Channel 2: Instant broadcasts (ephemeral events)
      this.channels.broadcast = this.supabase
        .channel(`broadcast-${this.config.room}`)
        .on('broadcast', { event: 'instant_message' }, (payload) => {
          this.handleInstantMessage(payload.payload);
        })
        .on('broadcast', { event: 'typing' }, (payload) => {
          this.handleTypingBroadcast(payload.payload);
        })
        .on('broadcast', { event: 'message_ack' }, (payload) => {
          this.handleMessageAck(payload.payload);
        })
        .subscribe();

      // 🔹 Channel 3: Presence tracking
      this.channels.presence = this.supabase
        .channel(`presence-${this.config.room}`)
        .on('presence', { event: 'sync' }, () => {
          const state = this.channels.presence.presenceState();
          this.handlePresenceSync(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log(`👋 [ADVANCED] User joined:`, key);
          this.handleUserJoin(newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log(`👋 [ADVANCED] User left:`, key);
          this.handleUserLeave(leftPresences);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            this.isConnected = true;
            
            // Track our presence
            await this.channels.presence.track({
              username: this.username,
              online_at: new Date().toISOString(),
              status: 'online',
              last_seen: new Date().toISOString()
            });
            
            console.log('✅ [ADVANCED] All channels connected');
            this.onConnectionChange?.({ status: 'connected', method: 'advanced-hybrid' });
            
            // Start background processes
            this.startRetryQueue();
            this.startPeriodicSync();
            
            // Perform delta sync on connect
            await this.performDeltaSync();
          } else {
            console.warn('⚠️ [ADVANCED] Supabase connection failed, falling back to KV:', status);
            this.handleConnectionError(status);
          }
        });

    } catch (error) {
      console.error('❌ [ADVANCED] Connection failed, falling back to KV:', error);
      this.kvMode = true;
      await this.connectKV();
    }
  }

  // 🔹 Handle connection errors
  handleConnectionError(status) {
    console.warn('⚠️ [ADVANCED] Connection error:', status);
    this.kvMode = true;
    this.connectKV();
  }

  // 🔹 1. Hybrid Message Sending (DB + Broadcast)
  async sendMessage(messageText, replyTo = null) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timestamp = Date.now();
    
    const message = {
      id: messageId,
      text: messageText,
      username: this.username,
      room_id: this.config.room,
      reply_to: replyTo,
      created_at: new Date().toISOString(),
      timestamp
    };

    console.log(`💬 [ADVANCED] Sending message: "${messageText}"`);

    // 🔹 2. Optimistic UI - Add to queue immediately
    this.messageQueue.set(messageId, message);
    this.updateMessageState(messageId, 'pending');

    try {
      // Step 1: Send instant broadcast for immediate UI
      if (this.channels.broadcast && !this.kvMode) {
        try {
          await this.channels.broadcast.send({
            type: 'broadcast',
            event: 'instant_message',
            payload: {
              ...message,
              temp: true, // Mark as temporary
              sender: this.username
            }
          });
          console.log('📡 [ADVANCED] Instant broadcast sent');
        } catch (broadcastError) {
          console.warn('⚠️ [ADVANCED] Broadcast failed:', broadcastError);
        }
      }

      // Step 2: Store in database for persistence
      let dbResult;
      if (this.supabase && !this.kvMode) {
        try {
          const { data, error } = await this.supabase
            .from('messages')
            .insert(message)
            .select()
            .single();

          if (error) throw error;
          dbResult = data;
        } catch (supabaseError) {
          console.warn('⚠️ [ADVANCED] Supabase insert failed, using KV fallback:', supabaseError);
          dbResult = await this.sendToKV(message);
        }
      } else {
        // Fallback to KV
        dbResult = await this.sendToKV(message);
      }

      // Step 3: Update state to acknowledged
      this.updateMessageState(messageId, 'acknowledged');
      this.messageQueue.delete(messageId);

      // Step 4: Send acknowledgment broadcast
      if (this.channels.broadcast && !this.kvMode) {
        try {
          await this.channels.broadcast.send({
            type: 'broadcast',
            event: 'message_ack',
            payload: {
              message_id: messageId,
              server_timestamp: dbResult.created_at,
              sender: this.username
            }
          });
        } catch (ackError) {
          console.warn('⚠️ [ADVANCED] Acknowledgment broadcast failed:', ackError);
        }
      }

      console.log('✅ [ADVANCED] Message sent successfully');
      return this.formatMessage(dbResult);

    } catch (error) {
      console.error('❌ [ADVANCED] Message send failed:', error);
      this.updateMessageState(messageId, 'failed');
      throw error;
    }
  }

  // 🔹 3. Handle instant broadcast messages
  handleInstantMessage(payload) {
    if (payload.sender === this.username) return; // Skip own messages
    
    console.log('⚡ [ADVANCED] Instant message received:', payload);
    
    // Show immediately in UI
    if (this.onMessage) {
      const message = this.formatMessage(payload);
      message.state = 'delivered'; // Mark as delivered instantly
      this.onMessage(message);
    }
  }

  // 🔹 4. Handle database confirmation
  handleDatabaseMessage(dbMessage) {
    if (dbMessage.username === this.username) {
      // Our own message confirmed by DB
      this.updateMessageState(dbMessage.id, 'confirmed');
      return;
    }

    // Partner's message from DB (backup for missed broadcasts)
    console.log('📨 [ADVANCED] DB message received:', dbMessage);
    
    if (this.onMessage) {
      const message = this.formatMessage(dbMessage);
      message.state = 'confirmed';
      this.onMessage(message);
    }
  }

  // 🔹 5. Message acknowledgment handling
  handleMessageAck(payload) {
    if (payload.sender !== this.username) {
      console.log('📬 [ADVANCED] Message delivered to partner:', payload.message_id);
      this.updateMessageState(payload.message_id, 'delivered');
    }
  }

  // 🔹 6. Delta sync for missed messages
  async performDeltaSync() {
    try {
      console.log('🔄 [ADVANCED] Performing delta sync...');
      
      const lastSync = this.getLastSyncTime();
      let messages = [];

      if (this.supabase && !this.kvMode) {
        const { data, error } = await this.supabase
          .from('messages')
          .select('*')
          .eq('room_id', this.config.room)
          .gt('created_at', new Date(lastSync).toISOString())
          .order('created_at', { ascending: true });

        if (!error && data) {
          messages = data;
        }
      } else {
        // KV fallback
        messages = await this.getKVMessagesSince(lastSync);
      }

      if (messages.length > 0) {
        console.log(`📚 [ADVANCED] Delta sync found ${messages.length} missed messages`);
        
        messages.forEach(msg => {
          if (msg.username !== this.username && this.onMessage) {
            const formattedMsg = this.formatMessage(msg);
            formattedMsg.state = 'confirmed';
            this.onMessage(formattedMsg);
          }
        });
      }

      this.updateLastSyncTime();

    } catch (error) {
      console.error('❌ [ADVANCED] Delta sync failed:', error);
    }
  }

  // 🔹 7. Retry queue for failed messages
  startRetryQueue() {
    this.retryInterval = setInterval(() => {
      if (this.messageQueue.size > 0) {
        console.log(`🔄 [ADVANCED] Retrying ${this.messageQueue.size} pending messages`);
        
        for (const [messageId, message] of this.messageQueue.entries()) {
          const state = this.messageStates.get(messageId);
          if (state === 'failed' || state === 'pending') {
            this.retryMessage(messageId, message);
          }
        }
      }
    }, 5000); // Retry every 5 seconds
  }

  async retryMessage(messageId, message) {
    try {
      this.updateMessageState(messageId, 'retrying');
      
      // Try sending again with KV fallback
      let dbResult;
      if (this.supabase && !this.kvMode) {
        try {
          const { data, error } = await this.supabase
            .from('messages')
            .insert(message)
            .select()
            .single();

          if (error) throw error;
          dbResult = data;
        } catch (supabaseError) {
          console.warn('⚠️ [ADVANCED] Retry with Supabase failed, using KV:', supabaseError);
          dbResult = await this.sendToKV(message);
        }
      } else {
        dbResult = await this.sendToKV(message);
      }
      
      this.updateMessageState(messageId, 'acknowledged');
      this.messageQueue.delete(messageId);
      
      console.log(`✅ [ADVANCED] Retry successful for message: ${messageId}`);
    } catch (error) {
      console.error(`❌ [ADVANCED] Retry failed for message ${messageId}:`, error);
      this.updateMessageState(messageId, 'failed');
    }
  }

  // 🔹 8. Enhanced typing indicators
  sendTyping(isTyping) {
    if (!this.kvMode && this.channels.broadcast) {
      try {
        clearTimeout(this.typingTimeout);

        this.channels.broadcast.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            username: this.username,
            isTyping,
            timestamp: Date.now()
          }
        });

        if (isTyping) {
          this.typingTimeout = setTimeout(() => {
            this.sendTyping(false);
          }, 3000);
        }
      } catch (error) {
        console.warn('⚠️ [ADVANCED] Typing indicator failed:', error);
      }
    }
    // Note: KV mode doesn't support real-time typing
  }

  handleTypingBroadcast(payload) {
    if (payload.username !== this.username && this.onTyping) {
      this.onTyping({ [payload.username]: { isTyping: payload.isTyping } });
    }
  }

  // 🔹 Message state management
  updateMessageState(messageId, state) {
    this.messageStates.set(messageId, state);
    this.onMessageStateChange?.({ messageId, state });
    console.log(`📊 [ADVANCED] Message ${messageId} state: ${state}`);
  }

  // 🔹 Presence handling
  handlePresenceSync(state) {
    const presence = this.formatPresence(state);
    this.onPresence?.(presence);
  }

  handleUserJoin(newPresences) {
    // Partner came online, perform delta sync
    const otherUser = this.username === 'ammu' ? 'vero' : 'ammu';
    const joinedUser = newPresences.find(p => p.username === otherUser);
    
    if (joinedUser) {
      console.log(`🔄 [ADVANCED] Partner ${otherUser} came online, syncing...`);
      this.performDeltaSync();
    }
  }

  handleUserLeave(leftPresences) {
    // Update presence status
    const presence = {};
    leftPresences.forEach(p => {
      presence[p.username] = {
        status: 'offline',
        lastSeen: new Date().toISOString()
      };
    });
    this.onPresence?.(presence);
  }

  // Utility methods
  getLastSyncTime() {
    return parseInt(localStorage.getItem(`last_sync_${this.username}`) || '0');
  }

  updateLastSyncTime() {
    localStorage.setItem(`last_sync_${this.username}`, Date.now().toString());
  }

  formatMessage(dbMessage) {
    return {
      id: dbMessage.id,
      text: dbMessage.text,
      username: dbMessage.username,
      created_at: dbMessage.created_at,
      timestamp: new Date(dbMessage.created_at).getTime(),
      reply_to: dbMessage.reply_to,
      edited: dbMessage.edited || false,
      state: 'confirmed'
    };
  }

  formatPresence(presenceState) {
    const presence = {};
    Object.keys(presenceState).forEach(key => {
      const userPresences = presenceState[key];
      if (userPresences && userPresences.length > 0) {
        const latestPresence = userPresences[0];
        presence[latestPresence.username] = {
          status: latestPresence.status || 'online',
          lastSeen: latestPresence.last_seen,
          isOnline: true
        };
      }
    });
    return presence;
  }

  // KV fallback methods
  async connectKV() {
    console.log('🔗 [ADVANCED-KV] Using KV fallback mode');
    this.isConnected = true;
    this.onConnectionChange?.({ status: 'connected', method: 'kv-fallback' });
    
    this.startKVPolling();
    this.startRetryQueue();
  }

  startKVPolling() {
    this.syncInterval = setInterval(() => {
      this.performDeltaSync();
    }, 2000); // Poll every 2 seconds
  }

  async sendToKV(message) {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.jwtToken}`
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) throw new Error('KV send failed');
    const result = await response.json();
    return result.message;
  }

  async getKVMessagesSince(timestamp) {
    const response = await fetch(`/api/messages?room=${this.config.room}&after=${timestamp}`, {
      headers: {
        'Authorization': `Bearer ${this.jwtToken}`
      }
    });
    const data = await response.json();
    return data.messages || [];
  }

  async getMessages(limit = 50) {
    try {
      if (this.supabase && !this.kvMode) {
        const { data, error } = await this.supabase
          .from('messages')
          .select('*')
          .eq('room_id', this.config.room)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          return data.reverse().map(msg => this.formatMessage(msg));
        }
      }

      // KV fallback
      const response = await fetch(`/api/messages?room=${this.config.room}&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`
        }
      });
      const data = await response.json();
      return (data.messages || []).map(msg => this.formatMessage(msg));

    } catch (error) {
      console.error('❌ [ADVANCED] Get messages failed:', error);
      return [];
    }
  }

  startPeriodicSync() {
    // Periodic sync every 30 seconds to ensure consistency
    setInterval(() => {
      if (this.isConnected) {
        this.performDeltaSync();
      }
    }, 30000);
  }

  disconnect() {
    console.log('🔌 [ADVANCED] Disconnecting...');
    
    Object.values(this.channels).forEach(channel => {
      if (channel) {
        this.supabase?.removeChannel(channel);
      }
    });
    
    clearInterval(this.retryInterval);
    clearInterval(this.syncInterval);
    clearTimeout(this.typingTimeout);
    
    this.isConnected = false;
  }
}

export default AdvancedMessagingManager;
