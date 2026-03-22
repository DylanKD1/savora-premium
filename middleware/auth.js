const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware: Require a valid JWT token (any logged-in user).
 * Sets req.user = decoded token payload.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

/**
 * Middleware: Require admin role.
 * Checks JWT then verifies the user's email/username is in the ADMIN_USERS list.
 * Set ADMIN_USERS env var as a comma-separated list of admin emails/usernames.
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (!adminUsers.length) {
      console.error('ADMIN_USERS env var not configured. No admin access possible.');
      return res.status(403).json({ success: false, error: 'Admin access not configured.' });
    }

    const isAdmin = adminUsers.includes(decoded.email?.toLowerCase()) ||
                    adminUsers.includes(decoded.username?.toLowerCase());

    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }

    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth, requireAdmin };
