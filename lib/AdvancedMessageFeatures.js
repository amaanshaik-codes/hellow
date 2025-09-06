// Advanced message features: reactions, replies, search, media
export class AdvancedMessageFeatures {
  constructor(messagingEngine) {
    this.messaging = messagingEngine;
    this.messageIndex = new Map(); // For search
    this.reactions = new Map(); // Message reactions
    this.threads = new Map(); // Message threads
  }

  // Message reactions
  async addReaction(messageId, reaction) {
    const reactions = this.reactions.get(messageId) || new Map();
    const userReactions = reactions.get(this.messaging.username) || new Set();
    
    userReactions.add(reaction);
    reactions.set(this.messaging.username, userReactions);
    this.reactions.set(messageId, reactions);

    // Send reaction update
    await this.messaging.sendMessage(`__REACTION__${messageId}:${reaction}`, null, null, 'reaction');
  }

  // Message search with fuzzy matching
  searchMessages(query, options = {}) {
    const { limit = 50, fuzzy = true } = options;
    const results = [];
    
    for (const [messageId, messageText] of this.messageIndex) {
      let score = 0;
      
      if (fuzzy) {
        score = this.fuzzyMatch(query.toLowerCase(), messageText.toLowerCase());
      } else {
        score = messageText.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      }
      
      if (score > 0.3) { // Minimum relevance threshold
        results.push({ messageId, text: messageText, score });
      }
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Fuzzy string matching algorithm
  fuzzyMatch(pattern, text) {
    let patternIdx = 0;
    let textIdx = 0;
    let score = 0;
    let matches = 0;
    
    while (patternIdx < pattern.length && textIdx < text.length) {
      if (pattern[patternIdx] === text[textIdx]) {
        score += 1;
        matches++;
        patternIdx++;
      }
      textIdx++;
    }
    
    return matches / pattern.length;
  }

  // Message threading
  createThread(originalMessageId, reply) {
    const thread = this.threads.get(originalMessageId) || [];
    thread.push({
      id: `thread_${Date.now()}`,
      reply,
      timestamp: Date.now(),
      author: this.messaging.username
    });
    this.threads.set(originalMessageId, thread);
  }

  // Message formatting with markdown support
  formatMessage(text) {
    return text
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic text
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Links
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      // Mentions
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  // Message drafts
  saveDraft(text) {
    localStorage.setItem(`draft_${this.messaging.username}`, text);
  }

  loadDraft() {
    return localStorage.getItem(`draft_${this.messaging.username}`) || '';
  }

  clearDraft() {
    localStorage.removeItem(`draft_${this.messaging.username}`);
  }

  // Message scheduling
  scheduleMessage(text, scheduledTime) {
    const delay = scheduledTime - Date.now();
    
    if (delay <= 0) {
      // Send immediately if scheduled time is in the past
      return this.messaging.sendMessage(text);
    }
    
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          const result = await this.messaging.sendMessage(text);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }

  // Message analytics
  getMessageStats() {
    const stats = {
      totalMessages: this.messageIndex.size,
      averageLength: 0,
      mostUsedWords: new Map(),
      activityByHour: new Array(24).fill(0),
      responseTime: []
    };

    let totalLength = 0;
    const wordCount = new Map();

    for (const [messageId, text] of this.messageIndex) {
      totalLength += text.length;
      
      // Word frequency
      const words = text.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) { // Skip short words
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }
      });
    }

    stats.averageLength = totalLength / this.messageIndex.size;
    stats.mostUsedWords = new Map([...wordCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

    return stats;
  }

  // Index message for search
  indexMessage(messageId, text) {
    this.messageIndex.set(messageId, text);
  }

  // Clean up old data
  cleanup() {
    // Keep only last 1000 messages in search index
    if (this.messageIndex.size > 1000) {
      const entries = Array.from(this.messageIndex.entries());
      entries.slice(0, entries.length - 1000).forEach(([id]) => {
        this.messageIndex.delete(id);
      });
    }
  }
}
