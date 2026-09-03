const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Ensure these tables exist regardless of migration state.
// CREATE TABLE IF NOT EXISTS is a no-op when the table already exists.
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roll_calls (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_year_id UUID        REFERENCES academic_years(id) ON DELETE SET NULL,
      semester         SMALLINT,
      date             DATE        NOT NULL DEFAULT CURRENT_DATE,
      title            TEXT,
      location         TEXT,
      conducted_by     UUID        REFERENCES teachers(id) ON DELETE SET NULL,
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_roll_calls_school ON roll_calls(school_id, date DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roll_call_entries (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      roll_call_id UUID        NOT NULL REFERENCES roll_calls(id) ON DELETE CASCADE,
      school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status       TEXT        NOT NULL DEFAULT 'Present'
                     CHECK (status IN ('Present', 'Absent', 'Break Bounds')),
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (roll_call_id, student_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_roll_call_entries_roll_call ON roll_call_entries(roll_call_id)`);
}

let tablesReady = false;
async function withTables(fn) {
  if (!tablesReady) {
    await ensureTables();
    tablesReady = true;
  }
  return fn();
}

async function getCurrentYearSem(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
    [schoolId]
  );
  return { yearId: rows[0]?.id || null, sem: rows[0]?.current_semester || null };
}

/** GET /api/roll-call */
router.get('/', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      const { rows } = await pool.query(
        `SELECT rc.*,
                t.surname || ' ' || t.other_names AS conducted_by_name,
                COUNT(e.id)::int AS total_entries,
                SUM(CASE WHEN e.status = 'Present' THEN 1 ELSE 0 END)::int AS present_count,
                SUM(CASE WHEN e.status = 'Absent' THEN 1 ELSE 0 END)::int AS absent_count,
                SUM(CASE WHEN e.status = 'Break Bounds' THEN 1 ELSE 0 END)::int AS break_bounds_count
         FROM roll_calls rc
         LEFT JOIN teachers t ON t.id = rc.conducted_by
         LEFT JOIN roll_call_entries e ON e.roll_call_id = rc.id
         WHERE rc.school_id = $1
           AND (rc.academic_year_id = $2 OR $2 IS NULL)
           AND (rc.semester = $3 OR $3 IS NULL)
         GROUP BY rc.id, t.surname, t.other_names
         ORDER BY rc.date DESC, rc.created_at DESC`,
        [req.schoolId, yearId, sem]
      );
      res.json({ roll_calls: rows });
    });
  } catch (err) { next(err); }
});

/** POST /api/roll-call */
router.post('/', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { title, location, notes, date } = req.body;
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      const { rows } = await pool.query(
        `INSERT INTO roll_calls (school_id, academic_year_id, semester, date, title, location, conducted_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [req.schoolId, yearId, sem, date || new Date().toISOString().slice(0, 10),
         title || null, location || null, req.user.id, notes || null]
      );
      res.status(201).json({ roll_call: rows[0] });
    });
  } catch (err) {
    console.error('[roll-call POST] code=%s msg=%s', err.code, err.message);
    next(err);
  }
});

/** GET /api/roll-call/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: rcRows } = await pool.query(
      `SELECT rc.*, t.surname || ' ' || t.other_names AS conducted_by_name
       FROM roll_calls rc
       LEFT JOIN teachers t ON t.id = rc.conducted_by
       WHERE rc.id = $1 AND rc.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rcRows.length) return res.status(404).json({ error: 'Roll call not found' });
    const { rows: entries } = await pool.query(
      `SELECT e.id, e.status, e.notes,
              s.id AS student_id, s.name AS student_name, s.student_code, s.class_name, s.house
       FROM roll_call_entries e
       JOIN students s ON s.id = e.student_id
       WHERE e.roll_call_id = $1
       ORDER BY s.class_name, s.name`,
      [req.params.id]
    );
    res.json({ roll_call: rcRows[0], entries });
  } catch (err) { next(err); }
});

/** PUT /api/roll-call/:id/entries — bulk upsert student statuses */
router.put('/:id/entries', async (req, res, next) => {
  try {
    const { entries } = req.body; // [{ student_id, status, notes }]
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'entries[] required' });
    }
    const { rows: rcCheck } = await pool.query(
      `SELECT id FROM roll_calls WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rcCheck.length) return res.status(404).json({ error: 'Roll call not found' });

    const validStatuses = new Set(['Present', 'Absent', 'Break Bounds']);
    const vals = entries.map((_, i) => {
      const b = i * 4;
      return `($${b+1},$${b+2},$${b+3},$${b+4})`;
    });
    const params = entries.flatMap(e => [
      req.params.id, req.schoolId, e.student_id,
      validStatuses.has(e.status) ? e.status : 'Present'
    ]);
    await pool.query(
      `INSERT INTO roll_call_entries (roll_call_id, school_id, student_id, status)
       VALUES ${vals.join(',')}
       ON CONFLICT (roll_call_id, student_id) DO UPDATE
         SET status = EXCLUDED.status`,
      params
    );
    // Update notes separately (optional, only when provided)
    for (const e of entries) {
      if (e.notes !== undefined) {
        await pool.query(
          `UPDATE roll_call_entries SET notes = $1 WHERE roll_call_id = $2 AND student_id = $3`,
          [e.notes || null, req.params.id, e.student_id]
        );
      }
    }
    res.json({ updated: entries.length });
  } catch (err) { next(err); }
});

/** DELETE /api/roll-call/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM roll_calls WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Roll call not found' });
    res.json({ deleted: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
