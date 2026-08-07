// server/auth.js
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function generateToken(payload){
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function verifyToken(token){
  try{ return jwt.verify(token, SECRET); }catch(e){ return null; }
}

async function requireAuth(req, res, next){
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ error: 'missing_authorization' });
  const parts = authHeader.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'invalid_authorization' });
  const token = parts[1];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });
  req.user = { id: payload.id, email: payload.email };
  next();
}

module.exports = { generateToken, verifyToken, requireAuth };
