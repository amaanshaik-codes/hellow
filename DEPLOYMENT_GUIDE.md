# 🚀 Hellow - Deployment Guide for Ammu & Vero's Private Chat

## Quick Start (5 minutes to deploy!)

### Step 1: Set up Upstash Redis (Free tier available)

1. **Sign up**: Go to [console.upstash.com](https://console.upstash.com)
2. **Create database**:
   - Click "Create database"
   - Name: `ammu-vero-chat`
   - Type: `Global` (for best performance worldwide)
   - Click "Create"

3. **Copy credentials**:
   - Click your database name
   - Go to "REST API" tab
   - Copy `UPSTASH_REST_URL` 
   - Copy `UPSTASH_REDIS_REST_TOKEN`

### Step 2: Deploy to Vercel

1. **Push to GitHub** (if not already done):
```bash
cd "C:\projects\Hellow"
git add .
git commit -m "Deploy Ammu & Vero private chat"
git push origin main
```

2. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - **Important**: Set "Root Directory" to current folder (not frontend)
   - Click "Deploy"

3. **Add Environment Variables**:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add these variables:

```
JWT_SECRET=ammu-vero-super-secret-jwt-key-change-this-to-something-random
UPSTASH_REST_URL=https://your-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
NEXT_PUBLIC_WS_ROOM=ammu-vero-private-room
```

4. **Redeploy**:
   - Go to Deployments tab
   - Click "Redeploy" on the latest deployment

### Step 3: Test Your Chat

1. Open your Vercel URL: `https://your-app-name.vercel.app`
2. Click "Ammu" → Enter password: `qwerty12345`
3. Open another browser/device → Click "Vero" → Enter password: `qwerty12345`
4. Start chatting! 💕

## Security Improvements (Recommended)

### Change Default Passwords

Edit `pages/api/login.js` and update the passwords:

```javascript
const AUTHORIZED_USERS = {
  ammu: {
    password: 'your-new-secure-password-for-ammu',
    displayName: 'Ammu',
    avatar: '💕'
  },
  vero: {
    password: 'your-new-secure-password-for-vero', 
    displayName: 'Vero',
    avatar: '✨'
  }
};
```

### Generate Strong JWT Secret

Run this command and use the output as your `JWT_SECRET`:

```bash
openssl rand -base64 32
```

Or use an online generator: [generate-secret.vercel.app](https://generate-secret.vercel.app)

## Features of Your Chat App

✅ **Exclusive Access**: Only Ammu and Vero can log in  
✅ **End-to-End**: Messages sent directly between devices (WebRTC)  
✅ **Persistent History**: Messages saved securely in Redis  
✅ **Real-time**: Instant message delivery and read receipts  
✅ **Beautiful UI**: Apple iMessage-inspired design  
✅ **Cross-platform**: Works on phones, tablets, computers  
✅ **Secure**: HTTPS, JWT authentication, private signaling  

## Troubleshooting

### "Server configuration error"
- Make sure `JWT_SECRET` is set in Vercel environment variables

### "Can't connect to chat partner"
- Check both users are online
- Try refreshing the page
- Ensure Upstash credentials are correct

### "Login fails"
- Verify passwords in `pages/api/login.js`
- Check browser console for errors

### "Messages not saving"
- Verify Upstash Redis credentials
- Check Vercel function logs

## Advanced Configuration

### Custom Domain (Optional)

1. Go to Vercel → Your Project → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

### Better P2P Connection (For Corporate Networks)

Add TURN servers to environment variables:

```
NEXT_PUBLIC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your-turn-server","username":"user","credential":"pass"}]
```

## Development & Local Testing

### Run Locally

```bash
cd "C:\projects\Hellow"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables for Local Development

Copy `.env.local` and update with your credentials:

```
JWT_SECRET=your-local-secret
UPSTASH_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-token
NEXT_PUBLIC_WS_ROOM=ammu-vero-private-room
```

## Sharing Your Chat

Once deployed, share these links:

**For Ammu**: `https://your-app.vercel.app`  
**For Vero**: `https://your-app.vercel.app`

Both use the same URL but select different profiles on login.

## Privacy & Security Notes

- Messages are sent directly between your devices (P2P)
- Only connection signaling goes through the server
- Chat history is encrypted in transit and at rest
- No third parties can access your messages
- Upstash Redis has enterprise-grade security

---

**Your private chat is ready! Enjoy secure messaging with beautiful design! 💕✨**
