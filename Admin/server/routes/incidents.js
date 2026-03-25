const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT i.*, s.name as site_name, g.full_name as guard_name
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      ORDER BY i.filed_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { type, severity, site_id, guard_id, description, specific_location, damages_srd, police_notified, followup_required, additional_notes } = req.body;

    // Generate incident ID
    const countResult = await db.query('SELECT COUNT(*) FROM incidents');
    const nextId = parseInt(countResult.rows[0].count) + 45;
    const incident_id = `INC-${String(nextId).padStart(3, '0')}`;

    const result = await db.query(
      `INSERT INTO incidents (incident_id, type, severity, site_id, guard_id, description, specific_location, damages_srd, police_notified, followup_required, additional_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [incident_id, type, severity, site_id, guard_id, description, specific_location, damages_srd, police_notified, followup_required, additional_notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { type, severity, site_id, guard_id, description, specific_location, damages_srd, police_notified, followup_required, additional_notes, status } = req.body;
    const result = await db.query(
      `UPDATE incidents SET type=$1, severity=$2, site_id=$3, guard_id=$4, description=$5, specific_location=$6,
       damages_srd=$7, police_notified=$8, followup_required=$9, additional_notes=$10, status=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [type, severity, site_id, guard_id, description, specific_location, damages_srd, police_notified, followup_required, additional_notes, status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM incidents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Incident deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const setResolved = (status === 'resolved' || status === 'closed');
    const result = await db.query(
      `UPDATE incidents SET status=$1, resolved_at=${setResolved ? 'NOW()' : 'resolved_at'} WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
