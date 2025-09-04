# 🗄️ HELLOW CHAT - DATA STORAGE MAPPING

## All data is stored in **VERCEL KV** (Redis-compatible database)

### 📱 **CHAT MESSAGES**
**Storage Location**: `messages:ammu-vero-private-room`
**Data Type**: Array of message objects
**Example**:
```json
{
  "id": "msg_1725467890123_abc123",
  "text": "Hey! How are you?",
  "username": "ammu",
  "timestamp": 1725467890123,
  "replyTo": null,
  "edited": false
}
```
**Files that access this**:
- `pages/api/messages/store.js` - Saves & retrieves messages
- `pages/api/realtime-sse.js` - Real-time message polling
- `lib/sseManager.js` - Message history loading

---

### 👥 **ONLINE/OFFLINE STATUS & LAST SEEN**
**Storage Location**: `presence:ammu-vero-private-room`
**Data Type**: Object with user presence info
**Example**:
```json
{
  "ammu": {
    "status": "online",
    "lastSeen": 1725467890123,
    "connectedAt": 1725467890100
  },
  "vero": {
    "status": "offline", 
    "lastSeen": 1725467800000
  }
}
```
**Files that access this**:
- `pages/api/realtime-sse.js` - Updates on connect/disconnect
- `pages/api/presence.js` - Manual presence updates
- `lib/sseManager.js` - Presence heartbeats

---

### 🔐 **LOGIN TIMES & USER STATS**
**Storage Location**: `stats:ammu` and `stats:vero`
**Data Type**: Object with user statistics
**Example**:
```json
{
  "username": "ammu",
  "lastLogin": 1725467890123,
  "totalLogins": 47,
  "lastActivity": 1725467890123
}
```
**Files that access this**:
- `pages/api/login.js` - Saves login timestamp when user logs in
- `pages/api/stats.js` - Retrieves stats for login screen display
- `components/Login.js` - Displays "Last login: 2h ago"

---

### 📖 **READ RECEIPTS & MESSAGE STATUS**
**Storage Location**: `read:ammu-vero-private-room:MESSAGE_ID`
**Data Type**: Object with read status
**Example**:
```json
{
  "messageId": "msg_1725467890123_abc123",
  "readBy": "vero",
  "readAt": 1725467895000,
  "roomId": "ammu-vero-private-room"
}
```
**Files that access this**:
- `pages/api/messages/read.js` - Tracks read receipts
- `components/ChatSSE.js` - Shows "Read/Delivered" status

---

### 📚 **LAST READ TIMESTAMPS**
**Storage Location**: `lastread:ammu-vero-private-room:USERNAME`
**Data Type**: Timestamp (number)
**Example**: `1725467890123`
**Purpose**: Track when each user last read messages (for unread count)
**Files that access this**:
- `pages/api/messages/read.js` - Updates when messages marked as read
- `pages/api/stats.js` - Calculates unread message count
- `components/ChatSSE.js` - Manages unread indicators

---

### 📤 **OFFLINE MESSAGE QUEUE**
**Storage Location**: `fallback:USERNAME` 
**Data Type**: Array of messages for offline users
**Example**:
```json
[
  {
    "id": "msg_1725467890123_abc123",
    "text": "Message sent while you were offline",
    "username": "ammu",
    "timestamp": 1725467890123
  }
]
```
**Files that access this**:
- `pages/api/messages/store.js` - Queues messages for offline users
- `pages/api/realtime-sse.js` - Delivers queued messages when user comes online

---

### ⌨️ **TYPING INDICATORS**
**Storage Location**: `typing:ammu-vero-private-room:USERNAME`
**Data Type**: Object with typing status
**Example**:
```json
{
  "username": "ammu",
  "isTyping": true,
  "targetUser": "vero",
  "timestamp": 1725467890123
}
```
**Files that access this**:
- `pages/api/typing.js` - Updates typing status
- `pages/api/realtime-sse.js` - Broadcasts typing indicators
- `lib/sseManager.js` - Sends typing updates

---

## 🔑 **VERCEL KV KEYS SUMMARY**:

| Data Type | KV Key Pattern | Contains |
|-----------|----------------|----------|
| **Chat Messages** | `messages:ammu-vero-private-room` | All chat history |
| **User Presence** | `presence:ammu-vero-private-room` | Online/offline status |
| **Login Stats** | `stats:ammu`, `stats:vero` | Last login times |
| **Read Receipts** | `read:ammu-vero-private-room:msg_id` | Message read status |
| **Last Read Time** | `lastread:ammu-vero-private-room:username` | Unread tracking |
| **Message Queue** | `fallback:username` | Offline message delivery |
| **Typing Status** | `typing:ammu-vero-private-room:username` | Real-time typing |

---

## 🛡️ **DATA PERSISTENCE & EXPIRY**:

- **Chat Messages**: ♾️ **Permanent** (cleaned after 30 days)
- **User Stats**: 🗓️ **30 days** expiry
- **Presence**: ⏰ **1 hour** expiry (refreshed on activity)
- **Read Receipts**: 📅 **24 hours** expiry  
- **Message Queue**: 📪 **24 hours** expiry
- **Typing Status**: ⚡ **Auto-clear** after 4 seconds

---

## 🔍 **HOW TO VIEW YOUR DATA**:

1. **Vercel Dashboard** → Your Project → Storage → KV
2. **CLI**: `npx @vercel/kv ls` (lists all keys)
3. **CLI**: `npx @vercel/kv get "messages:ammu-vero-private-room"` (view chats)
4. **CLI**: `npx @vercel/kv get "stats:ammu"` (view login times)

Your chat history, login times, and online status are all safely stored in Vercel's KV database and persist across sessions, devices, and deployments!
