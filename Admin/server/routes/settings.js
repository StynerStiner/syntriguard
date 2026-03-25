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

module.exports = router;
