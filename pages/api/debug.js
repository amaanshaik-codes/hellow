// Debug API to test authentication and environment variables
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const debug = {
    timestamp: new Date().toISOString(),
    method: req.method,
    hasJwtSecret: !!process.env.JWT_SECRET,
    jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
    wsRoom: process.env.NEXT_PUBLIC_WS_ROOM || 'not-set',
    headers: {
      authorization: req.headers.authorization ? 'present' : 'missing',
      contentType: req.headers['content-type'] || 'not-set'
    }
  };
  
  // Test token if provided
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      debug.token = {
        valid: true,
        username: decoded.username,
        exp: decoded.exp,
        isExpired: decoded.exp && decoded.exp * 1000 < Date.now()
      };
    } catch (error) {
      debug.token = {
        valid: false,
        error: error.message,
        name: error.name
      };
    }
  }
  
  res.json(debug);
}
