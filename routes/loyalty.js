const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db');

const router = express.Router();

// POST /api/loyalty/join
router.post('/join', [
  body('name').trim().notEmpty().withMessage('Name is required.').escape(),
  body('email').optional().isEmail().normalizeEmail()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { name, email } = req.body;

  try {
    const db = getDb();

    if (email) {
      const existing = db.prepare('SELECT * FROM loyalty_members WHERE email = ?').get(email);
      if (existing) {
        return res.json({ success: true, message: `Welcome back, ${existing.name}! You already have ${existing.points} points.`, member: existing });
      }
    }

    const stmt = db.prepare('INSERT INTO loyalty_members (name, email, points) VALUES (?, ?, 50)');
    const info = stmt.run(name, email || null);

    // Log welcome bonus
    db.prepare('INSERT INTO loyalty_transactions (member_id, points, reason) VALUES (?, 50, ?)').run(info.lastInsertRowid, 'Welcome bonus');

    res.status(201).json({
      success: true,
      message: `Welcome, ${name}! Your Savora Rewards card is active.`,
      member: { id: info.lastInsertRowid, name, email, points: 50, tier: 'Bronze' }
    });
  } catch (err) {
    console.error('Loyalty join error:', err.message);
    res.status(500).json({ success: false, error: 'Could not join loyalty program.' });
  }
});

// POST /api/loyalty/points
router.post('/points', [
  body('member_id').isInt().withMessage('Member ID required.'),
  body('points').isInt({ min: 1 }).withMessage('Points must be positive.'),
  body('reason').trim().notEmpty().withMessage('Reason required.').escape()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { member_id, points, reason } = req.body;

  try {
    const db = getDb();
    db.prepare('UPDATE loyalty_members SET points = points + ? WHERE id = ?').run(points, member_id);
    db.prepare('INSERT INTO loyalty_transactions (member_id, points, reason) VALUES (?, ?, ?)').run(member_id, points, reason);
    const member = db.prepare('SELECT * FROM loyalty_members WHERE id = ?').get(member_id);
    res.json({ success: true, member });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not add points.' });
  }
});

// GET /api/loyalty/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const member = db.prepare('SELECT * FROM loyalty_members WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ success: false, error: 'Member not found.' });
    const history = db.prepare('SELECT * FROM loyalty_transactions WHERE member_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ success: true, member, history });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch member.' });
  }
});

module.exports = router;
