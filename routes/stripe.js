const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { sendOrderConfirmation, sendOrderNotification } = require('../email');

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

// POST /api/stripe/create-payment-intent
router.post('/create-payment-intent', [
  body('amount').isFloat({ min: 0.5 }).withMessage('Amount must be at least 0.50.'),
  body('customer_name').trim().notEmpty().withMessage('Name is required.'),
  body('customer_email').isEmail().withMessage('Valid email is required.'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required.'),
  body('save_card').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { amount, customer_name, customer_email, customer_phone, items, subtotal, tip, delivery_type, delivery_address, payment_method, save_card } = req.body;

  try {
    const stripe = getStripe();
    const member = getMember(req);

    let customerId = member?.stripe_customer_id || null;

    // Create or retrieve Stripe customer if saving card
    if (save_card || customerId) {
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: customer_name,
          email: customer_email,
          phone: customer_phone || undefined,
          metadata: { member_id: member?.id?.toString() || 'guest' }
        });
        customerId = customer.id;

        // Save Stripe customer ID to member record
        if (member) {
          const db = getDb();
          db.prepare('UPDATE members SET stripe_customer_id = ? WHERE id = ?').run(customerId, member.id);
        }
      }
    }

    const intentParams = {
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: 'eur',
      metadata: {
        customer_name,
        customer_email,
        customer_phone: customer_phone || '',
        delivery_type: delivery_type || 'pickup',
        delivery_address: delivery_address || '',
        items_summary: items.map(i => `${i.name} x${i.qty}`).join(', ')
      },
      receipt_email: customer_email,
      automatic_payment_methods: { enabled: true }
    };

    if (customerId) {
      intentParams.customer = customerId;
    }

    if (save_card && customerId) {
      intentParams.setup_future_usage = 'off_session';
    }

    const paymentIntent = await stripe.paymentIntents.create(intentParams);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ success: false, error: 'Payment failed. Please try again.' });
  }
});

// POST /api/stripe/confirm-order — Called after payment succeeds on the client
router.post('/confirm-order', [
  body('payment_intent_id').notEmpty().withMessage('Payment intent ID is required.'),
  body('customer_name').trim().notEmpty(),
  body('customer_email').isEmail(),
  body('items').isArray({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { payment_intent_id, customer_name, customer_email, customer_phone, items, subtotal, tip, total, delivery_type, delivery_address, payment_method } = req.body;

  try {
    const stripe = getStripe();

    // Verify the payment intent succeeded
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ success: false, error: 'Payment has not been completed.' });
    }

    // Create order in database
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');
    const ref = 'SAV-' + uuidv4().split('-')[0].toUpperCase();

    const stmt = db.prepare(`INSERT INTO orders (ref, customer_name, customer_email, customer_phone, items, subtotal, tip, total, delivery_type, delivery_address, payment_method, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(ref, customer_name, customer_email, customer_phone || '', JSON.stringify(items), subtotal, tip || 0, total, delivery_type || 'pickup', delivery_address || '', payment_method || 'card', 'paid');

    // Send emails
    try {
      await sendOrderConfirmation({ name: customer_name, email: customer_email, ref, items, subtotal, tip: tip || 0, total, delivery_type: delivery_type || 'pickup', delivery_address: delivery_address || '', payment_method: payment_method || 'card' });
      await sendOrderNotification({ name: customer_name, email: customer_email, phone: customer_phone || '', ref, items, subtotal, tip: tip || 0, total, delivery_type: delivery_type || 'pickup', delivery_address: delivery_address || '', payment_method: payment_method || 'card' });
    } catch (emailErr) {
      console.error('Order email error:', emailErr.message);
    }

    res.json({ success: true, order: { ref, total, status: 'paid' } });
  } catch (err) {
    console.error('Confirm order error:', err.message);
    res.status(500).json({ success: false, error: 'Could not confirm order.' });
  }
});

// GET /api/stripe/saved-cards — Get saved payment methods for logged-in user
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

    res.json({ success: true, cards });
  } catch (err) {
    console.error('Saved cards error:', err.message);
    res.json({ success: true, cards: [] });
  }
});

module.exports = router;
