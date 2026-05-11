const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

function signToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// POST /api/auth/login
// Body: { type: 'teacher'|'admin', username, password, schoolId }
//   or: { type: 'super_admin', username, password }
router.post('/login', async (req, res, next) => {
  try {
    const { type } = req.body;

    // ── Super admin ──────────────────────────────────────────
    if (type === 'super_admin') {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ error: 'username and password required' });
      if (username !== process.env.ADMIN_USERNAME)
        return res.status(401).json({ error: 'Invalid credentials' });
      const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = signToken({ role: 'super_admin', name: 'Super Admin' }, '24h');
      return res.json({ token, role: 'super_admin', name: 'Super Admin' });
    }

    // ── Teacher / School admin ───────────────────────────────
    if (type === 'teacher' || type === 'admin') {
      // Accept both new (username/password) and legacy (name/pin) field names
      const username  = req.body.username  || req.body.name;
      const password  = req.body.password  || req.body.pin;
      const schoolId  = req.body.schoolId;

      if (!username || !password || !schoolId)
        return res.status(400).json({ error: 'username, password and schoolId required' });

      const { rows: schoolRows } = await pool.query(
        `SELECT s.id FROM schools s
         JOIN subscriptions sub ON sub.school_id = s.id
         WHERE s.id = $1
           AND sub.status IN ('trial', 'active')
           AND (sub.ends_at IS NULL OR sub.ends_at > now())
         ORDER BY sub.created_at DESC LIMIT 1`,
        [schoolId]
      );
      if (!schoolRows.length)
        return res.status(403).json({ error: 'School not found or subscription inactive' });

      const isAdminLogin = type === 'admin';
      const { rows } = await pool.query(
        `SELECT id, name, pin_hash, is_admin
         FROM teachers
         WHERE school_id = $1
           AND LOWER(name) = LOWER($2)
           AND status = 'Active'
           ${isAdminLogin ? 'AND is_admin = true' : ''}`,
        [schoolId, username.trim()]
      );
      if (!rows.length)
        return res.status(401).json({ error: 'Invalid username or password' });

      const teacher = rows[0];
      const valid   = await bcrypt.compare(String(password), teacher.pin_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

      const role  = teacher.is_admin ? 'admin' : 'teacher';
      const token = signToken(
        { id: teacher.id, name: teacher.name, role, schoolId },
        '8h'
      );
      return res.json({ token, role, id: teacher.id, name: teacher.name, schoolId });
    }

    res.status(400).json({ error: 'Invalid login type' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', require('../middleware/auth').authenticate, async (req, res, next) => {
  try {
    // Accept both new and legacy field names
    const currentPassword = req.body.currentPassword || req.body.currentPin;
    const newPassword     = req.body.newPassword     || req.body.newPin;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    if (req.user.role === 'super_admin')
      return res.status(400).json({ error: 'Super admin cannot use this endpoint' });
    if (String(newPassword).length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const { rows } = await pool.query(
      `SELECT pin_hash FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    const valid = await bcrypt.compare(String(currentPassword), rows[0].pin_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(String(newPassword), 12);
    await pool.query(
      `UPDATE teachers SET pin_hash = $1, updated_at = now() WHERE id = $2`,
      [newHash, req.user.id]
    );
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// Keep legacy endpoint working
router.post('/change-pin', require('../middleware/auth').authenticate, async (req, res, next) => {
  req.body.currentPassword = req.body.currentPin;
  req.body.newPassword     = req.body.newPin;
  next();
}, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPin and newPin required' });

    const { rows } = await pool.query(
      `SELECT pin_hash FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.user.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    const valid = await bcrypt.compare(String(currentPassword), rows[0].pin_hash);
    if (!valid) return res.status(401).json({ error: 'Current PIN is incorrect' });

    const newHash = await bcrypt.hash(String(newPassword), 12);
    await pool.query(
      `UPDATE teachers SET pin_hash = $1, updated_at = now() WHERE id = $2`,
      [newHash, req.user.id]
    );
    res.json({ message: 'PIN updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
