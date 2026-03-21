# Savora Kaiserslautern – Backend

## Quick Start

```bash
npm install
npm start
```

Server runs at **http://localhost:3000** — opens the Savora website automatically.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bookings` | Create a booking |
| GET | `/api/bookings` | List all bookings |
| GET | `/api/bookings/:ref` | Get booking by reference |
| PATCH | `/api/bookings/:ref` | Update booking status |
| POST | `/api/orders` | Create an order |
| GET | `/api/orders` | List all orders |
| GET | `/api/orders/:ref` | Get order by reference |
| PATCH | `/api/orders/:ref` | Update order status |
| POST | `/api/contact` | Submit contact message |
| GET | `/api/contact` | List all messages |
| PATCH | `/api/contact/:id` | Update message status |
| POST | `/api/loyalty/join` | Join loyalty program |
| POST | `/api/loyalty/points` | Add points to member |
| GET | `/api/loyalty/:id` | Get member + history |
| POST | `/api/newsletter` | Subscribe to newsletter |
| GET | `/api/newsletter` | List subscribers |
| GET | `/api/health` | Health check |

## Security

- **Helmet** – HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate Limiting** – 200 req/15min general, 20 req/15min for form submissions
- **Input Validation** – All inputs validated and sanitized via express-validator
- **CORS** – Configured for same-origin
- **SQLite WAL mode** – Safe concurrent reads

## Database

SQLite database stored at `savora.db` (auto-created on first run).

Tables: `bookings`, `orders`, `contact_messages`, `loyalty_members`, `loyalty_transactions`, `newsletter_subscribers`
