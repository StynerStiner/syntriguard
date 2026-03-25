const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.full_name, role: user.role, avatar_url: user.avatar_url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, role } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const defaultAvatar = 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';
    const userRole = role || 'operator';
    const result = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role, avatar_url',
      [email, hash, full_name, userRole, defaultAvatar]
    );

    const newUser = result.rows[0];

    // If role is guard, auto-create a guard entry in the guards table
    if (userRole === 'guard') {
      const countResult = await db.query('SELECT COUNT(*) FROM guards');
      const nextNum = parseInt(countResult.rows[0].count) + 1;
      const guardId = 'G-' + String(nextNum).padStart(3, '0');

      await db.query(
        `INSERT INTO guards (guard_id, full_name, role, user_id, email, phone, status, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [guardId, full_name, 'Site Guard', newUser.id, email, null, 'active', defaultAvatar]
      );
    }

    res.status(201).json(newUser);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
