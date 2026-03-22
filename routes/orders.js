const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { sendOrderConfirmation, sendOrderNotification } = require('../email');
const { requireAdmin } = require('../middleware/auth');
const { resolveItems } = require('../config/menu');

const router = express.Router();

// POST /api/orders — Create an order (non-Stripe fallback)
router.post('/', [
  body('customer_name').trim().notEmpty().withMessage('Name is required.').escape(),
  body('customer_email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('items').isArray({ min: 1 }).withMessage('At least one item required.'),
  body('items.*.id').trim().notEmpty().withMessage('Item ID is required.'),
  body('items.*.qty').isInt({ min: 1, max: 100 }).withMessage('Item quantity must be 1-100.'),
  body('tip').optional().isFloat({ min: 0, max: 1000 }).withMessage('Invalid tip amount.'),
  body('delivery_type').optional().isIn(['pickup', 'delivery']).withMessage('Invalid delivery type.'),
  body('delivery_address').optional().trim().escape(),
  body('payment_method').optional().isIn(['card', 'paypal', 'apple_pay']).withMessage('Invalid payment method.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { customer_name, customer_email, customer_phone, items, tip, delivery_type, delivery_address, payment_method } = req.body;

  // ── SERVER-SIDE PRICE RECALCULATION ──────────────────────────
  // Never trust client-sent totals. Recalculate from trusted menu prices.
  let resolvedItems, subtotal;
  try {
    ({ resolvedItems, subtotal } = resolveItems(items));
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  const safeTip = Math.max(0, Math.min(parseFloat(tip) || 0, subtotal)); // Cap tip at subtotal
  const total = subtotal + safeTip;

  const ref = 'SAV-' + uuidv4().split('-')[0].toUpperCase();

  try {
    const db = getDb();
    const stmt = db.prepare(`INSERT INTO orders (ref, customer_name, customer_email, customer_phone, items, subtotal, tip, total, delivery_type, delivery_address, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(ref, customer_name, customer_email, customer_phone || '', JSON.stringify(resolvedItems), subtotal, safeTip, total, delivery_type || 'pickup', delivery_address || '', payment_method || 'card');

    // Send emails
    try {
      await sendOrderConfirmation({ name: customer_name, email: customer_email, ref, items: resolvedItems, subtotal, tip: safeTip, total, delivery_type: delivery_type || 'pickup', delivery_address: delivery_address || '', payment_method: payment_method || 'card' });
      await sendOrderNotification({ name: customer_name, email: customer_email, phone: customer_phone || '', ref, items: resolvedItems, subtotal, tip: safeTip, total, delivery_type: delivery_type || 'pickup', delivery_address: delivery_address || '', payment_method: payment_method || 'card' });
    } catch (emailErr) {
      console.error('Order email error:', emailErr.message);
    }

    res.status(201).json({ success: true, order: { ref, total } });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ success: false, error: 'Could not create order.' });
  }
});

// GET /api/orders — List all orders (ADMIN ONLY)
router.get('/', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch orders.' });
  }
});

// GET /api/orders/:ref — Get single order (ADMIN ONLY)
router.get('/:ref', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE ref = ?').get(req.params.ref);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch order.' });
  }
});

// PATCH /api/orders/:ref — Update order status (ADMIN ONLY + validated)
router.patch('/:ref', requireAdmin, [
  param('ref').trim().notEmpty().escape(),
  body('status').isIn(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'paid'])
    .withMessage('Invalid status. Must be one of: pending, confirmed, preparing, ready, delivered, cancelled, paid.')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const db = getDb();
    const { status } = req.body;
    const result = db.prepare('UPDATE orders SET status = ? WHERE ref = ?').run(status, req.params.ref);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update order.' });
  }
});

module.exports = router;
