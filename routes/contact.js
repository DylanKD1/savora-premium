const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { getDb } = require('../db');
const { sendContactNotification, sendContactConfirmation } = require('../email');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/contact — Submit contact message + send emails (public)
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

// GET /api/contact — List all messages (ADMIN ONLY)
router.get('/', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch messages.' });
  }
});

// PATCH /api/contact/:id — Update message status (ADMIN ONLY + validated)
router.patch('/:id', requireAdmin, [
  param('id').isInt().withMessage('Invalid message ID.'),
  body('status').isIn(['unread', 'read', 'replied', 'archived'])
    .withMessage('Invalid status. Must be one of: unread, read, replied, archived.')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const db = getDb();
    const { status } = req.body;
    const result = db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status, req.params.id);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Message not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update message.' });
  }
});

module.exports = router;
