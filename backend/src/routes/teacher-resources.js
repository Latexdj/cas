'use strict';
// Teacher Resources: the Subject App launcher (Playlab AI apps).
//
// Two kinds of link live in subject_app_links:
//   school_id IS NULL  shared list, managed by the super admin, seen by every school
//   school_id = X      a school's own additions, managed by that school's admins
// A school can hide a shared link (subject_app_hidden) without affecting others.

const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, superAdminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');

router.use(authenticate, requireActiveSubscription);

const MODULE = checkModuleAccess('teacher_resources');
const ALLOWED_HOSTS = ['playlab.ai', 'www.playlab.ai'];

// https only, on playlab.ai. Returns the cleaned URL or null.
function cleanUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch { return null; }
}

function cleanText(v, max = 120) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
}

// Validates a body for create/update. Returns { error } or { value }.
function readBody(body) {
  const group_label = cleanText(body.group_label, 80);
  const subject     = cleanText(body.subject, 120);
  const url         = cleanUrl(body.url);
  if (!group_label) return { error: 'Form or curriculum is required.' };
  if (!subject)     return { error: 'Subject is required.' };
  if (!url)         return { error: 'The link must be an https link on playlab.ai.' };
  return { value: { group_label, subject, url } };
}

// A group keeps its existing position; a new group goes last.
async function groupOrder(schoolId, label) {
  const { rows } = await pool.query(
    `SELECT MIN(group_sort_order) AS existing,
            (SELECT COALESCE(MAX(group_sort_order), 0) + 1 FROM subject_app_links
              WHERE school_id IS NULL OR school_id IS NOT DISTINCT FROM $1) AS next
       FROM subject_app_links
      WHERE (school_id IS NULL OR school_id IS NOT DISTINCT FROM $1) AND LOWER(group_label) = LOWER($2)`,
    [schoolId, label]
  );
  return rows[0].existing ?? rows[0].next;
}

const duplicate = err => err.code === '23505';

// ── Teacher ──────────────────────────────────────────────────────────────────

// GET /api/teacher-resources/subject-apps
// Active apps for this school: shared (not hidden here) plus the school's own.
router.get('/subject-apps', MODULE, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.group_label, l.subject, l.url,
              MIN(l.group_sort_order) OVER (PARTITION BY LOWER(l.group_label)) AS group_sort_order
         FROM subject_app_links l
        WHERE l.is_active
          AND (l.school_id = $1 OR (l.school_id IS NULL AND NOT EXISTS (
                SELECT 1 FROM subject_app_hidden h WHERE h.school_id = $1 AND h.link_id = l.id)))
        ORDER BY group_sort_order, LOWER(l.group_label), LOWER(l.subject)`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/teacher-resources/subject-apps/:id/launch: records a launch.
router.post('/subject-apps/:id/launch', MODULE, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO subject_app_launches (school_id, link_id, teacher_id)
       SELECT $1, l.id, $3 FROM subject_app_links l
        WHERE l.id = $2 AND l.is_active
          AND (l.school_id = $1 OR (l.school_id IS NULL AND NOT EXISTS (
                SELECT 1 FROM subject_app_hidden h WHERE h.school_id = $1 AND h.link_id = l.id)))`,
      [req.schoolId, req.params.id, req.user.role === 'teacher' || req.user.role === 'admin' ? req.user.id : null]
    );
    if (!rowCount) return res.status(404).json({ error: 'This app is no longer available.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── School admin ─────────────────────────────────────────────────────────────

// GET /api/teacher-resources/admin/subject-apps
router.get('/admin/subject-apps', adminOnly, MODULE, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.group_label, l.subject, l.url, l.is_active,
              CASE WHEN l.school_id IS NULL THEN 'shared' ELSE 'school' END AS scope,
              EXISTS (SELECT 1 FROM subject_app_hidden h WHERE h.school_id = $1 AND h.link_id = l.id) AS hidden,
              (SELECT COUNT(*)::int FROM subject_app_launches x WHERE x.school_id = $1 AND x.link_id = l.id) AS launches,
              MIN(l.group_sort_order) OVER (PARTITION BY LOWER(l.group_label)) AS group_sort_order
         FROM subject_app_links l
        WHERE l.school_id = $1 OR (l.school_id IS NULL AND l.is_active)
        ORDER BY group_sort_order, LOWER(l.group_label), LOWER(l.subject)`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/admin/subject-apps', adminOnly, MODULE, async (req, res, next) => {
  try {
    const b = readBody(req.body);
    if (b.error) return res.status(400).json({ error: b.error });
    const order = await groupOrder(req.schoolId, b.value.group_label);
    const { rows } = await pool.query(
      `INSERT INTO subject_app_links (school_id, group_label, group_sort_order, subject, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.schoolId, b.value.group_label, order, b.value.subject, b.value.url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ error: 'That subject is already listed under this form.' });
    next(err);
  }
});

