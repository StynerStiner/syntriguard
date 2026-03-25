const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// WhatsApp Business Cloud API integration
// Requires: WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env
// Get these from: https://developers.facebook.com → WhatsApp → API Setup

async function sendWhatsAppMessage(to, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    throw new Error('WhatsApp not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env');
  }

  // Format phone number: remove spaces/dashes, ensure country code
  let phone = to.replace(/[\s\-()]/g, '');
  if (!phone.startsWith('+')) phone = '+' + phone;
  // Remove the + for API
  phone = phone.replace('+', '');

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'WhatsApp API error');
  }
  return data;
}

// POST /api/whatsapp/send — send message to a guard
router.post('/send', auth, async (req, res) => {
  try {
    const { guard_id, message } = req.body;
    if (!guard_id || !message) {
      return res.status(400).json({ error: 'guard_id and message are required' });
    }

    // Get guard's phone number
    const guard = await db.query('SELECT full_name, phone FROM guards WHERE id = $1', [guard_id]);
    if (guard.rows.length === 0) return res.status(404).json({ error: 'Guard not found' });
    if (!guard.rows[0].phone) return res.status(400).json({ error: 'Guard has no phone number' });

    // Send via WhatsApp
    const result = await sendWhatsAppMessage(guard.rows[0].phone, message);

    // Log the message in our DB
    await db.query(
      `INSERT INTO messages (sender_id, content, message_type, created_at)
       VALUES ($1, $2, 'text', NOW())`,
      [req.user.id, `[WhatsApp to ${guard.rows[0].full_name}] ${message}`]
    );

    // Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'whatsapp_sent', 'guard', $2, $3)`,
      [req.user.id, guard_id, JSON.stringify({ message: message.substring(0, 200), to: guard.rows[0].full_name })]
    );

    res.json({ success: true, whatsapp_id: result.messages?.[0]?.id, guard: guard.rows[0].full_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/broadcast — send to multiple guards
router.post('/broadcast', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'operator') {
      return res.status(403).json({ error: 'Admin or operator access required' });
    }

    const { guard_ids, message } = req.body;
    if (!guard_ids || !Array.isArray(guard_ids) || !message) {
      return res.status(400).json({ error: 'guard_ids (array) and message are required' });
    }

    const guards = await db.query('SELECT id, full_name, phone FROM guards WHERE id = ANY($1)', [guard_ids]);
    const results = [];

    for (const guard of guards.rows) {
      if (!guard.phone) {
        results.push({ guard: guard.full_name, status: 'skipped', reason: 'no phone' });
        continue;
      }
      try {
        await sendWhatsAppMessage(guard.phone, message);
        results.push({ guard: guard.full_name, status: 'sent' });
      } catch (err) {
        results.push({ guard: guard.full_name, status: 'failed', reason: err.message });
      }
    }

    // Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, details)
       VALUES ($1, 'whatsapp_broadcast', 'guard', $2)`,
      [req.user.id, JSON.stringify({ count: guard_ids.length, message: message.substring(0, 200) })]
    );

    res.json({ results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/whatsapp/notify-shift — send shift notification to a guard
router.post('/notify-shift', auth, async (req, res) => {
  try {
    const { shift_id } = req.body;
    const shift = await db.query(`
      SELECT sh.*, g.full_name, g.phone, s.name as site_name
      FROM shifts sh
      JOIN guards g ON sh.guard_id = g.id
      JOIN sites s ON sh.site_id = s.id
      WHERE sh.id = $1
    `, [shift_id]);

    if (shift.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    const s = shift.rows[0];

    const message = `📋 *SyntriGuard Shift Assignment*\n\nHi ${s.full_name},\n\nYou have been assigned a shift:\n📍 Site: ${s.site_name}\n📅 Date: ${s.shift_date}\n⏰ Time: ${s.start_time} — ${s.end_time}\n🏷 Type: ${s.shift_type}\n\nPlease confirm your availability.\n\n— SyntriGuard Operations`;

    if (!s.phone) return res.status(400).json({ error: 'Guard has no phone number' });

    const result = await sendWhatsAppMessage(s.phone, message);
    res.json({ success: true, guard: s.full_name, whatsapp_id: result.messages?.[0]?.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Webhook for receiving WhatsApp messages (Meta sends to this endpoint)
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'syntriguard-verify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const messages = change.value?.messages || [];
          for (const msg of messages) {
            const from = msg.from; // phone number
            const text = msg.text?.body || '';

            // Find guard by phone
            const guard = await db.query(
              "SELECT g.id, g.full_name, g.user_id FROM guards g WHERE REPLACE(REPLACE(REPLACE(g.phone, ' ', ''), '-', ''), '+', '') LIKE '%' || $1",
              [from.slice(-7)] // match last 7 digits
            );

            if (guard.rows.length > 0) {
              // Store incoming message
              await db.query(
                `INSERT INTO messages (sender_id, content, message_type, created_at)
                 VALUES ($1, $2, 'text', NOW())`,
                [guard.rows[0].user_id, `[WhatsApp from ${guard.rows[0].full_name}] ${text}`]
              );
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.sendStatus(200); // Always return 200 to Meta
  }
});

module.exports = router;
