const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db');
const auth = require('../middleware/auth');

// Store in memory — we resize, convert to base64, and save in database
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max upload
  fileFilter: function(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, png, gif, webp)'));
    }
  }
});

// POST /api/uploads/avatar — upload profile image, resized and stored as base64
router.post('/avatar', auth, function(req, res, next) {
  upload.single('avatar')(req, res, function(err) {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Auto-rotate (fix EXIF orientation), resize, high quality
    let resizedBuffer;
    try {
      resizedBuffer = await sharp(req.file.buffer)
        .rotate()           // auto-rotate based on EXIF — fixes sideways photos
        .resize(400, 400, {
          fit: 'cover',     // crop to square without distortion
          position: 'centre' // center the crop on the face area
        })
        .jpeg({ quality: 92, mozjpeg: true }) // high quality, sharp output
        .toBuffer();
    } catch (sharpErr) {
      // If sharp fails, store original but capped at reasonable size
      console.error('Sharp resize failed, using original:', sharpErr.message);
      if (req.file.buffer.length > 500 * 1024) {
        return res.status(400).json({ error: 'Image could not be processed. Try a smaller file or different format.' });
      }
      resizedBuffer = req.file.buffer;
    }

    const base64 = resizedBuffer.toString('base64');
    const mimeType = resizedBuffer === req.file.buffer ? req.file.mimetype : 'image/jpeg';
    const avatarUrl = 'data:' + mimeType + ';base64,' + base64;

    const { user_id, guard_id } = req.body;

    // Update user avatar
    if (user_id) {
      await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, user_id]);
    }

    // Update guard avatar
    if (guard_id) {
      await db.query('UPDATE guards SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, guard_id]);
    }

    // If no specific ID, update the logged-in user
    if (!user_id && !guard_id) {
      await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, req.user.id]);
    }

    res.json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/uploads/avatar-url — update avatar using an external URL (no file upload needed)
router.put('/avatar-url', auth, async (req, res) => {
  try {
    const { avatar_url, user_id, guard_id } = req.body;
    if (!avatar_url) return res.status(400).json({ error: 'avatar_url is required' });

    if (user_id) {
      await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatar_url, user_id]);
    }
    if (guard_id) {
      await db.query('UPDATE guards SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatar_url, guard_id]);
    }
    if (!user_id && !guard_id) {
      await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatar_url, req.user.id]);
    }

    res.json({ success: true, avatar_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
