const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/map-data — single endpoint for the deployment map command center
router.get('/', auth, async (req, res) => {
  try {
    // 1. Sites with guard counts and client info
    const sitesResult = await db.query(`
      SELECT s.*, c.name as client_name,
        (SELECT COUNT(*) FROM guards g WHERE g.assigned_site_id = s.id) as guard_count
      FROM sites s
      LEFT JOIN clients c ON s.client_id = c.id
      ORDER BY s.name
    `);

    // 2. All guards with their assigned site coordinates
    const guardsResult = await db.query(`
      SELECT g.id, g.guard_id, g.full_name, g.role, g.status, g.phone,
             g.assigned_site_id, s.name as site_name,
             s.latitude as site_lat, s.longitude as site_lng
      FROM guards g
      LEFT JOIN sites s ON g.assigned_site_id = s.id
      ORDER BY g.full_name
    `);

    // 3. Today's shifts with guard and site info
    const today = new Date().toISOString().split('T')[0];
    const shiftsResult = await db.query(`
      SELECT sh.*, g.full_name as guard_name, g.guard_id as guard_code,
             s.name as site_name, s.latitude as site_lat, s.longitude as site_lng
      FROM shifts sh
      LEFT JOIN guards g ON sh.guard_id = g.id
      LEFT JOIN sites s ON sh.site_id = s.id
      WHERE sh.shift_date = $1
      ORDER BY sh.start_time
    `, [today]);

    // 4. Recent incidents (last 90 days) with site coordinates
    const incidentsResult = await db.query(`
      SELECT i.*, s.name as site_name, s.latitude as site_lat, s.longitude as site_lng,
             g.full_name as guard_name
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      WHERE i.filed_at >= NOW() - INTERVAL '90 days'
      ORDER BY i.filed_at DESC
    `);

    // 5. Coverage stats
    const statsResult = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM sites WHERE status = 'active') as active_sites,
        (SELECT COUNT(*) FROM sites WHERE status = 'elevated') as elevated_sites,
        (SELECT COUNT(*) FROM guards WHERE status IN ('on_duty', 'active')) as available_guards,
        (SELECT COUNT(*) FROM guards) as total_guards,
        (SELECT COUNT(*) FROM shifts WHERE shift_date = $1 AND status IN ('scheduled', 'in_progress')) as today_shifts,
        (SELECT COUNT(*) FROM incidents WHERE status IN ('open', 'investigating')) as open_incidents
    `, [today]);

    res.json({
      sites: sitesResult.rows,
      guards: guardsResult.rows,
      shifts: shiftsResult.rows,
      incidents: incidentsResult.rows,
      stats: statsResult.rows[0],
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Map data error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
