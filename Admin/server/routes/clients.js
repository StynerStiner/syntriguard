const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id) as site_count,
        (SELECT COALESCE(SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END), 0) FROM guards g
         JOIN sites s ON g.assigned_site_id = s.id WHERE s.client_id = c.id) as total_guards
      FROM clients c ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, contact_name, contact_email, contact_phone, address, district, status, contract_value_srd, notes } = req.body;
    const result = await db.query(
      `INSERT INTO clients (name, contact_name, contact_email, contact_phone, address, district, status, contract_value_srd, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, contact_name, contact_email, contact_phone, address, district, status || 'active', contract_value_srd, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, contact_name, contact_email, contact_phone, address, district, status, contract_value_srd, notes } = req.body;
    const result = await db.query(
      `UPDATE clients SET name=$1, contact_name=$2, contact_email=$3, contact_phone=$4, address=$5, district=$6, status=$7, contract_value_srd=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [name, contact_name, contact_email, contact_phone, address, district, status, contract_value_srd, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Client deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
