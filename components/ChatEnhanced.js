/**
 * Enhanced Chat Component with Supabase + Proxmox Integration
 * Features: Real-time messaging, file sharing, image previews, voice messages
 */
"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SupabaseManager from '../lib/supabaseManager';
import ProxmoxFileManager from '../lib/proxmoxFileManager';

export default function ChatEnhanced({ user, onLogout }) {
  // State management
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [presence, setPresence] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isOnline, setIsOnline] = useState(false);
  
  // File sharing state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [filePreview, setFilePreview] = useState(null);
  
  // Refs
  const chatBottom = useRef(null);
  const fileInputRef = useRef(null);
  const supabaseRef = useRef(null);
  const proxmoxRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize managers
  useEffect(() => {
    console.log(`🚀 [CHAT] Initializing Enhanced Chat for ${user.username}`);
    
    // Initialize Supabase Manager
    supabaseRef.current = new SupabaseManager(user.username, user.token);
    
    // Initialize Proxmox File Manager
    proxmoxRef.current = new ProxmoxFileManager();
    
    // Set up message handler
    supabaseRef.current.setMessageHandler((message) => {
      console.log(`📨 [CHAT] New message received:`, message);
      setMessages(prev => [...prev, message]);
    });
    
    // Set up file share handler
    supabaseRef.current.setFileShareHandler((fileShare) => {
      console.log(`📎 [CHAT] New file shared:`, fileShare);
      
      const fileMessage = {
        id: fileShare.id,
        username: fileShare.username,
        timestamp: new Date(fileShare.created_at).getTime(),
        messageType: 'file',
        fileData: {
          name: fileShare.file_name,
          size: fileShare.file_size,
          type: fileShare.file_type,
          url: fileShare.file_url,
          thumbnailUrl: fileShare.thumbnail_url
        },
        text: fileShare.message_text || `Shared ${fileShare.file_name}`
      };
      
      setMessages(prev => [...prev, fileMessage]);
    });
    
    // Set up presence handler
    supabaseRef.current.setPresenceHandler((presenceData) => {
      console.log(`👥 [CHAT] Presence update:`, presenceData);
      setPresence(presenceData);
      
      const otherUser = user.username === 'ammu' ? 'vero' : 'ammu';
      setIsOnline(presenceData[otherUser]?.isOnline || false);
    });
    
    // Set up typing handler
    supabaseRef.current.setTypingHandler((typingData) => {
      console.log(`⌨️ [CHAT] Typing update:`, typingData);
      
      if (typingData.username !== user.username) {
        setIsTyping(typingData.isTyping);
        
        // Auto-clear typing indicator
        if (typingData.isTyping) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 4000);
        }
      }
    });
    
    // Set up connection handler
    supabaseRef.current.setConnectionHandler((statusInfo) => {
      console.log(`🔄 [CHAT] Connection status:`, statusInfo);
      setConnectionStatus(statusInfo.status);
      setIsOnline(statusInfo.isConnected);
    });
    
    // Connect to Supabase
    supabaseRef.current.connect();
    
    // Load message history
    loadMessageHistory();
    
    // Cleanup on unmount
    return () => {
      if (supabaseRef.current) {
        supabaseRef.current.disconnect();
      }
      clearTimeout(typingTimeoutRef.current);
    };
  }, [user.username, user.token]);

  // Load message history
  const loadMessageHistory = async () => {
    try {
      const history = await supabaseRef.current?.getMessageHistory(100);
      
      if (history && history.length > 0) {
        console.log(`📚 [CHAT] Loaded ${history.length} historical messages`);
        setMessages(history);
      }
    } catch (error) {
      console.error('❌ [CHAT] Failed to load message history:', error);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatBottom.current) {
      chatBottom.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Send text message
  const sendMessage = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim() || !supabaseRef.current) return;

    const messageText = input.trim();
    setInput('');

    const tempMessage = {
      id: `temp_${Date.now()}`,
      text: messageText,
      username: user.username,
      timestamp: Date.now(),
      messageType: 'text',
      sending: true
    };

    // Add optimistic message
    setMessages(prev => [...prev, tempMessage]);

    try {
      const result = await supabaseRef.current.sendMessage({
        text: messageText
      });

      if (result.success) {
        console.log(`✅ [CHAT] Message sent successfully`);
        
        // Remove temporary message (real one will come via real-time)
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('❌ [CHAT] Failed to send message:', error);
      
      // Mark message as failed
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id 
          ? { ...msg, sending: false, failed: true } 
          : msg
      ));
    }
  }, [input, user.username]);

  // Handle typing indicators
  const handleTyping = useCallback(() => {
    if (supabaseRef.current) {
      supabaseRef.current.sendTyping(true);
    }
    
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      if (supabaseRef.current) {
        supabaseRef.current.sendTyping(false);
      }
    }, 3000);
  }, []);

  // Handle file drop
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      await handleFileUpload(file);
    }
  }, []);

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file || !proxmoxRef.current || !supabaseRef.current) return;

    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    try {
      console.log(`📤 [CHAT] Starting file upload: ${file.name}`);
      
      // Show upload progress
      setUploadProgress(prev => ({
        ...prev,
        [uploadId]: { fileName: file.name, progress: 0 }
      }));

      // Upload to Proxmox
      const uploadResult = await proxmoxRef.current.uploadFile(file, {
        username: user.username,
        jwtToken: user.token,
        room: 'ammu-vero-private-room',
        generateThumbnail: proxmoxRef.current.supportsThumbnails(file.type)
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // Update progress
      setUploadProgress(prev => ({
        ...prev,
        [uploadId]: { fileName: file.name, progress: 100 }
      }));

      // Share file via Supabase
      const shareResult = await supabaseRef.current.shareFile({
        name: uploadResult.fileData.name,
        size: uploadResult.fileData.size,
        type: uploadResult.fileData.type,
        url: uploadResult.fileData.url,
        thumbnailUrl: uploadResult.fileData.thumbnailUrl,
        proxmoxPath: uploadResult.fileData.proxmoxPath,
        caption: `Shared ${file.name}`
      });

      if (shareResult.success) {
        console.log(`✅ [CHAT] File shared successfully`);
      } else {
        throw new Error(shareResult.error);
      }

    } catch (error) {
      console.error('❌ [CHAT] File upload failed:', error);
      
      // Show error message
      const errorMessage = {
        id: `error_${Date.now()}`,
        text: `Failed to upload ${file.name}: ${error.message}`,
        username: 'system',
        timestamp: Date.now(),
        messageType: 'error'
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      // Remove upload progress
      setTimeout(() => {
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[uploadId];
          return updated;
        });
      }, 2000);
    }
  };

  // Handle file input change
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(handleFileUpload);
    e.target.value = ''; // Reset input
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get connection status color
  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-500';
      case 'error': return 'text-red-500';
      case 'timeout': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  // Render message
  const renderMessage = (message, index) => {
    const isOwn = message.username === user.username;
    const isFile = message.messageType === 'file';
    const isError = message.messageType === 'error';

    return (
      <motion.div
        key={message.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
          isError 
            ? 'bg-red-100 text-red-800' 
            : isOwn 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 text-gray-800'
        }`}>
          {isFile ? (
            <div className="space-y-2">
              {message.fileData.thumbnailUrl ? (
                <img 
                  src={message.fileData.thumbnailUrl} 
                  alt={message.fileData.name}
                  className="rounded-lg max-w-full h-auto cursor-pointer"
                  onClick={() => setFilePreview(message.fileData)}
                />
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">
                    {proxmoxRef.current?.getFileIcon(message.fileData.type)}
                  </span>
                  <div>
                    <div className="font-medium">{message.fileData.name}</div>
                    <div className="text-sm opacity-75">
                      {formatFileSize(message.fileData.size)}
                    </div>
                  </div>
                </div>
              )}
              {message.text && (
                <div className="text-sm">{message.text}</div>
              )}
            </div>
          ) : (
            <div>{message.text}</div>
          )}
          
          <div className={`text-xs mt-1 ${
            isOwn ? 'text-blue-100' : 'text-gray-500'
          }`}>
            {formatTime(message.timestamp)}
            {message.sending && <span className="ml-1">⏳</span>}
            {message.failed && <span className="ml-1">❌</span>}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <h1 className="text-xl font-semibold">
                {user.username === 'ammu' ? 'Vero' : 'Ammu'}
              </h1>
            </div>
            {isOnline && (
              <span className="text-sm text-green-600">Online</span>
            )}
          </div>
          
          <button
            onClick={onLogout}
            className="text-red-600 hover:text-red-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-2"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag and drop overlay */}
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center z-50"
          >
            <div className="bg-white rounded-lg p-8 text-center">
              <div className="text-4xl mb-4">📎</div>
              <div className="text-xl font-semibold">Drop files to share</div>
            </div>
          </motion.div>
        )}

        {/* Upload progress */}
        <AnimatePresence>
          {Object.entries(uploadProgress).map(([id, upload]) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-blue-100 rounded-lg p-3 mb-2"
            >
              <div className="flex items-center space-x-2">
                <div className="text-blue-600">📤</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{upload.fileName}</div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Messages */}
        {messages.map(renderMessage)}

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start mb-4"
          >
            <div className="bg-gray-200 rounded-2xl px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatBottom} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            📎
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message..."
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:border-blue-500"
          />
          
          <button
            type="submit"
            disabled={!input.trim()}
            className="bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            ➤
          </button>
        </div>
      </form>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
      />

      {/* File preview modal */}
      {filePreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setFilePreview(null)}
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-lg p-4 max-w-4xl max-h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{filePreview.name}</h3>
              <button
                onClick={() => setFilePreview(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {filePreview.type.startsWith('image/') ? (
              <img 
                src={filePreview.url} 
                alt={filePreview.name}
                className="max-w-full h-auto rounded-lg"
              />
            ) : (
              <div className="text-center p-8">
                <div className="text-4xl mb-4">
                  {proxmoxRef.current?.getFileIcon(filePreview.type)}
                </div>
                <div className="font-medium">{filePreview.name}</div>
                <div className="text-gray-500">{formatFileSize(filePreview.size)}</div>
                <a
                  href={filePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Download
                </a>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
