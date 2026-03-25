const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/settings — get all settings
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings — update settings (accepts object of key:value pairs)
router.put('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const updates = req.body;
    let updated = 0;

    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [key, value]
      );
      updated++;
    }

    // Audit log
    await db.query(
      'INSERT INTO audit_log (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'settings_updated', 'settings', JSON.stringify({ keys: Object.keys(updates) })]
    );

    res.json({ success: true, updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/settings/counts — get record counts for reset panel
router.get('/counts', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM guards) as guards,
        (SELECT COUNT(*) FROM shifts) as shifts,
        (SELECT COUNT(*) FROM incidents) as incidents,
        (SELECT COUNT(*) FROM clients) as clients,
        (SELECT COUNT(*) FROM sites) as sites,
        (SELECT COUNT(*) FROM messages) as messages,
        (SELECT COUNT(*) FROM ai_conversations) as ai_conversations
    `);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/settings/reset — clear selected data tables
router.post('/reset', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { tables } = req.body;
    if (!tables || !Array.isArray(tables)) return res.status(400).json({ error: 'tables array required' });

    const allowed = ['guards', 'shifts', 'incidents', 'clients', 'sites', 'messages', 'ai_conversations', 'ai_messages'];
    const cleared = [];

    for (const table of tables) {
      if (!allowed.includes(table)) continue;

      // Handle foreign key order
      if (table === 'guards') {
        await db.query('DELETE FROM shifts');
        await db.query('DELETE FROM guards');
        cleared.push('guards', 'shifts');
      } else if (table === 'clients') {
        await db.query('UPDATE guards SET assigned_site_id = NULL');
        await db.query('DELETE FROM shifts');
        await db.query('DELETE FROM sites');
        await db.query('DELETE FROM clients');
        cleared.push('clients', 'sites');
      } else if (table === 'ai_conversations') {
        await db.query('DELETE FROM ai_messages');
        await db.query('DELETE FROM ai_conversations');
        cleared.push('ai_conversations', 'ai_messages');
      } else {
        await db.query('DELETE FROM ' + table);
        cleared.push(table);
      }
    }

    // Audit log
    await db.query(
      'INSERT INTO audit_log (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'data_reset', 'system', JSON.stringify({ cleared })]
    );

    res.json({ success: true, cleared });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
