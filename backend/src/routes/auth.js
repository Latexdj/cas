const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const { loginLimiter, schoolLookupLimiter, superAdminLimiter } = require('../middleware/rateLimiter');

function signToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// GET /api/auth/school/:code — public, resolves a school code to its name
router.get('/school/:code', schoolLookupLimiter, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, primary_color, accent_color, logo_url FROM schools WHERE UPPER(code) = UPPER($1)`,
      [req.params.code.trim()]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json({ id: rows[0].id, name: rows[0].name, primary_color: rows[0].primary_color, accent_color: rows[0].accent_color, logo_url: rows[0].logo_url ?? null });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
// Body: { type: 'teacher'|'admin', username, password, schoolId|schoolCode }
//   or: { type: 'super_admin', username, password }
router.post('/login', loginLimiter, (req, res, next) => {
  // Super admin login gets an additional, stricter rate limit (5 vs 10 attempts).
  if (req.body?.type === 'super_admin') return superAdminLimiter(req, res, next);
  next();
}, async (req, res, next) => {
  try {
    const { type } = req.body;

    // ── Super admin ──────────────────────────────────────────
    if (type === 'super_admin') {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ error: 'username and password required' });
      // Check DB credentials first (allows password change), fall back to env
      let storedUsername = process.env.ADMIN_USERNAME || 'admin';
      let storedHash     = process.env.ADMIN_PASSWORD_HASH;
      try {
        const { rows: credRows } = await pool.query(
          `SELECT username, password_hash FROM super_admin_credentials WHERE id = 1`
        );
        if (credRows.length) {
          storedUsername = credRows[0].username;
          storedHash     = credRows[0].password_hash;
        }
      } catch { /* table may not exist yet — fall back to env */ }
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
        `SELECT id, name, teacher_code, pin_hash, is_admin, management_role
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
      // Include school colors + level so the app can update its theme and route to the right portal
      const { rows: colorRows } = await pool.query(
        `SELECT primary_color, accent_color, logo_url, school_level, school_type FROM schools WHERE id = $1`, [schoolId]
      );
      const schoolColors = colorRows[0] ?? {};
      // Derive portal level from school_type first, then school_level column
      const isPrimary = ['Nursery', 'KG', 'Primary'].includes(schoolColors.school_type)
                     || schoolColors.school_level === 'primary';
      return res.json({
        token, role, id: teacher.id, name: teacher.name, schoolId,
        management_role: teacher.management_role ?? null,
        primary_color:   schoolColors.primary_color  ?? '#0B3D2E',
        accent_color:    schoolColors.accent_color   ?? '#C8973A',
        logo_url:        schoolColors.logo_url       ?? null,
        school_level:    isPrimary ? 'primary' : 'secondary',
      });
    }

    // ── Student ──────────────────────────────────────────────────────────────
    if (type === 'student') {
      const username   = req.body.username  || req.body.student_code;
      const password   = req.body.password  || req.body.pin;
      const schoolCode = req.body.schoolCode;
      let   schoolId   = req.body.schoolId;

      if (!username || !password || (!schoolId && !schoolCode))
        return res.status(400).json({ error: 'username, password and schoolCode required' });

      if (schoolCode && !schoolId) {
        const { rows: codeRows } = await pool.query(
          `SELECT id FROM schools WHERE UPPER(code) = UPPER($1)`, [schoolCode.trim()]
        );
        if (!codeRows.length) return res.status(404).json({ error: 'School code not found' });
        schoolId = codeRows[0].id;
      }

      // Check subscription
      const { rows: subRows } = await pool.query(
        `SELECT s.id FROM schools s
         JOIN subscriptions sub ON sub.school_id = s.id
         WHERE s.id = $1 AND sub.status IN ('trial','active')
           AND (sub.ends_at IS NULL OR sub.ends_at > now())
         ORDER BY sub.created_at DESC LIMIT 1`,
        [schoolId]
      );
      if (!subRows.length) return res.status(403).json({ error: 'School not found or subscription inactive' });

      const { rows } = await pool.query(
        `SELECT id, name, student_code, pin_hash
         FROM students
         WHERE school_id = $1 AND UPPER(student_code) = UPPER($2) AND status = 'Active'`,
        [schoolId, username.trim()]
      );
      if (!rows.length) return res.status(401).json({ error: 'Invalid Student ID or PIN' });

      const student = rows[0];
      const DEFAULT_STUDENT_PASSWORD = 'Student123';
      let mustChangePassword = false;

      if (!student.pin_hash) {
        if (String(password) !== DEFAULT_STUDENT_PASSWORD)
          return res.status(401).json({ error: 'Invalid Student ID or password' });
        mustChangePassword = true;
      } else {
        const valid = await bcrypt.compare(String(password), student.pin_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid Student ID or password' });
      }

      const token = signToken({ id: student.id, name: student.name, role: 'student', schoolId }, '12h');
      const { rows: colorRows } = await pool.query(
        `SELECT primary_color, accent_color, logo_url FROM schools WHERE id = $1`, [schoolId]
      );
      const sc = colorRows[0] ?? {};
      return res.json({
        token, role: 'student',
        id: student.id, name: student.name, schoolId,
        must_change_password: mustChangePassword,
        primary_color: sc.primary_color ?? '#3B82F6',
        accent_color:  sc.accent_color  ?? '#1D4ED8',
        logo_url:      sc.logo_url      ?? null,
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

    if (req.user.role === 'student') {
      const { rows } = await pool.query(
        `SELECT pin_hash FROM students WHERE id = $1 AND school_id = $2`,
        [req.user.id, req.schoolId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Student not found' });

      const DEFAULT_STUDENT_PASSWORD = 'Student123';
      if (!rows[0].pin_hash) {
        if (String(currentPassword) !== DEFAULT_STUDENT_PASSWORD)
          return res.status(401).json({ error: 'Current password is incorrect' });
      } else {
        const valid = await bcrypt.compare(String(currentPassword), rows[0].pin_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(String(newPassword), 12);
      await pool.query(`UPDATE students SET pin_hash = $1 WHERE id = $2`, [newHash, req.user.id]);
      return res.json({ message: 'Password updated successfully' });
    }

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

// ── POST /api/auth/staff-login ───────────────────────────────────────────────
// Unified login for all non-teaching staff (clearance + library)
router.post('/staff-login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password, schoolCode } = req.body;
    if (!email || !password || !schoolCode)
      return res.status(400).json({ error: 'email, password and schoolCode are required' });

    const { rows: schoolRows } = await pool.query(
      `SELECT id, name, primary_color, accent_color, logo_url
       FROM schools WHERE UPPER(code) = UPPER($1)`,
      [schoolCode.trim()]
    );
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });
    const school = schoolRows[0];

    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash, is_active
       FROM school_staff WHERE school_id = $1 AND LOWER(email) = LOWER($2)`,
      [school.id, email.trim()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const staff = rows[0];
    if (!staff.is_active)
      return res.status(401).json({ error: 'Account deactivated. Contact your administrator.' });

    const valid = await bcrypt.compare(String(password), staff.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const { rows: roleRows } = await pool.query(
      `SELECT role FROM school_staff_roles WHERE staff_id = $1 ORDER BY role`, [staff.id]
    );
    const staffRoles = roleRows.map(r => r.role);

    const token = jwt.sign(
      { id: staff.id, name: staff.name, role: 'staff', staffRoles, schoolId: school.id },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token, role: 'staff', staffRoles,
      id: staff.id, name: staff.name, schoolId: school.id,
      primary_color: school.primary_color,
      accent_color:  school.accent_color,
      logo_url:      school.logo_url,
    });
  } catch (err) { next(err); }
});

module.exports = router;
