const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semester_config (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_year_id UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      semester         SMALLINT    NOT NULL CHECK (semester IN (1, 2)),
      resumption_date  DATE,
      max_days_home    SMALLINT    NOT NULL DEFAULT 7,
      is_open          BOOLEAN     NOT NULL DEFAULT false,
      created_by       UUID        REFERENCES teachers(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (school_id, academic_year_id, semester)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_arrivals (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id       UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_year_id UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      semester         SMALLINT    NOT NULL CHECK (semester IN (1, 2)),
      arrival_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
      recorded_by      UUID        REFERENCES teachers(id) ON DELETE SET NULL,
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (school_id, student_id, academic_year_id, semester)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_student_arrivals_school ON student_arrivals(school_id, academic_year_id, semester)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_student_arrivals_student ON student_arrivals(student_id)`);
  // Add columns that may be missing if the table was created by an earlier migration without them
  await pool.query(`ALTER TABLE student_arrivals ADD COLUMN IF NOT EXISTS notes TEXT`);
  // resumption_flags has an optional FK to student_attendance_sessions which may not exist â€”
  // try with it first, fall back to without if the referenced table doesn't exist.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumption_flags (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id UUID        REFERENCES academic_years(id) ON DELETE SET NULL,
        semester         SMALLINT,
        session_id       UUID        REFERENCES student_attendance_sessions(id) ON DELETE SET NULL,
        flagged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        flagged_by       UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        resolved_at      TIMESTAMPTZ,
        resolved_by      UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        resolution_note  TEXT,
        UNIQUE (school_id, student_id, academic_year_id, semester)
      )
    `);
  } catch {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumption_flags (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id UUID        REFERENCES academic_years(id) ON DELETE SET NULL,
        semester         SMALLINT,
        session_id       UUID,
        flagged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        flagged_by       UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        resolved_at      TIMESTAMPTZ,
        resolved_by      UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        resolution_note  TEXT,
        UNIQUE (school_id, student_id, academic_year_id, semester)
      )
    `);
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resumption_flags_school ON resumption_flags(school_id, resolved_at)`);
}

let tablesReady = false;
async function withTables(fn) {
  if (!tablesReady) {
    await ensureTables();
    tablesReady = true;
  }
  return fn();
}

// Helper: get current year/semester for a school
async function getCurrentYearSem(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return { yearId: rows[0]?.id || null, sem: rows[0]?.current_semester || null };
}

/** GET /api/resumption/config */
router.get('/config', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId) return res.json({ config: null });
      const { rows } = await pool.query(
        `SELECT sc.*, t.name AS created_by_name
         FROM semester_config sc
         LEFT JOIN teachers t ON t.id = sc.created_by
         WHERE sc.school_id = $1 AND sc.academic_year_id = $2 AND sc.semester = $3`,
        [req.schoolId, yearId, sem]
      );
      res.json({ config: rows[0] || null, yearId, sem });
    });
  } catch (err) { next(err); }
});

/** POST /api/resumption/config */
router.post('/config', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { resumption_date, max_days_home, is_open } = req.body;
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId || !sem) return res.status(400).json({ error: 'No active academic year' });

      const { rows } = await pool.query(
        `INSERT INTO semester_config (school_id, academic_year_id, semester, resumption_date, max_days_home, is_open, created_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (school_id, academic_year_id, semester) DO UPDATE
           SET resumption_date = EXCLUDED.resumption_date,
               max_days_home   = EXCLUDED.max_days_home,
               is_open         = EXCLUDED.is_open,
               updated_at      = now()
         RETURNING *`,
        [req.schoolId, yearId, sem, resumption_date || null, max_days_home ?? 7, is_open ?? false, req.user.id]
      );
      res.json({ config: rows[0] });
    });
  } catch (err) {
    console.error('[resumption/config POST] code=%s msg=%s', err.code, err.message);
    next(err);
  }
});

/** GET /api/resumption/arrivals */
router.get('/arrivals', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId) return res.json({ arrivals: [], _debug: 'no_active_year' });

      // Step 1: raw count â€” tells us if records exist regardless of JOIN issues
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM student_arrivals
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3`,
        [req.schoolId, yearId, sem]
      );
      const rawCount = countRows[0]?.total ?? 0;

      const { class_name, house, search } = req.query;
      let q = `
        SELECT a.id, a.arrival_date, a.notes, a.created_at,
               s.id AS student_id, s.name AS student_name, s.student_code,
               s.class_name, s.house, s.residential_status,
               t.name AS recorded_by_name
        FROM student_arrivals a
        JOIN students s ON s.id = a.student_id
        LEFT JOIN teachers t ON t.id = a.recorded_by
        WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
      `;
      const params = [req.schoolId, yearId, sem];
      if (class_name) { params.push(class_name); q += ` AND s.class_name = $${params.length}`; }
      if (house)      { params.push(house);       q += ` AND s.house = $${params.length}`; }
      if (search)     { params.push(`%${search}%`); q += ` AND (s.name ILIKE $${params.length} OR s.student_code ILIKE $${params.length})`; }
      q += ` ORDER BY a.arrival_date DESC, s.name`;

      try {
        const { rows } = await pool.query(q, params);
        res.json({ arrivals: rows, _rawCount: rawCount });
      } catch (joinErr) {
        // Full JOIN query failed â€” return raw count so frontend can show a meaningful error
        console.error('[arrivals GET] join query failed code=%s msg=%s', joinErr.code, joinErr.message);
        res.json({
          arrivals: [],
          _rawCount: rawCount,
          _error: joinErr.message,
          _code: joinErr.code,
        });
      }
    });
  } catch (err) {
    console.error('[arrivals GET] withTables error code=%s msg=%s', err.code, err.message);
    next(err);
  }
});

/** POST /api/resumption/arrivals â€” bulk-friendly: accepts array of student_ids */
router.post('/arrivals', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { student_ids, arrival_date } = req.body;
      if (!Array.isArray(student_ids) || !student_ids.length) {
        return res.status(400).json({ error: 'student_ids[] required' });
      }
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId || !sem) return res.status(400).json({ error: 'No active academic year' });
      const date = arrival_date || new Date().toISOString().slice(0, 10);

      const vals = student_ids.map((_, i) => {
        const b = i * 6;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`;
      });
      const params = student_ids.flatMap(id => [req.schoolId, id, yearId, sem, date, req.user.id]);
      const { rows } = await pool.query(
        `INSERT INTO student_arrivals (school_id, student_id, academic_year_id, semester, arrival_date, recorded_by)
         VALUES ${vals.join(',')}
         ON CONFLICT (school_id, student_id, academic_year_id, semester) DO UPDATE
           SET arrival_date = EXCLUDED.arrival_date, recorded_by = EXCLUDED.recorded_by
         RETURNING id, student_id, arrival_date`,
        params
      );
      // Clear any resumption flags for these students
      await pool.query(
        `UPDATE resumption_flags SET resolved_at = now(), resolved_by = $1, resolution_note = 'Auto-resolved on arrival record'
         WHERE school_id = $2 AND student_id = ANY($3::uuid[]) AND academic_year_id = $4 AND semester = $5
           AND resolved_at IS NULL`,
        [req.user.id, req.schoolId, student_ids, yearId, sem]
      );
      res.status(201).json({ created: rows.length, arrivals: rows });
    });
  } catch (err) { next(err); }
});

