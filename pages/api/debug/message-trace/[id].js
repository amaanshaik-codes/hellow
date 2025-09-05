import { getTraces } from '../../../../lib/messageTrace';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing message id' });

  // Require same JWT-based auth as other fast endpoints
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.substring(7);
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: 'JWT secret not configured' });
  try {
    jwt.verify(token, jwtSecret);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const traces = await getTraces(id);
    return res.status(200).json({ id, traces });
  } catch (err) {
    console.error('Debug trace endpoint error', err);
    return res.status(500).json({ error: 'Failed to fetch traces' });
  }
}
