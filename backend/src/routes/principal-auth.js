'use strict';
const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

/* POST /api/principal/auth/login
   Body: { schoolCode, managementCode (= teacher_code), pin } */
router.post('/login', async (req, res, next) => {
  try {
    const { schoolCode, managementCode, pin } = req.body;
    if (!schoolCode || !managementCode || !pin)
      return res.status(400).json({ error: 'School code, Teacher ID and PIN are required' });

    const { rows: sc } = await pool.query(
      `SELECT id, name, primary_color, accent_color, logo_url
       FROM schools WHERE LOWER(code) = LOWER($1)`,
      [schoolCode.trim()]
    );
    if (!sc.length) return res.status(401).json({ error: 'Invalid school code' });
    const school = sc[0];

    // Authenticate against teachers table — management access requires management_role set
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, pin_hash, management_role
       FROM teachers
       WHERE school_id = $1
         AND UPPER(teacher_code) = UPPER($2)
         AND status = 'Active'
         AND management_role IS NOT NULL`,
      [school.id, managementCode.trim()]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Invalid Teacher ID or PIN, or no management role assigned' });

    const teacher = rows[0];
    const ok = await bcrypt.compare(String(pin), teacher.pin_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid Teacher ID or PIN' });

    const token = jwt.sign(
      { id: teacher.id, schoolId: school.id, role: teacher.management_role, type: 'management' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id:             teacher.id,
        name:           teacher.name,
        role:           teacher.management_role,
        managementCode: teacher.teacher_code,
      },
      school: {
        name:         school.name,
        primaryColor: school.primary_color,
        accentColor:  school.accent_color,
        logoUrl:      school.logo_url,
      },
    });
  } catch (err) { next(err); }
});

/* GET /api/principal/auth/me */
router.get('/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    let payload;
    try { payload = jwt.verify(header.slice(7), process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
    if (payload.type !== 'management') return res.status(401).json({ error: 'Wrong token type' });

    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.teacher_code, t.management_role,
              s.name AS school_name, s.primary_color, s.accent_color, s.logo_url
       FROM teachers t
       JOIN schools s ON s.id = t.school_id
       WHERE t.id = $1 AND t.status = 'Active' AND t.management_role IS NOT NULL`,
      [payload.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Account not found or management access revoked' });
    const r = rows[0];
    res.json({
      id:             r.id,
      name:           r.name,
      role:           r.management_role,
      managementCode: r.teacher_code,
      schoolId:       payload.schoolId,
      school: {
        name:         r.school_name,
        primaryColor: r.primary_color,
        accentColor:  r.accent_color,
        logoUrl:      r.logo_url,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
