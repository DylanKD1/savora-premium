const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db');
const { sendContactNotification, sendContactConfirmation } = require('../email');

const router = express.Router();

// POST /api/contact — Submit contact message + send emails
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required.').escape(),
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('reason').trim().notEmpty().withMessage('Reason is required.').escape(),
  body('message').trim().notEmpty().withMessage('Message is required.').escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { name, email, reason, message } = req.body;

  try {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO contact_messages (name, email, reason, message) VALUES (?, ?, ?, ?)');
    const info = stmt.run(name, email, reason, message);

    // Send email notification to restaurant owner
    try {
      await sendContactNotification({ name, email, reason, message });
    } catch (emailErr) {
      console.error('Failed to send notification email:', emailErr.message);
    }

    // Send confirmation email to the client
    try {
      await sendContactConfirmation({ name, email, reason, message });
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr.message);
    }

    res.status(201).json({ success: true, message: 'Message sent successfully! We will respond within 24 hours.', id: info.lastInsertRowid });
  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ success: false, error: 'Could not send message. Please try again.' });
  }
});

// GET /api/contact — List all messages
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch messages.' });
  }
});

// PATCH /api/contact/:id — Update message status
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;
    db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status || 'read', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update message.' });
  }
});

module.exports = router;
