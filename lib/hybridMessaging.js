/**
 * Hybrid Messaging Manager
 * Falls back to Vercel KV if Supabase is unavailable
 */
import { createClient } from '@supabase/supabase-js'

export class HybridMessagingManager {
  constructor(username, jwtToken, config = {}) {
    this.username = username;
    this.jwtToken = jwtToken;
    this.config = {
      room: 'ammu-vero-private-room',
      ...config
    };

    // Initialize both systems
    this.initializeSupabase();
    this.initializeKV();
    
    // Connection state
    this.isSupabaseConnected = false;
    this.channel = null;
    
    // Event handlers
    this.onMessage = null;
    this.onPresence = null;
    this.onTyping = null;
    this.onConnectionChange = null;
    this.onError = null;
  }

  initializeSupabase() {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.warn('⚠️ [HYBRID] Supabase credentials missing, using KV fallback');
        return;
      }

      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { 
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      
      console.log('🔧 [HYBRID] Supabase client initialized');
    } catch (error) {
      console.error('❌ [HYBRID] Supabase initialization failed:', error);
    }
  }

  initializeKV() {
    // KV fallback for when Supabase is unavailable
    this.kvBaseUrl = '/api/messages';
  }

  async connect() {
    // Try Supabase first
    if (this.supabase) {
      try {
        await this.connectSupabase();
        return;
      } catch (error) {
        console.warn('⚠️ [HYBRID] Supabase connection failed, falling back to KV:', error);
      }
    }
    
    // Fallback to KV with polling
    await this.connectKV();
  }

  async connectSupabase() {
    console.log(`🔗 [HYBRID-SUPABASE] Connecting ${this.username} to room ${this.config.room}`);
    
    this.channel = this.supabase
      .channel(`room-${this.config.room}`)
      
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages',
          filter: `room_id=eq.${this.config.room}`
        },
        (payload) => {
          console.log(`📨 [HYBRID-SUPABASE] New message:`, payload.new);
          if (payload.new.username !== this.username && this.onMessage) {
            this.onMessage(this.formatMessage(payload.new));
          }
        }
      )
      
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        if (this.onPresence) {
          this.onPresence(this.formatPresence(state));
        }
      })
      
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.username !== this.username && this.onTyping) {
          this.onTyping(payload.payload);
        }
      })
      
      .subscribe(async (status, err) => {
        console.log(`🔗 [HYBRID-SUPABASE] Status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          this.isSupabaseConnected = true;
          
          await this.channel.track({
            username: this.username,
            online_at: new Date().toISOString(),
            status: 'online'
          });
          
          if (this.onConnectionChange) {
            this.onConnectionChange({ status: 'connected', isConnected: true, method: 'supabase' });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`⚠️ [HYBRID-SUPABASE] Connection issue, falling back to KV`);
          this.isSupabaseConnected = false;
          await this.connectKV();
        }
      });
  }

  async connectKV() {
    console.log(`🔗 [HYBRID-KV] Connecting ${this.username} with polling fallback`);
    
    this.isSupabaseConnected = false;
    
    // Test KV connection first
    try {
      const testResponse = await fetch(`${this.kvBaseUrl}?room=${this.config.room}&limit=1`);
      if (!testResponse.ok) {
        throw new Error(`KV API responded with ${testResponse.status}`);
      }
      console.log('✅ [HYBRID-KV] KV API is accessible');
    } catch (error) {
      console.error('❌ [HYBRID-KV] KV API not accessible:', error);
      if (this.onConnectionChange) {
        this.onConnectionChange({ status: 'error', isConnected: false, method: 'kv-failed' });
      }
      return;
    }
    
    // Start polling for new messages
    this.startKVPolling();
    
    if (this.onConnectionChange) {
      this.onConnectionChange({ status: 'connected', isConnected: true, method: 'kv-polling' });
    }
  }

  startKVPolling() {
    // Poll every 2 seconds for new messages
    this.pollingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${this.kvBaseUrl}?room=${this.config.room}&after=${this.lastMessageTime || 0}`);
        const data = await response.json();
        
        if (data.messages && data.messages.length > 0) {
          data.messages.forEach(msg => {
            if (msg.username !== this.username && this.onMessage) {
              this.onMessage(msg);
            }
          });
          
          this.lastMessageTime = data.messages[data.messages.length - 1].timestamp;
        }
      } catch (error) {
        console.error('❌ [HYBRID-KV] Polling error:', error);
      }
    }, 2000);
  }

  async sendMessage(messageText, replyTo = null) {
    const messageData = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: messageText,
      username: this.username,
      room_id: this.config.room,
      reply_to: replyTo,
      created_at: new Date().toISOString()
    };

    // Try Supabase first
    if (this.isSupabaseConnected && this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('messages')
          .insert(messageData)
          .select()
          .single();

        if (error) throw error;
        return this.formatMessage(data);
      } catch (error) {
        console.warn('⚠️ [HYBRID] Supabase send failed, trying KV:', error);
      }
    }

    // Fallback to KV
    try {
      const response = await fetch(this.kvBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) throw new Error('KV send failed');
      
      const result = await response.json();
      return this.formatMessage(result.message || messageData);
    } catch (error) {
      console.error('❌ [HYBRID] Both Supabase and KV failed:', error);
      throw error;
    }
  }

  async getMessages(limit = 50) {
    // Try Supabase first
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('messages')
          .select('*')
          .eq('room_id', this.config.room)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          const messages = data.reverse().map(msg => this.formatMessage(msg));
          console.log(`📚 [HYBRID-SUPABASE] Loaded ${messages.length} messages`);
          return messages;
        }
      } catch (error) {
        console.warn('⚠️ [HYBRID] Supabase history failed, trying KV:', error);
      }
    }

    // Fallback to KV
    try {
      const response = await fetch(`${this.kvBaseUrl}?room=${this.config.room}&limit=${limit}`);
      const data = await response.json();
      
      const messages = (data.messages || []).map(msg => this.formatMessage(msg));
      console.log(`📚 [HYBRID-KV] Loaded ${messages.length} messages`);
      return messages;
    } catch (error) {
      console.error('❌ [HYBRID] Both Supabase and KV history failed:', error);
      return [];
    }
  }

  sendTyping(isTyping) {
    if (this.isSupabaseConnected && this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          username: this.username,
          isTyping,
          timestamp: Date.now()
        }
      });
    }
    // Note: KV doesn't support real-time typing indicators
  }

  disconnect() {
    console.log(`🔌 [HYBRID] Disconnecting ${this.username}`);
    
    if (this.channel) {
      this.supabase?.removeChannel(this.channel);
      this.channel = null;
    }
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    this.isSupabaseConnected = false;
  }

  formatMessage(dbMessage) {
    return {
      id: dbMessage.id,
      text: dbMessage.text,
      username: dbMessage.username,
      created_at: dbMessage.created_at,
      timestamp: new Date(dbMessage.created_at).getTime(),
      reply_to: dbMessage.reply_to,
      replyTo: dbMessage.reply_to,
      message_type: dbMessage.message_type || 'text',
      messageType: dbMessage.message_type || 'text',
      edited: dbMessage.edited || false
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
          lastSeen: latestPresence.online_at,
          isOnline: true
        };
      }
    });
    return presence;
  }
}

export default HybridMessagingManager;
