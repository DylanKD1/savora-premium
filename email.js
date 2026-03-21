const nodemailer = require('nodemailer');

// Gmail SMTP transporter — configured via environment variables
let transporter = null;

function getTransporter() {
  if (!transporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      console.warn('GMAIL_USER or GMAIL_APP_PASSWORD not set. Email sending disabled.');
      return null;
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }
  return transporter;
}

const RESTAURANT_NAME = 'Savora Fine Gastronomy';
const RESTAURANT_EMAIL = process.env.GMAIL_USER || 'hello@savorarestaurant.de';

// Send notification to restaurant owner when a contact form is submitted
async function sendContactNotification({ name, email, reason, message }) {
  const t = getTransporter();
  if (!t) return;

  await t.sendMail({
    from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
    to: RESTAURANT_EMAIL,
    subject: `New Contact Message: ${reason} — from ${name}`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#faf7f2;border:1px solid #e8e2d6;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-family:Georgia,serif;color:#1a1712;font-size:24px;margin:0;">SAVORA</h1>
          <p style="color:#9a9088;font-size:12px;letter-spacing:2px;margin:4px 0 0;">FINE GASTRONOMY</p>
        </div>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <h2 style="color:#1a1712;font-size:18px;margin-bottom:16px;">New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#9a9088;width:100px;">Name</td><td style="padding:8px 0;color:#1a1712;font-weight:500;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#b8963e;">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Reason</td><td style="padding:8px 0;color:#1a1712;">${reason}</td></tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#fff;border-radius:8px;border:1px solid #e8e2d6;">
          <p style="color:#5a5449;font-size:14px;line-height:1.7;margin:0;">${message}</p>
        </div>
        <p style="color:#9a9088;font-size:12px;margin-top:20px;">Reply directly to this email or contact the guest at ${email}.</p>
      </div>
    `
  });
}

// Send confirmation to the client who submitted the contact form
async function sendContactConfirmation({ name, email, reason, message }) {
  const t = getTransporter();
  if (!t) return;

  await t.sendMail({
    from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
    to: email,
    subject: `We received your message — ${RESTAURANT_NAME}`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#faf7f2;border:1px solid #e8e2d6;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-family:Georgia,serif;color:#1a1712;font-size:24px;margin:0;">SAVORA</h1>
          <p style="color:#9a9088;font-size:12px;letter-spacing:2px;margin:4px 0 0;">FINE GASTRONOMY</p>
        </div>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <p style="color:#1a1712;font-size:16px;">Dear ${name},</p>
        <p style="color:#5a5449;font-size:14px;line-height:1.7;">Thank you for reaching out to Savora. We have received your message regarding <strong>${reason}</strong> and our concierge team will respond within 24 hours.</p>
        <div style="margin:20px 0;padding:16px;background:#fff;border-radius:8px;border:1px solid #e8e2d6;">
          <p style="color:#9a9088;font-size:12px;margin:0 0 8px;">Your message:</p>
          <p style="color:#5a5449;font-size:14px;line-height:1.7;margin:0;">${message}</p>
        </div>
        <p style="color:#5a5449;font-size:14px;line-height:1.7;">If you need immediate assistance, you may reach us at:</p>
        <ul style="color:#5a5449;font-size:14px;line-height:2;list-style:none;padding:0;">
          <li>Phone: <a href="tel:+491723789266" style="color:#b8963e;">+49 172 3789266</a></li>
          <li>WhatsApp: <a href="https://wa.me/491723789266" style="color:#b8963e;">Chat with us</a></li>
        </ul>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <p style="color:#9a9088;font-size:12px;text-align:center;">Savora Fine Gastronomy &middot; Wilhelm Raabe Str. 14 &middot; 67663 Kaiserslautern</p>
      </div>
    `
  });
}

