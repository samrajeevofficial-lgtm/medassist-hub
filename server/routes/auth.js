const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { requireAuth } = require('../middleware/auth');
const { str, bad, HttpError } = require('../utils/validate');

const router = express.Router();

// Slow down password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@medassist.app').toLowerCase();
const demoLoginEnabled = () => process.env.ALLOW_DEMO_LOGIN !== 'false';
const demoAvailable = () => demoLoginEnabled() && Boolean(db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_EMAIL));

function issueToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, created_at: u.created_at };
}

router.post('/register', authLimiter, (req, res) => {
  const name = str(req.body.name, 'Name', { required: true, max: 80 });
  const email = str(req.body.email, 'Email', { required: true, max: 120 }).toLowerCase();
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address.');
  if (password.length < 8) throw bad('Password must be at least 8 characters.');

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with this email already exists.');
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
  db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(info.lastInsertRowid);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

router.post('/login', authLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  res.json({ token: issueToken(user), user: publicUser(user) });
});

// One-click sign-in to the seeded demo account (for presentations). Disable with ALLOW_DEMO_LOGIN=false.
router.post('/demo', authLimiter, (req, res) => {
  if (!demoLoginEnabled()) throw new HttpError(403, 'Demo login is turned off on this server.');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
  if (!user) throw new HttpError(404, 'The demo account has not been created yet. Run "npm run seed" on the server.');
  res.json({ token: issueToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  res.json({ user: publicUser(user) });
});

router.post('/change-password', requireAuth, authLimiter, (req, res) => {
  const { currentPassword = '', newPassword = '' } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(currentPassword), user.password_hash)) throw bad('Current password is incorrect.');
  if (String(newPassword).length < 8) throw bad('New password must be at least 8 characters.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(newPassword), 10), user.id);
  res.json({ ok: true });
});

router.delete('/account', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) throw bad('Password is incorrect.');
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // cascades to all user data
  res.json({ ok: true });
});

module.exports = router;
module.exports.demoAvailable = demoAvailable;
