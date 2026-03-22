const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { sendOrderConfirmation, sendOrderNotification } = require('../email');
const { resolveItems } = require('../config/menu');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured');
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not configured.');
  }
  return require('stripe')(key);
}

// Helper: get member from token (optional auth)
function getMember(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const db = getDb();
    return db.prepare('SELECT * FROM members WHERE id = ?').get(decoded.id);
  } catch (e) {
    return null;
  }
}

// POST /api/stripe/create-checkout-session
router.post(
  '/create-checkout-session',
  [
    body('customer_name').trim().notEmpty().withMessage('Name is required.'),
    body('customer_email').isEmail().withMessage('Valid email is required.'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required.'),
    body('items.*.id').trim().notEmpty().withMessage('Item ID is required.'),
    body('items.*.qty').isInt({ min: 1, max: 100 }).withMessage('Item quantity must be 1-100.'),
    body('tip').optional().isFloat({ min: 0, max: 1000 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      customer_name,
      customer_email,
      customer_phone,
      items,
      tip,
      delivery_type,
      delivery_address
    } = req.body;

    let resolvedItems;
    let subtotal;

    try {
      ({ resolvedItems, subtotal } = resolveItems(items));
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    const safeTip = Math.max(0, Math.min(parseFloat(tip) || 0, subtotal));

    try {
      const stripe = getStripe();

      const lineItems = resolvedItems.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.qty
      }));

      if (safeTip > 0) {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: { name: 'Tip — Thank you!' },
            unit_amount: Math.round(safeTip * 100)
          },
          quantity: 1
        });
      }

      const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email,
        line_items: lineItems,
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/cancel`,
        metadata: {
          customer_name,
          customer_email,
          customer_phone: customer_phone || '',
          delivery_type: delivery_type || 'pickup',
          delivery_address: delivery_address || '',
          items_json: JSON.stringify(resolvedItems),
          tip: safeTip.toString()
        }
      });

      return res.json({ success: true, url: session.url });
    } catch (err) {
      console.error('Stripe Checkout error:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Could not create checkout session. Please try again.'
      });
    }
  }
);

// POST /api/stripe/confirm-order
// Fully idempotent and race-safe via INSERT OR IGNORE + unique DB constraint.
// Repeated calls (including rapid refresh spam) always return the same order.
router.post(
  '/confirm-order',
  [
    body('session_id').trim().notEmpty().withMessage('Session ID is required.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { session_id } = req.body;
    const db = getDb();

    // 1. Fast path: session already confirmed — return immediately, no Stripe call.
    const existing = db
      .prepare('SELECT ref, total, status FROM orders WHERE stripe_session_id = ?')
      .get(session_id);
    if (existing) {
      return res.json({
        success: true,
        order: { ref: existing.ref, total: existing.total, status: existing.status }
      });
    }

    // 2. Call Stripe to verify payment status.
    let session;
    try {
      const stripe = getStripe();
      session = await stripe.checkout.sessions.retrieve(session_id);
    } catch (err) {
      console.error('Stripe session retrieve error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not verify payment. Please try again.' });
    }

    // 3. Gate on payment_status — expired or unpaid must never create an order.
    if (session.status === 'expired') {
      return res.status(400).json({
        success: false,
        error: 'This checkout session has expired. Please place a new order.',
        retryable: true
      });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment has not been completed. Please try again.',
        retryable: true
      });
    }

    // 4. Extract trusted metadata from Stripe session — never trust client-sent totals.
    const {
      customer_name,
      customer_email,
      customer_phone,
      delivery_type,
      delivery_address,
      items_json,
      tip
    } = session.metadata;

    const orderItems = JSON.parse(items_json);
    const safeTip = parseFloat(tip) || 0;
    const subtotal = orderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const total = subtotal + safeTip;
    const ref = 'SAV-' + uuidv4().split('-')[0].toUpperCase();

    // 5. INSERT OR IGNORE — race-safe: if a concurrent request already inserted this
    //    session, the INSERT silently does nothing (unique constraint on stripe_session_id).
    try {
      db.prepare(`
        INSERT OR IGNORE INTO orders (
          ref, customer_name, customer_email, customer_phone,
          items, subtotal, tip, total,
          delivery_type, delivery_address,
          payment_method, stripe_session_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ref, customer_name, customer_email, customer_phone || '',
        items_json, subtotal, safeTip, total,
        delivery_type || 'pickup', delivery_address || '',
        'card', session_id, 'paid'
      );
    } catch (dbErr) {
      console.error('DB insert error:', dbErr.message);
      return res.status(500).json({ success: false, error: 'Could not save order. Please contact us.' });
    }

    // 6. Re-query DB to get the authoritative saved row (handles the concurrent-insert case).
    const saved = db
      .prepare('SELECT ref, total, status FROM orders WHERE stripe_session_id = ?')
      .get(session_id);

    if (!saved) {
      return res.status(500).json({ success: false, error: 'Order could not be retrieved after save.' });
    }

    // 7. Send emails ONLY if we were the one to insert (ref we generated matches saved ref).
    //    If another concurrent request inserted first, saved.ref !== ref and we skip emails.
    if (saved.ref === ref) {
      try {
        await sendOrderConfirmation({
          name: customer_name, email: customer_email, ref: saved.ref,
          items: orderItems, subtotal, tip: safeTip, total,
          delivery_type: delivery_type || 'pickup',
          delivery_address: delivery_address || '',
          payment_method: 'card'
        });
        await sendOrderNotification({
          name: customer_name, email: customer_email, phone: customer_phone || '',
          ref: saved.ref, items: orderItems, subtotal, tip: safeTip, total,
          delivery_type: delivery_type || 'pickup',
          delivery_address: delivery_address || '',
          payment_method: 'card'
        });
      } catch (emailErr) {
        console.error('Order email error:', emailErr.message);
      }
    }

    return res.json({
      success: true,
      order: { ref: saved.ref, total: saved.total, status: saved.status }
    });
  }
);

// GET /api/stripe/saved-cards
router.get('/saved-cards', async (req, res) => {
  const member = getMember(req);

  if (!member || !member.stripe_customer_id) {
    return res.json({ success: true, cards: [] });
  }

  try {
    const stripe = getStripe();
    const methods = await stripe.paymentMethods.list({
      customer: member.stripe_customer_id,
      type: 'card'
    });

    const cards = methods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year
    }));

    return res.json({ success: true, cards });
  } catch (err) {
    console.error('Saved cards error:', err.message);
    return res.json({ success: true, cards: [] });
  }
});

module.exports = router;