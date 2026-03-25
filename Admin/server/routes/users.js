const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/users — list all users (admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const result = await db.query(`
      SELECT id, email, full_name, role, avatar_url, is_active, created_at, updated_at
      FROM users ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users — create a new user (admin only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { email, password, full_name, role, avatar_url } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }
    if (!['admin', 'operator', 'guard', 'client'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: admin, operator, guard, or client' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, avatar_url, is_active, created_at`,
      [email, hash, full_name, role || 'guard', avatar_url]
    );

    // If role is guard, optionally link to guards table
    if (role === 'guard') {
      const guardCount = await db.query('SELECT COUNT(*) FROM guards');
      const nextNum = parseInt(guardCount.rows[0].count) + 1;
      const guardId = `G-${String(nextNum).padStart(3, '0')}`;

      await db.query(
        `INSERT INTO guards (guard_id, full_name, role, user_id, email, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [guardId, full_name, 'Site Guard', result.rows[0].id, email]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — update user (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { full_name, role, is_active, avatar_url } = req.body;
    const result = await db.query(
      `UPDATE users SET full_name=COALESCE($1, full_name), role=COALESCE($2, role),
       is_active=COALESCE($3, is_active), avatar_url=COALESCE($4, avatar_url), updated_at=NOW()
       WHERE id=$5 RETURNING id, email, full_name, role, is_active, avatar_url`,
      [full_name, role, is_active, avatar_url, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/password — change password
router.put('/:id/password', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(new_password, salt);
    await db.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    res.json({ message: 'Password updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:id — deactivate user (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    await db.query('UPDATE users SET is_active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
