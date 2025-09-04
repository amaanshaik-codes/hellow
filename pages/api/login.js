import crypto from 'crypto';

// Exclusive profiles for Ammu and Vero
const AUTHORIZED_USERS = {
  ammu: {
    password: 'qwerty12345',
    displayName: 'Ammu',
    avatar: '💕'
  },
  vero: {
    password: 'qwerty12345', 
    displayName: 'Vero',
    avatar: '✨'
  }
};

function signPayload(payload, secret) {
  try {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  } catch (error) {
    console.error('Token signing error:', error);
    throw new Error('Failed to generate authentication token');
  }
}

function validateCredentials(username, password) {
  const normalizedUsername = (username || '').toLowerCase().trim();
  
  // Only allow Ammu and Vero
  if (!AUTHORIZED_USERS[normalizedUsername]) {
    return { valid: false, message: 'Access denied. This is a private chat.' };
  }
  
  if (password !== AUTHORIZED_USERS[normalizedUsername].password) {
    return { valid: false, message: 'Invalid password. Please try again.' };
  }
  
  return { 
    valid: true, 
    user: {
      username: normalizedUsername,
      displayName: AUTHORIZED_USERS[normalizedUsername].displayName,
      avatar: AUTHORIZED_USERS[normalizedUsername].avatar
    }
  };
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body || {};
    
    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Validate credentials
    const validation = validateCredentials(username, password);
    if (!validation.valid) {
      return res.status(401).json({ 
        success: false, 
        message: validation.message 
      });
    }

    // Generate secure JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable not set');
      return res.status(500).json({ 
        success: false, 
        message: 'Server configuration error' 
      });
    }

    const tokenPayload = {
      username: validation.user.username,
      displayName: validation.user.displayName,
      iat: Date.now(),
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };

    const token = signPayload(tokenPayload, jwtSecret);

    // Record login time
    try {
      await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: validation.user.username,
          action: 'login',
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.log('Failed to record login time:', error.message);
    }

    // Successful authentication
    return res.json({
      success: true,
      token,
      user: validation.user,
      message: `Welcome back, ${validation.user.displayName}! 💕`
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication service temporarily unavailable'
    });
  }
}