// Send order confirmation email to client
async function sendOrderConfirmation({ name, email, ref, items, subtotal, tip, total, delivery_type, delivery_address, payment_method }) {
  const t = getTransporter();
  if (!t) return;

  const itemRows = items.map(i =>
    `<tr><td style="padding:6px 0;color:#1a1712;">${i.name} x${i.qty}</td><td style="padding:6px 0;color:#1a1712;text-align:right;">EUR ${(i.price * i.qty).toFixed(2)}</td></tr>`
  ).join('');

  await t.sendMail({
    from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
    to: email,
    subject: `Order Confirmed: ${ref} — ${RESTAURANT_NAME}`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#faf7f2;border:1px solid #e8e2d6;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-family:Georgia,serif;color:#1a1712;font-size:24px;margin:0;">SAVORA</h1>
          <p style="color:#9a9088;font-size:12px;letter-spacing:2px;margin:4px 0 0;">FINE GASTRONOMY</p>
        </div>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <p style="color:#1a1712;font-size:16px;">Dear ${name},</p>
        <p style="color:#5a5449;font-size:14px;line-height:1.7;">Your order <strong style="color:#b8963e;">${ref}</strong> has been confirmed. Here is your summary:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${itemRows}
          <tr style="border-top:1px solid #e8e2d6;"><td style="padding:8px 0;color:#9a9088;">Subtotal</td><td style="padding:8px 0;text-align:right;color:#1a1712;">EUR ${subtotal.toFixed(2)}</td></tr>
          ${tip > 0 ? `<tr><td style="padding:4px 0;color:#9a9088;">Tip</td><td style="padding:4px 0;text-align:right;color:#1a1712;">EUR ${tip.toFixed(2)}</td></tr>` : ''}
          <tr style="border-top:2px solid #b8963e;"><td style="padding:10px 0;color:#1a1712;font-weight:700;font-size:16px;">Total</td><td style="padding:10px 0;text-align:right;color:#1a1712;font-weight:700;font-size:16px;">EUR ${total.toFixed(2)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#9a9088;width:120px;">Type</td><td style="padding:6px 0;color:#1a1712;">${delivery_type === 'delivery' ? 'Delivery' : 'Pickup'}</td></tr>
          ${delivery_address ? `<tr><td style="padding:6px 0;color:#9a9088;">Address</td><td style="padding:6px 0;color:#1a1712;">${delivery_address}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#9a9088;">Payment</td><td style="padding:6px 0;color:#1a1712;">${payment_method}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <p style="color:#9a9088;font-size:12px;text-align:center;">Savora Fine Gastronomy &middot; Wilhelm Raabe Str. 14 &middot; 67663 Kaiserslautern</p>
      </div>
    `
  });
}

// Send order notification to restaurant owner
async function sendOrderNotification({ name, email, phone, ref, items, subtotal, tip, total, delivery_type, delivery_address, payment_method }) {
  const t = getTransporter();
  if (!t) return;

  const itemList = items.map(i => `${i.name} x${i.qty} - EUR ${(i.price * i.qty).toFixed(2)}`).join('\n');

  await t.sendMail({
    from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
    to: RESTAURANT_EMAIL,
    subject: `New Order: ${ref} — EUR ${total.toFixed(2)} (${delivery_type})`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#faf7f2;border:1px solid #e8e2d6;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-family:Georgia,serif;color:#1a1712;font-size:24px;margin:0;">SAVORA</h1>
          <p style="color:#9a9088;font-size:12px;letter-spacing:2px;margin:4px 0 0;">NEW ORDER</p>
        </div>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <h2 style="color:#1a1712;font-size:18px;">Order ${ref}</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#9a9088;width:100px;">Customer</td><td style="padding:6px 0;color:#1a1712;">${name}</td></tr>
          <tr><td style="padding:6px 0;color:#9a9088;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#b8963e;">${email}</a></td></tr>
          ${phone ? `<tr><td style="padding:6px 0;color:#9a9088;">Phone</td><td style="padding:6px 0;color:#1a1712;">${phone}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#9a9088;">Type</td><td style="padding:6px 0;color:#1a1712;">${delivery_type}</td></tr>
          ${delivery_address ? `<tr><td style="padding:6px 0;color:#9a9088;">Address</td><td style="padding:6px 0;color:#1a1712;">${delivery_address}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#9a9088;">Payment</td><td style="padding:6px 0;color:#1a1712;">${payment_method}</td></tr>
          <tr><td style="padding:6px 0;color:#9a9088;">Total</td><td style="padding:6px 0;color:#1a1712;font-weight:700;">EUR ${total.toFixed(2)}</td></tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#fff;border-radius:8px;border:1px solid #e8e2d6;">
          <pre style="color:#5a5449;font-size:13px;line-height:1.8;margin:0;white-space:pre-wrap;">${itemList}</pre>
        </div>
      </div>
    `
  });
}

// Send booking confirmation to client
async function sendBookingConfirmation({ name, email, phone, ref, guests, date, time, preorder }) {
  const t = getTransporter();
  if (!t) return;

  await t.sendMail({
    from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
    to: email,
    subject: `Booking Confirmed: ${ref} — ${RESTAURANT_NAME}`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#faf7f2;border:1px solid #e8e2d6;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-family:Georgia,serif;color:#1a1712;font-size:24px;margin:0;">SAVORA</h1>
          <p style="color:#9a9088;font-size:12px;letter-spacing:2px;margin:4px 0 0;">FINE GASTRONOMY</p>
        </div>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <p style="color:#1a1712;font-size:16px;">Dear ${name},</p>
        <p style="color:#5a5449;font-size:14px;line-height:1.7;">Your table has been confirmed! Here are your reservation details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;color:#9a9088;width:120px;">Reference</td><td style="padding:8px 0;color:#b8963e;font-weight:700;">${ref}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Date</td><td style="padding:8px 0;color:#1a1712;">${date}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Time</td><td style="padding:8px 0;color:#1a1712;">${time}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Party Size</td><td style="padding:8px 0;color:#1a1712;">${guests} guest${guests > 1 ? 's' : ''}</td></tr>
          ${preorder && preorder !== 'None' ? `<tr><td style="padding:8px 0;color:#9a9088;">Pre-Order</td><td style="padding:8px 0;color:#b8963e;">${preorder}</td></tr>` : ''}
        </table>
        <p style="color:#5a5449;font-size:14px;line-height:1.7;">We look forward to welcoming you. If you need to modify your reservation, please contact us:</p>
        <ul style="color:#5a5449;font-size:14px;line-height:2;list-style:none;padding:0;">
          <li>Phone: <a href="tel:+491723789266" style="color:#b8963e;">+49 172 3789266</a></li>
          <li>Email: <a href="mailto:${RESTAURANT_EMAIL}" style="color:#b8963e;">${RESTAURANT_EMAIL}</a></li>
        </ul>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <p style="color:#9a9088;font-size:12px;text-align:center;">Savora Fine Gastronomy &middot; Wilhelm Raabe Str. 14 &middot; 67663 Kaiserslautern</p>
      </div>
    `
  });
}

// Send booking notification to restaurant owner
async function sendBookingNotification({ name, email, phone, ref, guests, date, time, preorder }) {
  const t = getTransporter();
  if (!t) return;

  await t.sendMail({
    from: `"${RESTAURANT_NAME}" <${RESTAURANT_EMAIL}>`,
    to: RESTAURANT_EMAIL,
    subject: `New Booking: ${ref} — ${name}, ${guests} guests on ${date} at ${time}`,
    html: `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#faf7f2;border:1px solid #e8e2d6;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-family:Georgia,serif;color:#1a1712;font-size:24px;margin:0;">SAVORA</h1>
          <p style="color:#9a9088;font-size:12px;letter-spacing:2px;margin:4px 0 0;">NEW BOOKING</p>
        </div>
        <hr style="border:none;border-top:1px solid #e8e2d6;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#9a9088;width:100px;">Reference</td><td style="padding:8px 0;color:#b8963e;font-weight:700;">${ref}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Name</td><td style="padding:8px 0;color:#1a1712;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#b8963e;">${email}</a></td></tr>
          ${phone ? `<tr><td style="padding:8px 0;color:#9a9088;">Phone</td><td style="padding:8px 0;color:#1a1712;">${phone}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#9a9088;">Date</td><td style="padding:8px 0;color:#1a1712;">${date}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Time</td><td style="padding:8px 0;color:#1a1712;">${time}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9088;">Guests</td><td style="padding:8px 0;color:#1a1712;">${guests}</td></tr>
          ${preorder && preorder !== 'None' ? `<tr><td style="padding:8px 0;color:#9a9088;">Pre-Order</td><td style="padding:8px 0;color:#b8963e;">${preorder}</td></tr>` : ''}
        </table>
      </div>
    `
  });
}

module.exports = {
  sendContactNotification,
  sendContactConfirmation,
  sendOrderConfirmation,
  sendOrderNotification,
  sendBookingConfirmation,
  sendBookingNotification
};
