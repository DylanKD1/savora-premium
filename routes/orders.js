const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { sendOrderConfirmation, sendOrderNotification } = require('../email');

const router = express.Router();

// POST /api/orders — Create an order (non-Stripe fallback)
router.post('/', [
  body('customer_name').trim().notEmpty().withMessage('Name is required.').escape(),
  body('customer_email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('items').isArray({ min: 1 }).withMessage('At least one item required.'),
  body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal required.'),
  body('total').isFloat({ min: 0 }).withMessage('Total required.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { customer_name, customer_email, customer_phone, items, subtotal, tip, total, delivery_type, delivery_address, payment_method } = req.body;
  const ref = 'SAV-' + uuidv4().split('-')[0].toUpperCase();

  try {
    const db = getDb();
    const stmt = db.prepare(`INSERT INTO orders (ref, customer_name, customer_email, customer_phone, items, subtotal, tip, total, delivery_type, delivery_address, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(ref, customer_name, customer_email, customer_phone || '', JSON.stringify(items), subtotal, tip || 0, total, delivery_type || 'pickup', delivery_address || '', payment_method || 'card');

    // Send emails
    try {
      await sendOrderConfirmation({ name: customer_name, email: customer_email, ref, items, subtotal, tip: tip || 0, total, delivery_type: delivery_type || 'pickup', delivery_address: delivery_address || '', payment_method: payment_method || 'card' });
      await sendOrderNotification({ name: customer_name, email: customer_email, phone: customer_phone || '', ref, items, subtotal, tip: tip || 0, total, delivery_type: delivery_type || 'pickup', delivery_address: delivery_address || '', payment_method: payment_method || 'card' });
    } catch (emailErr) {
      console.error('Order email error:', emailErr.message);
    }

    res.status(201).json({ success: true, order: { ref, total } });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ success: false, error: 'Could not create order.' });
  }
});

// GET /api/orders
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch orders.' });
  }
});

// GET /api/orders/:ref
router.get('/:ref', (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE ref = ?').get(req.params.ref);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch order.' });
  }
});

// PATCH /api/orders/:ref
router.patch('/:ref', (req, res) => {
  try {
    const db = getDb();
    const { status } = req.body;
    db.prepare('UPDATE orders SET status = ? WHERE ref = ?').run(status || 'pending', req.params.ref);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update order.' });
  }
});

module.exports = router;