router.put('/admin/subject-apps/:id', adminOnly, MODULE, async (req, res, next) => {
  try {
    const b = readBody(req.body);
    if (b.error) return res.status(400).json({ error: b.error });
    const order = await groupOrder(req.schoolId, b.value.group_label);
    const { rowCount } = await pool.query(
      `UPDATE subject_app_links SET group_label = $3, group_sort_order = $4, subject = $5, url = $6, updated_at = now()
        WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId, b.value.group_label, order, b.value.subject, b.value.url]
    );
    if (!rowCount) return res.status(404).json({ error: 'Only your school\'s own apps can be edited.' });
    res.json({ ok: true });
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ error: 'That subject is already listed under this form.' });
    next(err);
  }
});

// PATCH { is_active } for the school's own apps; { hidden } for shared apps.
router.patch('/admin/subject-apps/:id', adminOnly, MODULE, async (req, res, next) => {
  try {
    if (typeof req.body.is_active === 'boolean') {
      const { rowCount } = await pool.query(
        `UPDATE subject_app_links SET is_active = $3, updated_at = now() WHERE id = $1 AND school_id = $2`,
        [req.params.id, req.schoolId, req.body.is_active]
      );
      if (!rowCount) return res.status(404).json({ error: 'Only your school\'s own apps can be turned off. Hide a shared app instead.' });
      return res.json({ ok: true });
    }
    if (typeof req.body.hidden === 'boolean') {
      const { rows } = await pool.query(`SELECT 1 FROM subject_app_links WHERE id = $1 AND school_id IS NULL`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Only shared apps can be hidden.' });
      await pool.query(
        req.body.hidden
          ? `INSERT INTO subject_app_hidden (school_id, link_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`
          : `DELETE FROM subject_app_hidden WHERE school_id = $1 AND link_id = $2`,
        [req.schoolId, req.params.id]
      );
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Send is_active or hidden.' });
  } catch (err) { next(err); }
});

router.delete('/admin/subject-apps/:id', adminOnly, MODULE, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM subject_app_links WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
    if (!rowCount) return res.status(404).json({ error: 'Only your school\'s own apps can be deleted.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Super admin: the shared list ─────────────────────────────────────────────

router.get('/shared/subject-apps', superAdminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.group_label, l.group_sort_order, l.subject, l.url, l.is_active,
              (SELECT COUNT(*)::int FROM subject_app_launches x WHERE x.link_id = l.id) AS launches,
              (SELECT COUNT(DISTINCT x.school_id)::int FROM subject_app_launches x WHERE x.link_id = l.id) AS schools
         FROM subject_app_links l WHERE l.school_id IS NULL
        ORDER BY l.group_sort_order, LOWER(l.group_label), LOWER(l.subject)`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/shared/subject-apps', superAdminOnly, async (req, res, next) => {
  try {
    const b = readBody(req.body);
    if (b.error) return res.status(400).json({ error: b.error });
    const order = await groupOrder(null, b.value.group_label);
    const { rows } = await pool.query(
      `INSERT INTO subject_app_links (school_id, group_label, group_sort_order, subject, url)
       VALUES (NULL, $1, $2, $3, $4) RETURNING id`,
      [b.value.group_label, order, b.value.subject, b.value.url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ error: 'That subject is already listed under this form.' });
    next(err);
  }
});

router.put('/shared/subject-apps/:id', superAdminOnly, async (req, res, next) => {
  try {
    const b = readBody(req.body);
    if (b.error) return res.status(400).json({ error: b.error });
    const order = await groupOrder(null, b.value.group_label);
    const { rowCount } = await pool.query(
      `UPDATE subject_app_links SET group_label = $2, group_sort_order = $3, subject = $4, url = $5, updated_at = now()
        WHERE id = $1 AND school_id IS NULL`,
      [req.params.id, b.value.group_label, order, b.value.subject, b.value.url]
    );
    if (!rowCount) return res.status(404).json({ error: 'App not found.' });
    res.json({ ok: true });
  } catch (err) {
    if (duplicate(err)) return res.status(409).json({ error: 'That subject is already listed under this form.' });
    next(err);
  }
});

router.patch('/shared/subject-apps/:id', superAdminOnly, async (req, res, next) => {
  try {
    if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'Send is_active.' });
    const { rowCount } = await pool.query(
      `UPDATE subject_app_links SET is_active = $2, updated_at = now() WHERE id = $1 AND school_id IS NULL`,
      [req.params.id, req.body.is_active]
    );
    if (!rowCount) return res.status(404).json({ error: 'App not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /shared/groups/order { labels: [...] }: the shared forms' display order.
router.patch('/shared/groups/order', superAdminOnly, async (req, res, next) => {
  try {
    const labels = Array.isArray(req.body.labels) ? req.body.labels.map(l => String(l)) : [];
    if (!labels.length) return res.status(400).json({ error: 'Send labels in order.' });
    for (let i = 0; i < labels.length; i++) {
      await pool.query(
        `UPDATE subject_app_links SET group_sort_order = $2 WHERE school_id IS NULL AND LOWER(group_label) = LOWER($1)`,
        [labels[i], i + 1]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.cleanUrl = cleanUrl;