/** DELETE /api/resumption/arrivals/:id */
router.delete('/arrivals/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM student_arrivals WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: rows[0].id });
  } catch (err) { next(err); }
});

/** GET /api/resumption/missing â€” boarding students with no arrival record */
router.get('/missing', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId) return res.json({ students: [] });
      const { class_name, house } = req.query;
      let q = `
        SELECT s.id, s.name AS student_name, s.student_code,
               s.class_name, s.house, s.residential_status
        FROM students s
        WHERE s.school_id = $1 AND s.status = 'Active'
          AND s.residential_status = 'Boarding'
          AND NOT EXISTS (
            SELECT 1 FROM student_arrivals a
            WHERE a.student_id = s.id AND a.school_id = $1
              AND a.academic_year_id = $2 AND a.semester = $3
          )
      `;
      const params = [req.schoolId, yearId, sem];
      if (class_name) { params.push(class_name); q += ` AND s.class_name = $${params.length}`; }
      if (house)      { params.push(house);       q += ` AND s.house = $${params.length}`; }
      q += ` ORDER BY s.class_name, s.name`;
      const { rows } = await pool.query(q, params);
      res.json({ students: rows, yearId, sem });
    });
  } catch (err) { next(err); }
});

/** GET /api/resumption/kitchen-count */
router.get('/kitchen-count', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId) return res.json({ total: 0, by_class: [] });
      const { rows: total } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM student_arrivals
         WHERE school_id = $1 AND academic_year_id = $2 AND semester = $3`,
        [req.schoolId, yearId, sem]
      );
      const { rows: by_class } = await pool.query(
        `SELECT s.class_name, COUNT(*)::int AS count
         FROM student_arrivals a JOIN students s ON s.id = a.student_id
         WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
         GROUP BY s.class_name ORDER BY s.class_name`,
        [req.schoolId, yearId, sem]
      );
      res.json({ total: total[0].total, by_class });
    });
  } catch (err) { next(err); }
});

/** GET /api/resumption/flags */
router.get('/flags', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { yearId, sem } = await getCurrentYearSem(req.schoolId);
      if (!yearId) return res.json({ flags: [] });
      const { resolved } = req.query;
      let q = `
        SELECT f.id, f.flagged_at, f.resolved_at, f.resolution_note,
               s.id AS student_id, s.name AS student_name, s.student_code, s.class_name, s.house,
               t.name AS flagged_by_name,
               r.name AS resolved_by_name,
               sas.subject, sas.date AS session_date
        FROM resumption_flags f
        JOIN students s ON s.id = f.student_id
        LEFT JOIN teachers t ON t.id = f.flagged_by
        LEFT JOIN teachers r ON r.id = f.resolved_by
        LEFT JOIN student_attendance_sessions sas ON sas.id = f.session_id
        WHERE f.school_id = $1 AND f.academic_year_id = $2 AND f.semester = $3
      `;
      const params = [req.schoolId, yearId, sem];
      if (resolved === 'false' || resolved === undefined) {
        q += ` AND f.resolved_at IS NULL`;
      } else if (resolved === 'true') {
        q += ` AND f.resolved_at IS NOT NULL`;
      }
      q += ` ORDER BY f.flagged_at DESC`;
      const { rows } = await pool.query(q, params);
      res.json({ flags: rows });
    });
  } catch (err) { next(err); }
});

/** POST /api/resumption/flags/:id/resolve */
router.post('/flags/:id/resolve', async (req, res, next) => {
  try {
    await withTables(async () => {
      const { resolution_note } = req.body;
      const { rows } = await pool.query(
        `UPDATE resumption_flags SET resolved_at = now(), resolved_by = $1, resolution_note = $2
         WHERE id = $3 AND school_id = $4 AND resolved_at IS NULL
         RETURNING id`,
        [req.user.id, resolution_note || null, req.params.id, req.schoolId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Flag not found or already resolved' });
      res.json({ resolved: rows[0].id });
    });
  } catch (err) { next(err); }
});

module.exports = router;

