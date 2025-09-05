import { useState, useEffect } from 'react';
import useUltraFastChat from '../hooks/useUltraFastChat';

export default function UltraFastChatDemo({ username, jwtToken }) {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(true);
  
  const {
    messages,
    typingUsers,
    onlineUsers,
    sendMessage,
    sendTyping,
    connectionInfo,
    latencyStats,
    isConnected
  } = useUltraFastChat(username, jwtToken);

  // Handle typing indicators
  useEffect(() => {
    if (inputText.trim() && !isTyping) {
      setIsTyping(true);
      sendTyping(true);
    } else if (!inputText.trim() && isTyping) {
      setIsTyping(false);
      sendTyping(false);
    }
  }, [inputText, isTyping, sendTyping]);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    try {
      await sendMessage(inputText);
      setInputText('');
      setIsTyping(false);
      sendTyping(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Header with performance stats */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">⚡ Ultra-Fast Chat</h1>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                connectionInfo.color === 'green' ? 'bg-green-500' :
                connectionInfo.color === 'blue' ? 'bg-blue-500' :
                connectionInfo.color === 'orange' ? 'bg-orange-500' : 'bg-gray-500'
              }`}></div>
              <span className="text-sm font-medium">{connectionInfo.label}</span>
              {connectionInfo.latency > 0 && (
                <span className="text-xs text-gray-400">
                  {connectionInfo.latency}ms
                </span>
              )}
            </div>

            {/* Performance Toggle */}
            <button
              onClick={() => setPerformanceMode(!performanceMode)}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                performanceMode 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {performanceMode ? '🚀 Ultra Mode' : '🐌 Normal Mode'}
            </button>
          </div>
        </div>

        {/* Performance Stats */}
        {performanceMode && Object.keys(latencyStats).length > 0 && (
          <div className="mt-2 flex gap-4 text-xs text-gray-400">
            {Object.entries(latencyStats).map(([method, stats]) => (
              <div key={method} className="flex items-center gap-1">
                <span className="capitalize">{method}:</span>
                <span className="text-white font-mono">{stats.avg}ms</span>
                <span>({stats.min}-{stats.max}ms)</span>
              </div>
            ))}
          </div>
        )}

        {/* Online Users */}
        {onlineUsers.length > 0 && (
          <div className="mt-2 text-xs text-green-400">
            Online: {onlineUsers.join(', ')}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.username === username ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                message.username === username
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-white'
              }`}
            >
              <div className="text-sm">{message.text}</div>
              <div className="text-xs opacity-70 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {/* Typing Indicators */}
        {typingUsers.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-700 px-4 py-2 rounded-2xl">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <span className="text-xs text-gray-400">
                  {typingUsers.join(', ')} typing...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            disabled={!isConnected}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || !isConnected}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
          >
            Send
          </button>
        </div>
        
        {/* Connection Info */}
        <div className="mt-2 text-xs text-gray-500 text-center">
          {connectionInfo.description}
          {performanceMode && connectionInfo.latency > 0 && (
            <span> • Average latency: {connectionInfo.latency}ms</span>
          )}
        </div>
      </div>
    </div>
  );
}
