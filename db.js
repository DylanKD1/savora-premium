const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'savora.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      guests INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      preorder TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'confirmed',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tip REAL DEFAULT 0,
      total REAL NOT NULL,
      delivery_type TEXT DEFAULT 'pickup',
      delivery_address TEXT DEFAULT '',
      payment_method TEXT DEFAULT 'card',
      stripe_session_id TEXT DEFAULT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      reason TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loyalty_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      points INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'Bronze',
      joined_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES loyalty_members(id)
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      subscribed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      stripe_customer_id TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add stripe_session_id column to existing orders tables if needed
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN stripe_session_id TEXT DEFAULT NULL`);
  } catch (e) {
    // Column already exists — ignore
  }

  // Migration: add UNIQUE index on stripe_session_id so INSERT OR IGNORE works correctly.
  // This is the lock that prevents duplicate order rows for the same Stripe session.
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders (stripe_session_id) WHERE stripe_session_id IS NOT NULL`);
  } catch (e) {
    // Index already exists or not supported — ignore
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
