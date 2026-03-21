require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { closeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting — general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' }
});
app.use(generalLimiter);

// Stricter rate limit for form submissions
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many submissions. Please wait before trying again.' }
});

// ─── Body Parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// ─── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname), {
  index: 'savora-corrected.html',
  extensions: ['html']
}));

// ─── API Routes ────────────────────────────────────────────────
app.use('/api/bookings', formLimiter, require('./routes/bookings'));
app.use('/api/orders', formLimiter, require('./routes/orders'));
app.use('/api/contact', formLimiter, require('./routes/contact'));
app.use('/api/loyalty', require('./routes/loyalty'));
app.use('/api/newsletter', formLimiter, require('./routes/newsletter'));
app.use('/api/auth', formLimiter, require('./routes/auth'));
app.use('/api/stripe', formLimiter, require('./routes/stripe'));

// ─── Public Config (Stripe PK) ────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

// ─── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// ─── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ─── Start Server ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n  Savora Backend running at http://localhost:${PORT}`);
  console.log(`  API endpoints:`);
  console.log(`    POST /api/bookings      — Create booking`);
  console.log(`    GET  /api/bookings      — List bookings`);
  console.log(`    POST /api/orders        — Create order`);
  console.log(`    GET  /api/orders        — List orders`);
  console.log(`    POST /api/contact       — Send message`);
  console.log(`    POST /api/loyalty/join  — Join loyalty`);
  console.log(`    POST /api/loyalty/points — Add points`);
  console.log(`    POST /api/newsletter    — Subscribe`);
  console.log(`    POST /api/auth/register — Register member`);
  console.log(`    POST /api/auth/login   — Login member`);
  console.log(`    GET  /api/auth/me      — Get profile`);
  console.log(`    POST /api/stripe/create-payment-intent — Stripe payment`);
  console.log(`    POST /api/stripe/confirm-order — Confirm paid order`);
  console.log(`    GET  /api/stripe/saved-cards — Saved cards`);
  console.log(`    GET  /api/health        — Health check\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDb();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  closeDb();
  server.close(() => process.exit(0));
});
