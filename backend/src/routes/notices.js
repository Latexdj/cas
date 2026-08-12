const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notices (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        title       TEXT        NOT NULL,
        body        TEXT        NOT NULL,
        priority    TEXT        NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('normal', 'important', 'urgent')),
        author_id   UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        author_name TEXT        NOT NULL DEFAULT 'Admin',
        is_pinned   BOOLEAN     NOT NULL DEFAULT false,
        expires_at  DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notices_school ON notices(school_id, created_at DESC)`);
  } catch (e) {
    console.error('[notices] self-heal error:', e.message);
  }
})();

router.use(authenticate, requireActiveSubscription);

// GET / — all authenticated users: active notices for this school
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, body, priority, author_name, is_pinned,
             expires_at::text, created_at, updated_at
      FROM notices
      WHERE school_id = $1
        AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
      ORDER BY is_pinned DESC,
               CASE priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,
               created_at DESC
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /all — admin: all notices including expired
router.get('/all', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, body, priority, author_name, is_pinned,
             expires_at::text, created_at, updated_at
      FROM notices
      WHERE school_id = $1
      ORDER BY is_pinned DESC,
               CASE priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,
               created_at DESC
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — admin only: create notice
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { title, body, priority = 'normal', is_pinned = false, expires_at } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!body?.trim())  return res.status(400).json({ error: 'Body is required.' });
    if (!['normal','important','urgent'].includes(priority))
      return res.status(400).json({ error: 'priority must be normal, important, or urgent.' });

    const authorId   = req.user?.id   ?? null;
    const authorName = req.user?.name ?? 'Admin';

    const { rows } = await pool.query(`
      INSERT INTO notices (school_id, title, body, priority, author_id, author_name, is_pinned, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, title, body, priority, author_name, is_pinned, expires_at::text, created_at, updated_at
    `, [req.schoolId, title.trim(), body.trim(), priority, authorId, authorName,
        is_pinned, expires_at || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /:id — admin only: update notice
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { title, body, priority, is_pinned } = req.body;
    if (priority && !['normal','important','urgent'].includes(priority))
      return res.status(400).json({ error: 'priority must be normal, important, or urgent.' });

    const sets   = ['updated_at = now()'];
    const params = [];
    let p = 1;
    if (title     !== undefined) { sets.push(`title     = $${p++}`); params.push(title?.trim() || null); }
    if (body      !== undefined) { sets.push(`body      = $${p++}`); params.push(body?.trim()  || null); }
    if (priority  !== undefined) { sets.push(`priority  = $${p++}`); params.push(priority); }
    if (is_pinned !== undefined) { sets.push(`is_pinned = $${p++}`); params.push(is_pinned); }
    if ('expires_at' in req.body) { sets.push(`expires_at = $${p++}`); params.push(req.body.expires_at || null); }

    params.push(req.params.id, req.schoolId);
    const { rows } = await pool.query(`
      UPDATE notices SET ${sets.join(', ')}
      WHERE id = $${p++} AND school_id = $${p}
      RETURNING id, title, body, priority, author_name, is_pinned, expires_at::text, created_at, updated_at
    `, params);
    if (!rows.length) return res.status(404).json({ error: 'Notice not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id — admin only
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM notices WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Notice not found.' });
    res.json({ message: 'Notice deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
