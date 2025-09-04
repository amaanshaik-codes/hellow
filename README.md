# 💕 Hellow - Private Chat for Ammu & Vero

A beautiful, secure, and exclusive chat application designed just for Ammu and Vero. Features Apple-inspired design with end-to-end encrypted messaging via WebRTC.

## ✨ Features

- **Exclusive Access**: Only Ammu and Vero can log in
- **Beautiful UI**: Apple iMessage-inspired design with dark/light themes
- **Real-time Messaging**: Instant delivery with read receipts
- **End-to-End**: Messages sent directly between devices (WebRTC P2P)
- **Persistent History**: Messages saved securely in Redis
- **Cross-Platform**: Works on phones, tablets, and computers
- **Secure**: JWT authentication, HTTPS, encrypted storage

## 🚀 Quick Start

### For Users (Ammu & Vero)

1. Visit your deployed app URL
2. Click your profile (Ammu or Vero)
3. Enter password: `qwerty12345`
4. Start chatting! 💬

### For Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **UI Components**: Radix UI, Framer Motion
- **Communication**: WebRTC for P2P messaging
- **Authentication**: JWT with secure password validation
- **Storage**: Upstash Redis for signaling and history
- **Deployment**: Vercel

## 📦 Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete deployment instructions.

### Quick Deploy to Vercel

1. Push code to GitHub
2. Import project to Vercel
3. Set up Upstash Redis
4. Add environment variables
5. Deploy!

## 🔧 Configuration

### Environment Variables

```bash
# Authentication
JWT_SECRET=your-secret-key

# Database (Upstash Redis)
UPSTASH_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Chat Configuration
NEXT_PUBLIC_WS_ROOM=ammu-vero-private-room

# Optional: TURN servers for better P2P
NEXT_PUBLIC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

### Customize Profiles

Edit `pages/api/login.js` to change usernames, passwords, or display names:

```javascript
const AUTHORIZED_USERS = {
  ammu: {
    password: 'your-password-here',
    displayName: 'Ammu',
    avatar: '💕'
  },
  vero: {
    password: 'your-password-here',
    displayName: 'Vero', 
    avatar: '✨'
  }
};
```

## 🔒 Security Features

- **Exclusive Access**: Hardcoded user validation
- **Secure Passwords**: JWT token authentication
- **HTTPS Only**: Secure transport layer
- **P2P Messaging**: Direct device-to-device communication
- **Temporary Signaling**: Auto-expiring connection data

## 📱 Browser Support

- Chrome 80+
- Safari 14+
- Firefox 78+
- Edge 88+

Requires WebRTC support for P2P messaging.

## 🛡 Privacy

- Messages are sent directly between your devices
- Only connection signaling passes through the server
- Chat history is encrypted at rest
- No analytics or tracking
- No third-party access to messages

## 💝 Made with Love

Created specifically for Ammu and Vero's private conversations. Enjoy your secure, beautiful chat experience!

---

**Questions?** Check the [Deployment Guide](DEPLOYMENT_GUIDE.md) or create an issue.
