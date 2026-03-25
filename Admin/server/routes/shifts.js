const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = `
      SELECT sh.*, g.full_name as guard_name, s.name as site_name
      FROM shifts sh
      LEFT JOIN guards g ON sh.guard_id = g.id
      LEFT JOIN sites s ON sh.site_id = s.id
    `;
    const params = [];
    if (start && end) {
      query += ' WHERE sh.shift_date BETWEEN $1 AND $2';
      params.push(start, end);
    }
    query += ' ORDER BY sh.shift_date, sh.start_time';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { guard_id, site_id, shift_date, start_time, end_time, shift_type, notes } = req.body;
    const result = await db.query(
      `INSERT INTO shifts (guard_id, site_id, shift_date, start_time, end_time, shift_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [guard_id, site_id, shift_date, start_time, end_time, shift_type, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/shifts/:id — full shift update with revision tracking
router.put('/:id', auth, async (req, res) => {
  try {
    const shiftId = req.params.id;
    const { guard_id, site_id, shift_date, start_time, end_time, shift_type, status, notes, reason, changed_by_ai } = req.body;

    // Fetch the current shift before updating
    const currentResult = await db.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    const current = currentResult.rows[0];

    // Determine what changed
    const newGuardId = guard_id !== undefined ? guard_id : current.guard_id;
    const newSiteId = site_id !== undefined ? site_id : current.site_id;
    const newStartTime = start_time !== undefined ? start_time : current.start_time;
    const newEndTime = end_time !== undefined ? end_time : current.end_time;
    const newStatus = status !== undefined ? status : current.status;
    const newShiftType = shift_type !== undefined ? shift_type : current.shift_type;
    const newShiftDate = shift_date !== undefined ? shift_date : current.shift_date;
    const newNotes = notes !== undefined ? notes : current.notes;

    // Check if anything actually changed
    const hasChanges =
      newGuardId !== current.guard_id ||
      newSiteId !== current.site_id ||
      String(newStartTime) !== String(current.start_time) ||
      String(newEndTime) !== String(current.end_time) ||
      newStatus !== current.status ||
      newShiftType !== current.shift_type ||
      String(newShiftDate) !== String(current.shift_date) ||
      newNotes !== current.notes;

    if (hasChanges) {
      // Calculate new revision number
      const revisionCount = (current.revision_count || 0) + 1;

      // Save revision record
      await db.query(
        `INSERT INTO shift_revisions
          (shift_id, revision_number, changed_by, changed_by_ai,
           old_guard_id, new_guard_id, old_site_id, new_site_id,
           old_start_time, new_start_time, old_end_time, new_end_time,
           old_status, new_status, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          shiftId, revisionCount, req.user.id, changed_by_ai || false,
          current.guard_id, newGuardId,
          current.site_id, newSiteId,
          current.start_time, newStartTime,
          current.end_time, newEndTime,
          current.status, newStatus,
          reason || null
        ]
      );

      // Update the shift with new values + revision metadata
      const result = await db.query(
        `UPDATE shifts
         SET guard_id = $1, site_id = $2, shift_date = $3, start_time = $4, end_time = $5,
             shift_type = $6, status = $7, notes = $8,
             revision_count = $9, last_modified_by = $10, last_modified_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [newGuardId, newSiteId, newShiftDate, newStartTime, newEndTime,
         newShiftType, newStatus, newNotes,
         revisionCount, req.user.id, shiftId]
      );

      // Fetch guard and site names for the response
      const enriched = await db.query(
        `SELECT sh.*, g.full_name as guard_name, s.name as site_name
         FROM shifts sh
         LEFT JOIN guards g ON sh.guard_id = g.id
         LEFT JOIN sites s ON sh.site_id = s.id
         WHERE sh.id = $1`, [shiftId]
      );

      res.json({
        ...enriched.rows[0],
        revision_number: revisionCount,
        revision_tracked: true
      });
    } else {
      // Nothing changed, return current shift
      res.json({ ...current, revision_tracked: false, message: 'No changes detected' });
    }
  } catch (err) {
    console.error('Shift update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/shifts/:id/status — quick status update (kept for backward compatibility)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const shiftId = req.params.id;
    const { status, clock_in, clock_out, reason, changed_by_ai } = req.body;

    // Fetch current shift
    const currentResult = await db.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    const current = currentResult.rows[0];

    // Track revision if status changed
    if (status && status !== current.status) {
      const revisionCount = (current.revision_count || 0) + 1;

      await db.query(
        `INSERT INTO shift_revisions
          (shift_id, revision_number, changed_by, changed_by_ai,
           old_guard_id, new_guard_id, old_site_id, new_site_id,
           old_start_time, new_start_time, old_end_time, new_end_time,
           old_status, new_status, reason)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7, $7, $8, $8, $9, $10, $11)`,
        [
          shiftId, revisionCount, req.user.id, changed_by_ai || false,
          current.guard_id, current.site_id,
          current.start_time, current.end_time,
          current.status, status,
          reason || null
        ]
      );

      const result = await db.query(
        `UPDATE shifts
         SET status = $1, clock_in = COALESCE($2, clock_in), clock_out = COALESCE($3, clock_out),
             revision_count = $4, last_modified_by = $5, last_modified_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [status, clock_in, clock_out, revisionCount, req.user.id, shiftId]
      );
      res.json({ ...result.rows[0], revision_number: revisionCount, revision_tracked: true });
    } else {
      // Just update clock times without revision
      const result = await db.query(
        `UPDATE shifts SET status = COALESCE($1, status), clock_in = COALESCE($2, clock_in), clock_out = COALESCE($3, clock_out) WHERE id = $4 RETURNING *`,
        [status, clock_in, clock_out, shiftId]
      );
      res.json(result.rows[0]);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/shifts/:id/revisions — get revision history for a shift
router.get('/:id/revisions', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sr.*, u.full_name as changed_by_name,
              g_old.full_name as old_guard_name, g_new.full_name as new_guard_name,
              s_old.name as old_site_name, s_new.name as new_site_name
       FROM shift_revisions sr
       LEFT JOIN users u ON sr.changed_by = u.id
       LEFT JOIN guards g_old ON sr.old_guard_id = g_old.id
       LEFT JOIN guards g_new ON sr.new_guard_id = g_new.id
       LEFT JOIN sites s_old ON sr.old_site_id = s_old.id
       LEFT JOIN sites s_new ON sr.new_site_id = s_new.id
       WHERE sr.shift_id = $1
       ORDER BY sr.revision_number DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM shifts WHERE id = $1', [req.params.id]);
    res.json({ message: 'Shift deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Attendance Tracking Endpoints ──

// POST /api/shifts/:id/clock-in — records clock-in time, checks if late
router.post('/:id/clock-in', auth, async (req, res) => {
  try {
    const shiftId = req.params.id;
    const shift = await db.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    if (shift.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });

    const s = shift.rows[0];
    const now = new Date();
    const clockInTime = req.body.clock_in || now.toTimeString().substring(0, 8);
    const shiftDate = s.shift_date instanceof Date
      ? s.shift_date.toISOString().split('T')[0]
      : String(s.shift_date).split('T')[0];

    // Determine if late
    const scheduledStart = s.start_time || '06:00:00';
    const scheduledMinutes = timeToMinutes(scheduledStart);
    const actualMinutes = timeToMinutes(clockInTime);
    const isLate = actualMinutes > scheduledMinutes;
    const lateMinutes = isLate ? actualMinutes - scheduledMinutes : 0;

    // Create or update attendance record
    const existing = await db.query(
      'SELECT id FROM attendance WHERE shift_id = $1 AND guard_id = $2',
      [shiftId, s.guard_id]
    );

    let attendance;
    if (existing.rows.length > 0) {
      attendance = await db.query(
        `UPDATE attendance SET actual_clock_in = $1, is_late = $2, late_minutes = $3, is_no_show = false
         WHERE id = $4 RETURNING *`,
        [clockInTime, isLate, lateMinutes, existing.rows[0].id]
      );
    } else {
      attendance = await db.query(
        `INSERT INTO attendance (guard_id, shift_id, date, scheduled_start, actual_clock_in, is_late, late_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [s.guard_id, shiftId, shiftDate, scheduledStart, clockInTime, isLate, lateMinutes]
      );
    }

    // Update shift status to active/in-progress
    await db.query(
      "UPDATE shifts SET status = 'in_progress', clock_in = NOW() WHERE id = $1",
      [shiftId]
    );

    res.json({
      message: 'Clock-in recorded',
      is_late: isLate,
      late_minutes: lateMinutes,
      attendance: attendance.rows[0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shifts/:id/clock-out — records clock-out time
router.post('/:id/clock-out', auth, async (req, res) => {
  try {
    const shiftId = req.params.id;
    const shift = await db.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    if (shift.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });

    const s = shift.rows[0];
    const now = new Date();
    const clockOutTime = req.body.clock_out || now.toTimeString().substring(0, 8);

    // Update attendance record
    const existing = await db.query(
      'SELECT id FROM attendance WHERE shift_id = $1 AND guard_id = $2',
      [shiftId, s.guard_id]
    );

    let attendance;
    if (existing.rows.length > 0) {
      attendance = await db.query(
        'UPDATE attendance SET actual_clock_out = $1 WHERE id = $2 RETURNING *',
        [clockOutTime, existing.rows[0].id]
      );
    } else {
      const shiftDate = s.shift_date instanceof Date
        ? s.shift_date.toISOString().split('T')[0]
        : String(s.shift_date).split('T')[0];
      attendance = await db.query(
        `INSERT INTO attendance (guard_id, shift_id, date, scheduled_start, actual_clock_out)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [s.guard_id, shiftId, shiftDate, s.start_time, clockOutTime]
      );
    }

    // Update shift status to completed
    await db.query(
      "UPDATE shifts SET status = 'completed', clock_out = NOW() WHERE id = $1",
      [shiftId]
    );

    res.json({
      message: 'Clock-out recorded',
      attendance: attendance.rows[0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shifts/:id/sick — marks shift as sick call
router.post('/:id/sick', auth, async (req, res) => {
  try {
    const shiftId = req.params.id;
    const shift = await db.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    if (shift.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });

    const s = shift.rows[0];
    const shiftDate = s.shift_date instanceof Date
      ? s.shift_date.toISOString().split('T')[0]
      : String(s.shift_date).split('T')[0];
    const notes = req.body.notes || 'Sick call';

    // Create or update attendance record
    const existing = await db.query(
      'SELECT id FROM attendance WHERE shift_id = $1 AND guard_id = $2',
      [shiftId, s.guard_id]
    );

    let attendance;
    if (existing.rows.length > 0) {
      attendance = await db.query(
        'UPDATE attendance SET is_sick_call = true, notes = $1 WHERE id = $2 RETURNING *',
        [notes, existing.rows[0].id]
      );
    } else {
      attendance = await db.query(
        `INSERT INTO attendance (guard_id, shift_id, date, scheduled_start, is_sick_call, notes)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
        [s.guard_id, shiftId, shiftDate, s.start_time, notes]
      );
    }

    // Update shift status
    await db.query(
      "UPDATE shifts SET status = 'missed', notes = COALESCE(notes || ' | ', '') || $1 WHERE id = $2",
      ['Sick call: ' + notes, shiftId]
    );

    res.json({
      message: 'Sick call recorded',
      attendance: attendance.rows[0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shifts/:id/no-show — marks shift as no-show
router.post('/:id/no-show', auth, async (req, res) => {
  try {
    const shiftId = req.params.id;
    const shift = await db.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
    if (shift.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });

    const s = shift.rows[0];
    const shiftDate = s.shift_date instanceof Date
      ? s.shift_date.toISOString().split('T')[0]
      : String(s.shift_date).split('T')[0];
    const notes = req.body.notes || 'No-show';

    // Create or update attendance record
    const existing = await db.query(
      'SELECT id FROM attendance WHERE shift_id = $1 AND guard_id = $2',
      [shiftId, s.guard_id]
    );

    let attendance;
    if (existing.rows.length > 0) {
      attendance = await db.query(
        'UPDATE attendance SET is_no_show = true, notes = $1 WHERE id = $2 RETURNING *',
        [notes, existing.rows[0].id]
      );
    } else {
      attendance = await db.query(
        `INSERT INTO attendance (guard_id, shift_id, date, scheduled_start, is_no_show, notes)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
        [s.guard_id, shiftId, shiftDate, s.start_time, notes]
      );
    }

    // Update shift status
    await db.query(
      "UPDATE shifts SET status = 'missed', notes = COALESCE(notes || ' | ', '') || $1 WHERE id = $2",
      ['No-show: ' + notes, shiftId]
    );

    res.json({
      message: 'No-show recorded',
      attendance: attendance.rows[0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: convert HH:MM:SS or HH:MM to total minutes
function timeToMinutes(timeStr) {
  var parts = String(timeStr).split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

module.exports = router;
