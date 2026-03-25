const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/messages/unread/count — get unread message count for current user
router.get('/unread/count', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) as unread_count FROM messages WHERE receiver_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ unread_count: parseInt(result.rows[0].unread_count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/conversation/:userId — get messages between current user and userId
router.get('/conversation/:userId', auth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    const currentUserId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(`
      SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
      LIMIT $3 OFFSET $4
    `, [currentUserId, otherUserId, limit, offset]);

    // Mark messages from the other user as read
    await db.query(
      'UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false',
      [otherUserId, currentUserId]
    );

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/:userId — get all messages for a user (existing behavior)
router.get('/:userId', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.sender_id = $1 OR m.receiver_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50
    `, [req.params.userId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/messages — send a new message
router.post('/', auth, async (req, res) => {
  try {
    const { receiver_id, content, message_type } = req.body;
    const result = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, content, message_type) VALUES ($1, $2, $3, COALESCE($4, $5)) RETURNING *',
      [req.user.id, receiver_id, content, message_type, 'text']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/messages/:id/read — mark a specific message as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE messages SET is_read = true WHERE id = $1 AND receiver_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or not authorized' });
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
