const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/guards
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT g.*, s.name as site_name
      FROM guards g
      LEFT JOIN sites s ON g.assigned_site_id = s.id
      ORDER BY g.guard_id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/guards/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT g.*, s.name as site_name
      FROM guards g
      LEFT JOIN sites s ON g.assigned_site_id = s.id
      WHERE g.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Guard not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/guards
router.post('/', auth, async (req, res) => {
  try {
    const { guard_id, full_name, role, assigned_site_id, phone, email, status, hire_date, notes } = req.body;
    const result = await db.query(
      `INSERT INTO guards (guard_id, full_name, role, assigned_site_id, phone, email, status, hire_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [guard_id, full_name, role, assigned_site_id, phone, email, status || 'active', hire_date, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/guards/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { full_name, role, assigned_site_id, phone, email, status, performance_score, notes } = req.body;
    const result = await db.query(
      `UPDATE guards SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        assigned_site_id = COALESCE($3, assigned_site_id),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        status = COALESCE($6, status),
        performance_score = COALESCE($7, performance_score),
        notes = COALESCE($8, notes),
        updated_at = NOW()
       WHERE id=$9 RETURNING *`,
      [full_name || null, role || null, assigned_site_id || null, phone || null, email || null, status || null, performance_score || null, notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Guard not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/guards/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM guards WHERE id = $1', [req.params.id]);
    res.json({ message: 'Guard deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
