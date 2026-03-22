const express = require('express');
const PDFDocument = require('pdfkit');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/invoice/:ref
// Streams a branded PDF invoice for a confirmed order.
router.get('/:ref', (req, res) => {
  const { ref } = req.params;
  const db = getDb();

  const order = db.prepare('SELECT * FROM orders WHERE ref = ? AND status = ?').get(ref, 'paid');
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found.' });
  }

  const items = JSON.parse(order.items);
  const orderDate = order.created_at
    ? new Date(order.created_at + 'Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const displayName = order.customer_name ? `Mr ${order.customer_name}` : 'Valued Customer';

  // Build PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Savora-Invoice-${ref}.pdf"`);
  doc.pipe(res);

  // ── Header ──────────────────────────────────────────
  doc
    .rect(0, 0, doc.page.width, 100)
    .fill('#1a1712');

  doc
    .font('Helvetica-Bold')
    .fontSize(28)
    .fillColor('#b8963e')
    .text('SAVORA', 50, 30, { width: 200 });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#d4af5a')
    .text('FINE GASTRONOMY · KAISERSLAUTERN', 50, 65, { width: 250 });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#f5f0e8')
    .text('INVOICE', 400, 35, { align: 'right', width: 145 });

  doc
    .fontSize(8)
    .fillColor('#d4af5a')
    .text(ref, 400, 50, { align: 'right', width: 145 });

  doc
    .fontSize(8)
    .fillColor('#9a9088')
    .text(orderDate, 400, 65, { align: 'right', width: 145 });

  // ── Customer Info ───────────────────────────────────
  let y = 120;

  doc
    .fillColor('#1a1712')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Billed to:', 50, y);

  y += 16;
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#2e2a25')
    .text(displayName, 50, y);

  if (order.customer_email) {
    y += 14;
    doc.text(order.customer_email, 50, y);
  }

  if (order.customer_phone) {
    y += 14;
    doc.text(order.customer_phone, 50, y);
  }

  // Delivery / Pickup info on right side
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#1a1712')
    .text('Order type:', 350, 120);

  const orderType = (order.delivery_type || 'pickup').charAt(0).toUpperCase() + (order.delivery_type || 'pickup').slice(1);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#2e2a25')
    .text(orderType, 350, 136);

  if (order.delivery_address) {
    doc.text(order.delivery_address, 350, 150, { width: 195 });
  }

  // ── Divider ─────────────────────────────────────────
  y = 195;
  doc
    .moveTo(50, y)
    .lineTo(545, y)
    .strokeColor('#e0d8cc')
    .lineWidth(0.5)
    .stroke();

  // ── Table Header ────────────────────────────────────
  y += 15;
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#9a9088')
    .text('ITEM', 50, y, { width: 250 })
    .text('QTY', 310, y, { width: 50, align: 'center' })
    .text('PRICE', 370, y, { width: 80, align: 'right' })
    .text('TOTAL', 460, y, { width: 85, align: 'right' });

  y += 6;
  doc
    .moveTo(50, y + 10)
    .lineTo(545, y + 10)
    .strokeColor('#e0d8cc')
    .lineWidth(0.3)
    .stroke();

  // ── Items ───────────────────────────────────────────
  y += 20;
  doc.font('Helvetica').fontSize(10).fillColor('#2e2a25');

  for (const item of items) {
    const lineTotal = (item.price * item.qty).toFixed(2);

    doc
      .text(item.name, 50, y, { width: 250 })
      .text(String(item.qty), 310, y, { width: 50, align: 'center' })
      .text(`€${item.price.toFixed(2)}`, 370, y, { width: 80, align: 'right' })
      .text(`€${lineTotal}`, 460, y, { width: 85, align: 'right' });

    y += 20;

    // Page break safety
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
  }

  // ── Divider before totals ───────────────────────────
  y += 5;
  doc
    .moveTo(350, y)
    .lineTo(545, y)
    .strokeColor('#e0d8cc')
    .lineWidth(0.5)
    .stroke();

  // ── Subtotal ────────────────────────────────────────
  y += 12;
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#5a5449')
    .text('Subtotal', 370, y, { width: 80, align: 'right' })
    .text(`€${order.subtotal.toFixed(2)}`, 460, y, { width: 85, align: 'right' });

  // ── Tip ─────────────────────────────────────────────
  if (order.tip && order.tip > 0) {
    y += 18;
    doc
      .text('Tip', 370, y, { width: 80, align: 'right' })
      .text(`€${order.tip.toFixed(2)}`, 460, y, { width: 85, align: 'right' });
  }

  // ── Total ───────────────────────────────────────────
  y += 24;
  doc
    .rect(345, y - 5, 205, 28)
    .fill('#1a1712');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#b8963e')
    .text('TOTAL', 370, y + 2, { width: 80, align: 'right' })
    .text(`€${order.total.toFixed(2)}`, 460, y + 2, { width: 85, align: 'right' });

  // ── Payment Status ──────────────────────────────────
  y += 40;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#3d7a5e')
    .text('✓ PAID', 460, y, { width: 85, align: 'right' });

  // ── Stripe Session Reference ────────────────────────
  if (order.stripe_session_id) {
    y += 25;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#9a9088')
      .text(`Payment ref: ${order.stripe_session_id}`, 50, y, { width: 495 });
  }

  // ── Footer ──────────────────────────────────────────
  const footerY = doc.page.height - 60;

  doc
    .moveTo(50, footerY - 10)
    .lineTo(545, footerY - 10)
    .strokeColor('#e0d8cc')
    .lineWidth(0.3)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#9a9088')
    .text('Savora Fine Gastronomy · Kaiserslautern · savora-kl.de', 50, footerY, { align: 'center', width: 495 });

  doc
    .text('Thank you for dining with us.', 50, footerY + 12, { align: 'center', width: 495 });

  doc.end();
});

module.exports = router;
