'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { requireUnrestrictedAdmin, clearAdminModuleCache } = require('../middleware/moduleAccess');
const { getEnabledModules, getAdminAllowedModules, LICENSABLE_MODULE_KEYS, MODULE_REGISTRY } = require('../services/modules.service');

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/admin-module-access/school-modules — the school's own licensable
// modules (key + label), for populating a "restrict to these modules"
// checklist. Declared before the /:teacherId param route so "school-modules"
// isn't swallowed as a teacherId.
router.get('/school-modules', async (req, res, next) => {
  try {
    const enabled = await getEnabledModules(req.schoolId);
    const modules = MODULE_REGISTRY
      .filter(m => LICENSABLE_MODULE_KEYS.includes(m.key) && enabled.includes(m.key))
      .map(m => ({ key: m.key, label: m.label }));
    res.json(modules);
  } catch (err) { next(err); }
});

// GET /api/admin-module-access/:teacherId — { restricted, modules } for a
// target admin in the caller's own school. Any admin may view this (not just
// unrestricted ones) — it's read-only, matching the school-wide module list
// already being universally readable.
router.get('/:teacherId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, is_admin FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.teacherId, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });

    const allowed = await getAdminAllowedModules(req.params.teacherId);
    res.json({ restricted: allowed !== null, modules: allowed ?? [] });
  } catch (err) { next(err); }
});

// PUT /api/admin-module-access/:teacherId — body { modules: string[] | null }
// null (or omitted) removes all rows = unrestricted. Only an unrestricted
// admin may call this, and never on their own account (self-edit block —
// prevents accidental self-lockout of the only/primary admin).
router.put('/:teacherId', requireUnrestrictedAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (String(req.params.teacherId) === String(req.user.id)) {
      return res.status(403).json({ error: 'You cannot edit your own module access.' });
    }

    const { rows: targetRows } = await pool.query(
      `SELECT id, is_admin FROM teachers WHERE id = $1 AND school_id = $2`,
      [req.params.teacherId, req.schoolId]
    );
    if (!targetRows.length) return res.status(404).json({ error: 'Teacher not found' });
    if (!targetRows[0].is_admin) {
      return res.status(400).json({ error: 'Module access only applies to admin accounts.' });
    }

    const modules = req.body.modules;
    if (modules !== null && !Array.isArray(modules)) {
      return res.status(400).json({ error: 'modules must be an array of module keys, or null for unrestricted' });
    }

    if (Array.isArray(modules)) {
      const schoolLicensed = await getEnabledModules(req.schoolId);
      const invalid = modules.filter(k => !schoolLicensed.includes(k) || !LICENSABLE_MODULE_KEYS.includes(k));
      if (invalid.length) {
        return res.status(400).json({ error: `Not licensed to this school: ${invalid.join(', ')}` });
      }
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM admin_module_access WHERE teacher_id = $1`, [req.params.teacherId]);
    if (Array.isArray(modules)) {
      for (const moduleKey of modules) {
        await client.query(
          `INSERT INTO admin_module_access (teacher_id, module_key, granted_by) VALUES ($1,$2,$3)`,
          [req.params.teacherId, moduleKey, req.user.id]
        );
      }
    }
    await client.query('COMMIT');

    clearAdminModuleCache(req.params.teacherId);
    res.json({ restricted: Array.isArray(modules), modules: modules ?? [] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
