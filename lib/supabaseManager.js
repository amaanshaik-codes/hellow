/**
 * Supabase Real-time Manager for Hellow Chat
 * Handles messaging, presence, typing indicators with JWT integration
 * Designed for file attachments and future feature expansion
 */
import { createClient } from '@supabase/supabase-js'

export class SupabaseManager {
  constructor(username, jwtToken, config = {}) {
    this.username = username;
    this.jwtToken = jwtToken;
    this.config = {
      room: 'ammu-vero-private-room',
      ...config
    };

    // Initialize Supabase client with JWT auth
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { 
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          headers: {
            authorization: `Bearer ${jwtToken}`,
            'x-user': username
          }
        }
      }
    );

    // Connection state
    this.channel = null;
    this.isConnected = false;
    
    // Event handlers
    this.onMessage = null;
    this.onPresence = null;
    this.onTyping = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.onFileShare = null;
    
    // Typing state
    this.isUserTyping = false;
    this.typingTimeout = null;
  }

  /**
   * Connect to Supabase real-time channel
   */
  async connect() {
    try {
      console.log(`🔗 [SUPABASE] Connecting ${this.username} to room ${this.config.room}`);
      
      this.channel = this.supabase
        .channel(`room-${this.config.room}`)
        
        // Listen for new messages
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `room_id=eq.${this.config.room}`
          },
          (payload) => {
            console.log(`📨 [SUPABASE] New message received:`, payload.new);
            
            // Don't echo back own messages
            if (payload.new.username !== this.username && this.onMessage) {
              this.onMessage(this.formatMessage(payload.new));
            }
          }
        )
        
        // Listen for file shares
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'file_shares',
            filter: `room_id=eq.${this.config.room}`
          },
          (payload) => {
            console.log(`📎 [SUPABASE] New file shared:`, payload.new);
            
            if (payload.new.username !== this.username && this.onFileShare) {
              this.onFileShare(payload.new);
            }
          }
        )
        
        // Handle presence updates
        .on('presence', { event: 'sync' }, () => {
          const state = this.channel.presenceState();
          console.log(`👥 [SUPABASE] Presence sync:`, state);
          
          if (this.onPresence) {
            this.onPresence(this.formatPresence(state));
          }
        })
        
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log(`👋 [SUPABASE] User joined:`, key, newPresences);
        })
        
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log(`👋 [SUPABASE] User left:`, key, leftPresences);
        })
        
        // Handle typing indicators
        .on('broadcast', { event: 'typing' }, (payload) => {
          console.log(`⌨️ [SUPABASE] Typing update:`, payload);
          
          if (payload.payload.username !== this.username && this.onTyping) {
            this.onTyping(payload.payload);
          }
        })
        
        .subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [SUPABASE] Connected successfully`);
            this.isConnected = true;
            
            // Track presence
            await this.channel.track({
              username: this.username,
              online_at: new Date().toISOString(),
              status: 'online'
            });
            
            if (this.onConnectionChange) {
              this.onConnectionChange({ status: 'connected', isConnected: true });
            }
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ [SUPABASE] Channel error:`, err);
            this.isConnected = false;
            
            if (this.onConnectionChange) {
              this.onConnectionChange({ status: 'error', isConnected: false, error: err });
            }
          } else if (status === 'TIMED_OUT') {
            console.warn(`⏰ [SUPABASE] Connection timed out`);
            this.isConnected = false;
            
            if (this.onConnectionChange) {
              this.onConnectionChange({ status: 'timeout', isConnected: false });
            }
          } else if (status === 'CLOSED') {
            console.log(`🔌 [SUPABASE] Connection closed`);
            this.isConnected = false;
            
            if (this.onConnectionChange) {
              this.onConnectionChange({ status: 'disconnected', isConnected: false });
            }
          }
        });

    } catch (error) {
      console.error(`❌ [SUPABASE] Connection failed:`, error);
      this.isConnected = false;
      
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(messageText, replyTo = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to Supabase');
    }

    try {
      console.log(`📤 [SUPABASE] Sending message:`, messageText);
      
      const messageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        text: messageText,
        username: this.username,
        room_id: this.config.room,
        message_type: 'text',
        reply_to: replyTo,
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        console.error(`❌ [SUPABASE] Message send failed:`, error);
        throw error;
      }

      console.log(`✅ [SUPABASE] Message sent successfully:`, data);
      return this.formatMessage(data);

    } catch (error) {
      console.error(`❌ [SUPABASE] Send message error:`, error);
      throw error;
    }
  }

  /**
   * Send typing indicator
   */
  sendTyping(isTyping) {
    if (!this.isConnected || !this.channel) return;

    try {
      this.channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          username: this.username,
          isTyping,
          timestamp: Date.now()
        }
      });

      // Auto-clear typing after 3 seconds
      if (isTyping) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          this.sendTyping(false);
        }, 3000);
      }

    } catch (error) {
      console.error(`❌ [SUPABASE] Typing indicator error:`, error);
    }
  }

  /**
   * Share a file (integrates with Proxmox storage)
   */
  async shareFile(fileData) {
    if (!this.isConnected) {
      throw new Error('Not connected to Supabase');
    }

    try {
      console.log(`📎 [SUPABASE] Sharing file:`, fileData);
      
      const fileShare = {
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        username: this.username,
        room_id: this.config.room,
        file_name: fileData.name,
        file_size: fileData.size,
        file_type: fileData.type,
        file_url: fileData.url, // URL from Proxmox storage
        proxmox_path: fileData.proxmoxPath, // Internal Proxmox path
        thumbnail_url: fileData.thumbnailUrl || null,
        message_text: fileData.caption || null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('file_shares')
        .insert(fileShare)
        .select()
        .single();

      if (error) {
        console.error(`❌ [SUPABASE] File share failed:`, error);
        throw error;
      }

      console.log(`✅ [SUPABASE] File shared successfully:`, data);
      return { success: true, fileShare: data };

    } catch (error) {
      console.error(`❌ [SUPABASE] Share file error:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get message history - alias for getMessageHistory
   */
  async getMessages(limit = 50) {
    return this.getMessageHistory(limit);
  }

  /**
   * Get message history
   */
  async getMessageHistory(limit = 50) {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .select('*')
        .eq('room_id', this.config.room)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error(`❌ [SUPABASE] History fetch failed:`, error);
        throw error;
      }

      const messages = data.reverse().map(msg => this.formatMessage(msg));
      console.log(`📚 [SUPABASE] Loaded ${messages.length} historical messages`);
      
      return messages;

    } catch (error) {
      console.error(`❌ [SUPABASE] Get history error:`, error);
      return [];
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(messageId = null) {
    try {
      const readData = {
        username: this.username,
        room_id: this.config.room,
        message_id: messageId,
        read_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('message_reads')
        .upsert(readData, { 
          onConflict: 'username,room_id,message_id' 
        });

      if (error) {
        console.error(`❌ [SUPABASE] Mark as read failed:`, error);
        throw error;
      }

      console.log(`📖 [SUPABASE] Marked as read:`, readData);

    } catch (error) {
      console.error(`❌ [SUPABASE] Mark as read error:`, error);
    }
  }

  /**
   * Disconnect from Supabase
   */
  disconnect() {
    console.log(`🔌 [SUPABASE] Disconnecting ${this.username}`);
    
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    
    this.isConnected = false;
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  /**
   * Format message for UI
   */
  formatMessage(dbMessage) {
    return {
      id: dbMessage.id,
      text: dbMessage.text,
      username: dbMessage.username,
      created_at: dbMessage.created_at, // Keep original format for UI
      timestamp: new Date(dbMessage.created_at).getTime(),
      reply_to: dbMessage.reply_to, // Keep underscore format for UI
      replyTo: dbMessage.reply_to, // Also provide camelCase for compatibility
      message_type: dbMessage.message_type || 'text',
      messageType: dbMessage.message_type || 'text',
      edited: dbMessage.edited || false
    };
  }

  /**
   * Format presence data for UI
   */
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

  // Event handler setters
  setMessageHandler(handler) { this.onMessage = handler; }
  setPresenceHandler(handler) { this.onPresence = handler; }
  setTypingHandler(handler) { this.onTyping = handler; }
  setConnectionHandler(handler) { this.onConnectionChange = handler; }
  setErrorHandler(handler) { this.onError = handler; }
  setFileShareHandler(handler) { this.onFileShare = handler; }
}

export default SupabaseManager;
