const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/stats', auth, async (req, res) => {
  try {
    const [guards, sites, incidents, shifts] = await Promise.all([
      db.query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'on_duty') as on_duty,
        COUNT(*) FILTER (WHERE status = 'off_duty') as off_duty,
        COUNT(*) FILTER (WHERE status = 'on_leave') as on_leave,
        COUNT(*) FILTER (WHERE status = 'unassigned') as unassigned
        FROM guards`),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM sites`),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'open') as critical FROM incidents`),
      db.query(`SELECT
        COUNT(*) FILTER (WHERE shift_date = CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE shift_date = CURRENT_DATE AND status = 'completed') as completed,
        COUNT(*) FILTER (WHERE shift_date = CURRENT_DATE AND status = 'scheduled') as upcoming
        FROM shifts`)
    ]);

    res.json({
      guards: guards.rows[0],
      sites: sites.rows[0],
      incidents: incidents.rows[0],
      shifts: shifts.rows[0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/dashboard/notifications — live activity feed
router.get('/notifications', auth, async (req, res) => {
  try {
    const notifications = [];

    // Recent incidents
    const incidents = await db.query(`
      SELECT i.incident_id, i.type, i.severity, i.filed_at,
             s.name as site_name, g.full_name as guard_name
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      ORDER BY i.filed_at DESC LIMIT 5
    `);
    incidents.rows.forEach(i => {
      notifications.push({
        type: 'incident',
        icon: 'ti ti-alert-triangle',
        color: i.severity === 'critical' ? 'danger' : i.severity === 'high' ? 'warning' : 'info',
        title: (i.guard_name || 'Guard') + ' filed ' + i.incident_id + ' — ' + i.type,
        subtitle: i.site_name || '',
        time: i.filed_at
      });
    });

    // Recent shift changes
    const revisions = await db.query(`
      SELECT sr.created_at, sr.reason, u.full_name as changed_by,
             g_new.full_name as guard_name, s.name as site_name
      FROM shift_revisions sr
      LEFT JOIN users u ON sr.changed_by = u.id
      LEFT JOIN guards g_new ON sr.new_guard_id = g_new.id
      LEFT JOIN shifts sh ON sr.shift_id = sh.id
      LEFT JOIN sites s ON sh.site_id = s.id
      ORDER BY sr.created_at DESC LIMIT 5
    `);
    revisions.rows.forEach(r => {
      notifications.push({
        type: 'schedule',
        icon: 'ti ti-calendar',
        color: 'primary',
        title: 'Schedule updated' + (r.guard_name ? ': ' + r.guard_name : ''),
        subtitle: r.reason || r.site_name || '',
        time: r.created_at
      });
    });

    // Recent attendance (clock-ins, sick calls)
    const attendance = await db.query(`
      SELECT a.date, a.is_late, a.is_sick_call, a.is_no_show, a.created_at,
             g.full_name as guard_name, s.name as site_name
      FROM attendance a
      LEFT JOIN guards g ON a.guard_id = g.id
      LEFT JOIN shifts sh ON a.shift_id = sh.id
      LEFT JOIN sites s ON sh.site_id = s.id
      ORDER BY a.created_at DESC LIMIT 5
    `);
    attendance.rows.forEach(a => {
      let title, color;
      if (a.is_sick_call) {
        title = a.guard_name + ' called in sick';
        color = 'warning';
      } else if (a.is_no_show) {
        title = a.guard_name + ' — no show';
        color = 'danger';
      } else if (a.is_late) {
        title = a.guard_name + ' clocked in late';
        color = 'warning';
      } else {
        title = a.guard_name + ' clocked in';
        color = 'success';
      }
      notifications.push({
        type: 'attendance',
        icon: 'ti ti-clock',
        color: color,
        title: title,
        subtitle: a.site_name || '',
        time: a.created_at
      });
    });

    // Sort all by time, most recent first
    notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json(notifications.slice(0, 10));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
