const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/messages/unread/count
router.get('/unread/count', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) as unread_count FROM messages WHERE receiver_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ unread_count: parseInt(result.rows[0].unread_count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/conversation/:guardId — messages between admin and a guard
router.get('/conversation/:guardId', auth, async (req, res) => {
  try {
    var guardId = parseInt(req.params.guardId);
    var userId = req.user.id;
    var limit = parseInt(req.query.limit) || 50;

    // Use negative guard IDs as a convention: guard messages use guard_id in sender/receiver
    // We store: sender_id = user.id (admin) or -(guard.id) for guard-sent messages
    // receiver_id = -(guard.id) for admin-to-guard, user.id for guard-to-admin
    var result = await db.query(`
      SELECT m.*,
        CASE WHEN m.sender_id = $1 THEN 'admin' ELSE 'guard' END as direction
      FROM messages m
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
      LIMIT $3
    `, [userId, -guardId, limit]);

    // Mark received messages as read
    await db.query(
      'UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false',
      [-guardId, userId]
    );

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/messages — send message to a guard
router.post('/', auth, async (req, res) => {
  try {
    var { guard_id, content } = req.body;
    if (!guard_id || !content) return res.status(400).json({ error: 'guard_id and content required' });

    var result = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, content, message_type, is_read) VALUES ($1, $2, $3, $4, false) RETURNING *',
      [req.user.id, -parseInt(guard_id), content, 'text']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/latest — get latest message per guard for sidebar
router.get('/latest', auth, async (req, res) => {
  try {
    var userId = req.user.id;
    var result = await db.query(`
      SELECT DISTINCT ON (guard_id) guard_id, content, created_at, is_read, direction
      FROM (
        SELECT -(m.receiver_id) as guard_id, m.content, m.created_at, m.is_read, 'sent' as direction
        FROM messages m WHERE m.sender_id = $1 AND m.receiver_id < 0
        UNION ALL
        SELECT -(m.sender_id) as guard_id, m.content, m.created_at, m.is_read, 'received' as direction
        FROM messages m WHERE m.receiver_id = $1 AND m.sender_id < 0
      ) sub
      ORDER BY guard_id, created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
