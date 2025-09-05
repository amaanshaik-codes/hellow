import crypto from 'crypto';
import { kv } from '@vercel/kv';

// Hash password function
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Validate password strength
function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  
  if (password.length > 128) {
    return { valid: false, message: 'Password must be less than 128 characters' };
  }
  
  return { valid: true };
}

// Get current user credentials
function getCurrentCredentials() {
  return {
    ammu: {
      password: process.env.AMMU_PASSWORD_HASH || 'f6ee94ecb014f74f887b9dcc52daecf73ab3e3333320cadd98bcb59d895c52f5',
      displayName: 'Ammu',
      avatar: '💕'
    },
    vero: {
      password: process.env.VERO_PASSWORD_HASH || 'f6ee94ecb014f74f887b9dcc52daecf73ab3e3333320cadd98bcb59d895c52f5',
      displayName: 'Vero',
      avatar: '✨'
    }
  };
}

// Verify current password
function verifyCurrentPassword(username, currentPassword) {
  const normalizedUsername = (username || '').toLowerCase().trim();
  const credentials = getCurrentCredentials();
  
  if (!credentials[normalizedUsername]) {
    return { valid: false, message: 'User not found' };
  }
  
  const hashedCurrentPassword = hashPassword(currentPassword);
  if (hashedCurrentPassword !== credentials[normalizedUsername].password) {
    return { valid: false, message: 'Current password is incorrect' };
  }
  
  return { valid: true };
}

// Update password in KV storage
async function updatePasswordInStorage(username, newPasswordHash) {
  try {
    const storageKey = `user_password_${username}`;
    const passwordData = {
      hash: newPasswordHash,
      updatedAt: new Date().toISOString(),
      username: username
    };
    
    await kv.set(storageKey, passwordData);
    
    // Also store in a backup key for redundancy
    await kv.set(`backup_${storageKey}`, passwordData);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to update password in storage:', error);
    return { success: false, error: error.message };
  }
}

// Get updated password from storage
async function getPasswordFromStorage(username) {
  try {
    const storageKey = `user_password_${username}`;
    const passwordData = await kv.get(storageKey);
    
    if (passwordData && passwordData.hash) {
      return passwordData.hash;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get password from storage:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  // Set CORS headers
  const allowedOrigins = [
    'https://helloww.vercel.app',
    'https://hellow-git-main-amaanshaik-codes.vercel.app',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { username, currentPassword, newPassword, confirmPassword } = req.body || {};
    
    // Validate required fields
    if (!username || !currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, current password, new password, and confirmation are required' 
      });
    }

    // Normalize username
    const normalizedUsername = username.toLowerCase().trim();
    
    // Only allow Ammu and Vero
    if (!['ammu', 'vero'].includes(normalizedUsername)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. This is a private chat.' 
      });
    }

    // Verify current password
    const currentPasswordCheck = verifyCurrentPassword(normalizedUsername, currentPassword);
    if (!currentPasswordCheck.valid) {
      return res.status(401).json({ 
        success: false, 
        message: currentPasswordCheck.message 
      });
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: passwordValidation.message 
      });
    }

    // Check password confirmation
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password and confirmation do not match' 
      });
    }

    // Check if new password is different from current
    if (currentPassword === newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be different from current password' 
      });
    }

    // Hash new password
    const newPasswordHash = hashPassword(newPassword);

    // Update password in storage
    const updateResult = await updatePasswordInStorage(normalizedUsername, newPasswordHash);
    if (!updateResult.success) {
      console.error('Password update failed:', updateResult.error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update password. Please try again.' 
      });
    }

    // Log password change for security
    console.log(`Password changed for user: ${normalizedUsername} at ${new Date().toISOString()}`);

    // Success response
    return res.status(200).json({ 
      success: true, 
      message: 'Password updated successfully! Please log in with your new password.',
      user: {
        username: normalizedUsername,
        displayName: normalizedUsername === 'ammu' ? 'Ammu' : 'Vero',
        avatar: normalizedUsername === 'ammu' ? '💕' : '✨'
      }
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error. Please try again later.' 
    });
  }
}
