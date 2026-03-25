const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.*, c.name as client_name,
        (SELECT COUNT(*) FROM guards g WHERE g.assigned_site_id = s.id) as guard_count
      FROM sites s
      LEFT JOIN clients c ON s.client_id = c.id
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { client_id, name, address, district, latitude, longitude, status, notes } = req.body;
    const result = await db.query(
      `INSERT INTO sites (client_id, name, address, district, latitude, longitude, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [client_id, name, address, district, latitude, longitude, status || 'active', notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, address, district, latitude, longitude, status, notes } = req.body;
    const result = await db.query(
      `UPDATE sites SET name=$1, address=$2, district=$3, latitude=$4, longitude=$5, status=$6, notes=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, address, district, latitude, longitude, status, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM sites WHERE id = $1', [req.params.id]);
    res.json({ message: 'Site deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
