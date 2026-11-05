const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Rejects the request unless a valid token is present.
function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Please log in to use this feature.' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

// Attaches req.user when a valid token is present, but never blocks.
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = { id: payload.sub, name: payload.name, email: payload.email };
    } catch { /* treat as guest */ }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
