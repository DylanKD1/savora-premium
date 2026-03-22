const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { sendBookingConfirmation, sendBookingNotification } = require('../email');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/bookings — Create a booking (public)
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required.').escape(),
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Phone is required.'),
  body('guests').isInt({ min: 1, max: 20 }).withMessage('Guests must be 1-20.'),
  body('date').notEmpty().withMessage('Date is required.'),
  body('time').notEmpty().withMessage('Time is required.'),
  body('preorder').optional().trim().escape(),
  body('notes').optional().trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { name, email, phone, guests, date, time, preorder, notes } = req.body;
  const ref = 'SAV-' + uuidv4().split('-')[0].toUpperCase();

  try {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO bookings (ref, name, email, phone, guests, date, time, preorder, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(ref, name, email, phone, guests, date, time, preorder || '', notes || '');

    // Send emails
    try {
      await sendBookingConfirmation({ name, email, phone, ref, guests, date, time, preorder });
      await sendBookingNotification({ name, email, phone, ref, guests, date, time, preorder });
    } catch (emailErr) {
      console.error('Booking email error:', emailErr.message);
    }

    res.status(201).json({ success: true, booking: { ref, name, email, guests, date, time } });
  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ success: false, error: 'Could not create booking.' });
  }
});

// GET /api/bookings — List all bookings (ADMIN ONLY)
router.get('/', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch bookings.' });
  }
});

// GET /api/bookings/:ref — Get single booking (ADMIN ONLY)
router.get('/:ref', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE ref = ?').get(req.params.ref);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch booking.' });
  }
});

// PATCH /api/bookings/:ref — Update booking status (ADMIN ONLY + validated)
router.patch('/:ref', requireAdmin, [
  param('ref').trim().notEmpty().escape(),
  body('status').isIn(['confirmed', 'cancelled', 'completed', 'no-show'])
    .withMessage('Invalid status. Must be one of: confirmed, cancelled, completed, no-show.')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const db = getDb();
    const { status } = req.body;
    const result = db.prepare('UPDATE bookings SET status = ? WHERE ref = ?').run(status, req.params.ref);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update booking.' });
  }
});

module.exports = router;
