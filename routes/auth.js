const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'savora-secret-change-in-production';
const JWT_EXPIRES = '7d';

// POST /api/auth/register
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters.').escape(),
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  body('name').trim().notEmpty().withMessage('Full name is required.').escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { username, email, password, name } = req.body;

  try {
    const db = getDb();

    // Check if username or email already exists
    const existing = db.prepare('SELECT id FROM members WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username or email already registered. Please log in.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const stmt = db.prepare('INSERT INTO members (username, email, password_hash, name) VALUES (?, ?, ?, ?)');
    const info = stmt.run(username, email, hash, name);

    const token = jwt.sign({ id: info.lastInsertRowid, username, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to Savora!',
      token,
      member: { id: info.lastInsertRowid, username, email, name }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('login').trim().notEmpty().withMessage('Username or email is required.'),
  body('password').notEmpty().withMessage('Password is required.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { login, password } = req.body;

  try {
    const db = getDb();
    const member = db.prepare('SELECT * FROM members WHERE username = ? OR email = ?').get(login, login);

    if (!member) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: member.id, username: member.username, email: member.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      success: true,
      message: `Welcome back, ${member.name}!`,
      token,
      member: {
        id: member.id,
        username: member.username,
        email: member.email,
        name: member.name,
        stripe_customer_id: member.stripe_customer_id || null
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me — Get current user profile (requires token)
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const member = db.prepare('SELECT id, username, email, name, stripe_customer_id, created_at FROM members WHERE id = ?').get(decoded.id);
    if (!member) return res.status(404).json({ success: false, error: 'Member not found.' });

    res.json({ success: true, member });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
});

module.exports = router;
