'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');
const { requireUnrestrictedAdmin } = require('../middleware/moduleAccess');
const { getEnabledModules, LICENSABLE_MODULE_KEYS } = require('../services/modules.service');

router.use(authenticate, adminOnly);

const VALID_ROLES = ['principal', 'vice_principal'];

// Same module-access control as admin creation on the Teachers page — only an
// unrestricted admin may promote/edit/revoke a management user, since doing
// so grants (or removes) is_admin.
async function insertAllowedModules(teacherId, allowedModules, schoolId, grantedBy) {
  const schoolLicensed = await getEnabledModules(schoolId);
  const invalid = allowedModules.filter(k => !schoolLicensed.includes(k) || !LICENSABLE_MODULE_KEYS.includes(k));
  if (invalid.length) return `Not licensed to this school: ${invalid.join(', ')}`;
  for (const moduleKey of allowedModules) {
    await pool.query(
      `INSERT INTO admin_module_access (teacher_id, module_key, granted_by) VALUES ($1,$2,$3)
       ON CONFLICT (teacher_id, module_key) DO NOTHING`,
      [teacherId, moduleKey, grantedBy]
    );
  }
  return null;
}

// GET /api/admin/management-users — list teachers who have a management role
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, department, management_role AS role, status, created_at
       FROM teachers
       WHERE school_id = $1 AND management_role IS NOT NULL
       ORDER BY management_role, name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/management-users — assign a management role to a teacher
router.post('/', requireUnrestrictedAdmin, async (req, res, next) => {
  try {
    const { teacher_id, role, allowed_modules } = req.body;
    if (!teacher_id || !role)
      return res.status(400).json({ error: 'teacher_id and role are required' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Role must be principal or vice_principal' });

    const { rows: existing } = await pool.query(
      `SELECT id, management_role FROM teachers WHERE id = $1 AND school_id = $2`,
      [teacher_id, req.schoolId]
    );
    if (!existing.length)
      return res.status(404).json({ error: 'Teacher not found' });
    if (existing[0].management_role)
      return res.status(409).json({ error: 'This teacher already has a management role assigned' });

    if (Array.isArray(allowed_modules)) {
      const err = await insertAllowedModules(teacher_id, allowed_modules, req.schoolId, req.user.id);
      if (err) return res.status(400).json({ error: err });
    }

    const { rows } = await pool.query(
      `UPDATE teachers SET management_role = $1, is_admin = true, updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, name, teacher_code, department, management_role AS role, status`,
      [role, teacher_id, req.schoolId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/admin/management-users/:id — change role
router.put('/:id', requireUnrestrictedAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Role must be principal or vice_principal' });

    const { rows } = await pool.query(
      `UPDATE teachers SET management_role = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, name, teacher_code, department, management_role AS role, status`,
      [role, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/admin/management-users/:id — revoke management access
// (sets is_admin=false as a side effect, so this carries the same
// self-lockout risk as directly editing is_admin — block self-target.)
router.delete('/:id', requireUnrestrictedAdmin, async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(403).json({ error: 'You cannot revoke your own management access.' });
    }
    const { rowCount } = await pool.query(
      `UPDATE teachers SET management_role = NULL, is_admin = false, updated_at = now()
       WHERE id = $1 AND school_id = $2 AND management_role IS NOT NULL`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Management user not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
