'use strict';
const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);

// GET /api/admin/management-users
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, management_code, is_active, created_at
       FROM management_users WHERE school_id = $1 ORDER BY role, name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/management-users
router.post('/', async (req, res, next) => {
  try {
    const { name, role, management_code, pin } = req.body;
    if (!name || !role || !management_code || !pin)
      return res.status(400).json({ error: 'Name, role, management code and PIN are required' });
    if (!['principal', 'vice_principal'].includes(role))
      return res.status(400).json({ error: 'Role must be principal or vice_principal' });
    if (String(pin).length < 4 || String(pin).length > 8)
      return res.status(400).json({ error: 'PIN must be 4–8 digits' });

    const pinHash = await bcrypt.hash(String(pin), 10);
    const { rows } = await pool.query(
      `INSERT INTO management_users (school_id, name, role, management_code, pin_hash)
       VALUES ($1, $2, $3, UPPER($4), $5)
       RETURNING id, name, role, management_code, is_active, created_at`,
      [req.schoolId, name.trim(), role, management_code.trim(), pinHash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Management code already in use for this school' });
    next(err);
  }
});

// PUT /api/admin/management-users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, role, management_code, pin, is_active } = req.body;
    let pinHash = undefined;
    if (pin) {
      if (String(pin).length < 4 || String(pin).length > 8)
        return res.status(400).json({ error: 'PIN must be 4–8 digits' });
      pinHash = await bcrypt.hash(String(pin), 10);
    }
    const { rows } = await pool.query(
      `UPDATE management_users SET
         name            = COALESCE($1, name),
         role            = COALESCE($2, role),
         management_code = COALESCE(UPPER($3), management_code),
         pin_hash        = COALESCE($4, pin_hash),
         is_active       = COALESCE($5, is_active),
         updated_at      = now()
       WHERE id = $6 AND school_id = $7
       RETURNING id, name, role, management_code, is_active, created_at`,
      [name?.trim() || null, role || null, management_code?.trim() || null,
       pinHash || null, is_active ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Management user not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Management code already in use for this school' });
    next(err);
  }
});

// DELETE /api/admin/management-users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM management_users WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Management user not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
