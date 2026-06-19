'use strict';
const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

/* POST /api/principal/auth/login */
router.post('/login', async (req, res, next) => {
  try {
    const { schoolCode, managementCode, pin } = req.body;
    if (!schoolCode || !managementCode || !pin)
      return res.status(400).json({ error: 'School code, management code and PIN are required' });

    const { rows: sc } = await pool.query(
      `SELECT id, name, primary_color, accent_color, logo_url
       FROM schools WHERE LOWER(code) = LOWER($1)`,
      [schoolCode.trim()]
    );
    if (!sc.length) return res.status(401).json({ error: 'Invalid school code' });
    const school = sc[0];

    const { rows } = await pool.query(
      `SELECT * FROM management_users
       WHERE school_id = $1 AND UPPER(management_code) = UPPER($2) AND is_active = true`,
      [school.id, managementCode.trim()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid management code or PIN' });

    const user = rows[0];
    const ok   = await bcrypt.compare(String(pin), user.pin_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid management code or PIN' });

    const token = jwt.sign(
      { id: user.id, schoolId: school.id, role: user.role, type: 'management' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user:   { id: user.id, name: user.name, role: user.role, managementCode: user.management_code },
      school: { name: school.name, primaryColor: school.primary_color, accentColor: school.accent_color, logoUrl: school.logo_url },
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
      `SELECT mu.id, mu.name, mu.role, mu.management_code,
              s.name AS school_name, s.primary_color, s.accent_color, s.logo_url
       FROM management_users mu
       JOIN schools s ON s.id = mu.school_id
       WHERE mu.id = $1 AND mu.is_active = true`,
      [payload.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Account not found or deactivated' });
    const r = rows[0];
    res.json({
      id: r.id, name: r.name, role: r.role, managementCode: r.management_code,
      schoolId: payload.schoolId,
      school: { name: r.school_name, primaryColor: r.primary_color, accentColor: r.accent_color, logoUrl: r.logo_url },
    });
  } catch (err) { next(err); }
});

module.exports = router;
