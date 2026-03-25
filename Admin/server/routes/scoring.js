const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// POST /api/scoring/recalculate — recalculate all guard scores
router.post('/recalculate', auth, async (req, res) => {
  try {
    const guards = await db.query('SELECT id FROM guards');
    let updated = 0;

    for (const guard of guards.rows) {
      // Get shift stats
      const stats = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'missed') as missed,
          COUNT(*) FILTER (WHERE status IN ('completed','missed','cancelled')) as total
        FROM shifts WHERE guard_id = $1
      `, [guard.id]);

      // Get attendance stats
      const attendance = await db.query(`
        SELECT
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE is_late = true) as late_count,
          COUNT(*) FILTER (WHERE is_sick_call = true) as sick_count,
          COUNT(*) FILTER (WHERE is_no_show = true) as no_show_count,
          COALESCE(AVG(late_minutes) FILTER (WHERE is_late = true), 0) as avg_late_minutes
        FROM attendance WHERE guard_id = $1
      `, [guard.id]);

      // Get incidents handled
      const incidents = await db.query(
        'SELECT COUNT(*) as handled FROM incidents WHERE guard_id = $1',
        [guard.id]
      );

      const s = stats.rows[0];
      const a = attendance.rows[0];
      const i = incidents.rows[0];

      const completed = parseInt(s.completed) || 0;
      const missed = parseInt(s.missed) || 0;
      const total = parseInt(s.total) || 0;
      const lateCount = parseInt(a.late_count) || 0;
      const sickCount = parseInt(a.sick_count) || 0;
      const noShowCount = parseInt(a.no_show_count) || 0;
      const incidentsHandled = parseInt(i.handled) || 0;

      // Calculate score (out of 100)
      let score = 100;

      // Shift completion (40% weight)
      if (total > 0) {
        const completionRate = completed / total;
        score -= (1 - completionRate) * 40;
      }

      // Punctuality (25% weight)
      if (completed > 0) {
        const lateRate = lateCount / completed;
        score -= lateRate * 25;
      }

      // Attendance (20% weight) — sick days and no-shows
      if (total > 0) {
        const absenceRate = (sickCount + noShowCount) / total;
        score -= absenceRate * 20;
      }

      // Bonus for incidents handled (up to +5)
      score += Math.min(incidentsHandled * 0.5, 5);

      // Clamp between 0 and 100
      score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));

      // On-time percentage
      const onTimePct = completed > 0 ? Math.round(((completed - lateCount) / completed) * 100) : 100;

      // Update guard
      await db.query(`
        UPDATE guards SET
          auto_score = $1,
          performance_score = $1,
          total_shifts_completed = $2,
          total_shifts_missed = $3,
          total_late_arrivals = $4,
          total_sick_days = $5,
          on_time_percentage = $6,
          last_score_update = NOW(),
          updated_at = NOW()
        WHERE id = $7
      `, [score, completed, missed, lateCount, sickCount, onTimePct, guard.id]);

      updated++;
    }

    res.json({ success: true, guards_updated: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scoring/guard/:id — get detailed score breakdown for a guard
router.get('/guard/:id', auth, async (req, res) => {
  try {
    const guard = await db.query(`
      SELECT g.*, s.name as site_name
      FROM guards g LEFT JOIN sites s ON g.assigned_site_id = s.id
      WHERE g.id = $1
    `, [req.params.id]);

    if (guard.rows.length === 0) return res.status(404).json({ error: 'Guard not found' });

    const attendance = await db.query(`
      SELECT date, scheduled_start, actual_clock_in, is_late, late_minutes, is_sick_call, is_no_show, notes
      FROM attendance WHERE guard_id = $1 ORDER BY date DESC LIMIT 30
    `, [req.params.id]);

    const shiftStats = await db.query(`
      SELECT status, COUNT(*) as count FROM shifts WHERE guard_id = $1 GROUP BY status
    `, [req.params.id]);

    res.json({
      guard: guard.rows[0],
      recent_attendance: attendance.rows,
      shift_breakdown: shiftStats.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
