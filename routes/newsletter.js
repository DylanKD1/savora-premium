const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db');

const router = express.Router();

// POST /api/newsletter
router.post('/', [
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { email } = req.body;

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM newsletter_subscribers WHERE email = ?').get(email);
    if (existing) return res.json({ success: true, message: 'You are already subscribed!' });

    db.prepare('INSERT INTO newsletter_subscribers (email) VALUES (?)').run(email);
    res.status(201).json({ success: true, message: 'Subscribed successfully!' });
  } catch (err) {
    console.error('Newsletter error:', err.message);
    res.status(500).json({ success: false, error: 'Subscription failed.' });
  }
});

// GET /api/newsletter
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const subscribers = db.prepare('SELECT * FROM newsletter_subscribers ORDER BY subscribed_at DESC').all();
    res.json({ success: true, subscribers });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch subscribers.' });
  }
});

module.exports = router;
