const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

function signToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// GET /api/auth/school/:code — public, resolves a school code to its name
router.get('/school/:code', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, primary_color, accent_color FROM schools WHERE UPPER(code) = UPPER($1)`,
      [req.params.code.trim()]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json({ id: rows[0].id, name: rows[0].name, primary_color: rows[0].primary_color, accent_color: rows[0].accent_color });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
// Body: { type: 'teacher'|'admin', username, password, schoolId|schoolCode }
//   or: { type: 'super_admin', username, password }
router.post('/login', async (req, res, next) => {
  try {
    const { type } = req.body;

    // ── Super admin ──────────────────────────────────────────
    if (type === 'super_admin') {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ error: 'username and password required' });
      // Check DB credentials first (allows password change), fall back to env
      const { rows: credRows } = await pool.query(
        `SELECT username, password_hash FROM super_admin_credentials WHERE id = 1`
      );
      const storedUsername = credRows.length ? credRows[0].username : process.env.ADMIN_USERNAME;
      const storedHash     = credRows.length ? credRows[0].password_hash : process.env.ADMIN_PASSWORD_HASH;
      if (username !== storedUsername)
        return res.status(401).json({ error: 'Invalid credentials' });
      const valid = storedHash ? await bcrypt.compare(password, storedHash) : false;
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = signToken({ role: 'super_admin', name: 'Super Admin' }, '24h');
      return res.json({ token, role: 'super_admin', name: 'Super Admin' });
    }

    // ── Teacher / School admin ───────────────────────────────
    if (type === 'teacher' || type === 'admin') {
      // Accept both new (username/password) and legacy (name/pin) field names
      const username   = req.body.username  || req.body.name;
      const password   = req.body.password  || req.body.pin;
      const schoolCode = req.body.schoolCode; // e.g. "CAS001"
      let   schoolId   = req.body.schoolId;

      if (!username || !password || (!schoolId && !schoolCode))
        return res.status(400).json({ error: 'username, password and schoolCode required' });

      // Resolve schoolCode → schoolId UUID
      if (schoolCode && !schoolId) {
        const { rows: codeRows } = await pool.query(
          `SELECT id FROM schools WHERE UPPER(code) = UPPER($1)`,
          [schoolCode.trim()]
        );
        if (!codeRows.length)
          return res.status(404).json({ error: 'School code not found' });
        schoolId = codeRows[0].id;
      }

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
        `SELECT id, name, teacher_code, pin_hash, is_admin
         FROM teachers
         WHERE school_id = $1
           AND UPPER(teacher_code) = UPPER($2)
           AND status = 'Active'
           ${isAdminLogin ? 'AND is_admin = true' : ''}`,
        [schoolId, username.trim()]
      );
      if (!rows.length)
        return res.status(401).json({ error: 'Invalid Teacher ID or password' });

      const teacher = rows[0];
      const valid   = await bcrypt.compare(String(password), teacher.pin_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

      const role  = teacher.is_admin ? 'admin' : 'teacher';
      const token = signToken(
        { id: teacher.id, name: teacher.name, role, schoolId },
        '8h'
      );
      // Include school colors so the app can update its theme
      const { rows: colorRows } = await pool.query(
        `SELECT primary_color, accent_color FROM schools WHERE id = $1`, [schoolId]
      );
      const schoolColors = colorRows[0] ?? {};
      return res.json({
        token, role, id: teacher.id, name: teacher.name, schoolId,
        primary_color: schoolColors.primary_color ?? '#0B3D2E',
        accent_color:  schoolColors.accent_color  ?? '#C8973A',
      });
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
