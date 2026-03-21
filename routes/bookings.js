const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { sendBookingConfirmation, sendBookingNotification } = require('../email');

const router = express.Router();

// POST /api/bookings — Create a booking
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

// GET /api/bookings — List all bookings
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch bookings.' });
  }
});

// GET /api/bookings/:ref
router.get('/:ref', (req, res) => {
  try {
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE ref = ?').get(req.params.ref);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch booking.' });
  }
});

// PATCH /api/bookings/:ref
router.patch('/:ref', (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;
    db.prepare('UPDATE bookings SET status = ? WHERE ref = ?').run(status || 'confirmed', req.params.ref);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update booking.' });
  }
});

module.exports = router;
