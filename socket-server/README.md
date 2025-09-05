Hellow Socket Server

This is a lightweight Socket.io server intended for deployment on Render (or any host that supports long-lived sockets).

Environment variables:
- JWT_SECRET: required to validate incoming tokens
- PORT: optional, defaults to 3001

Start locally:

```bash
cd socket-server
npm install
JWT_SECRET=dev node index.js
```
