# Hellow Backend

This is the backend for the Hellow peer-to-peer chat app. It supports:
- Login (default: jackma / 12345)
- Real-time chat (max 2 peers per room)
- Image upload
- Local storage of chat history and images

## Getting Started

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the server:
   ```sh
   npm start
   ```
3. The backend runs on port 4000 by default.

## API Endpoints
- `POST /api/login` — Login with username and password
- `POST /api/upload` — Upload images
- WebSocket — Real-time chat

## Privacy
- All chat history and images are stored locally on your server.
- No third-party analytics or tracking.

---

Ready to connect to the Next.js frontend.
