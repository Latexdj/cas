const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { buildScopeFilterSql } = require('../services/eventScope.service');

const VALID_SCOPE_TYPES = ['school', 'department', 'class_level', 'classes'];

// Matches the "HH:MM–HH:MM" (or "HH:MM:SS–HH:MM:SS") format absences.scheduled_period
// is stored in — see absenceCheck.js's `${lesson.start_time}–${lesson.end_time}`.
const PERIOD_RE = /^(\d{2}:\d{2})(?::\d{2})?[–-](\d{2}:\d{2})(?::\d{2})?$/;
function timeToMinutes(t) {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

// Retroactively flips matching 'Absent' auto-generated records to 'Excused' for
// one calendar event's scope on `date`. For a whole-day event, every scoped
// absence that day is excused. For a partial-day event, only absences whose
// OWN lesson period (parsed from scheduled_period) overlaps the event's window
// are excused — not "this teacher has some overlapping slot somewhere in their
// weekly timetable," which previously over-excused unrelated lessons on the
// same day because it never checked the specific absence's own time.
async function excuseScopedAbsences(schoolId, date, scope, startTime, endTime) {
  const params = [schoolId, date];
  const scopeSql = buildScopeFilterSql(scope, 'absences', params);

  if (!startTime || !endTime) {
    const { rowCount } = await pool.query(
      `UPDATE absences SET status = 'Excused', excused_via = 'school_event', updated_at = now()
       WHERE school_id = $1 AND date = $2
         AND is_auto_generated = true AND status = 'Absent'${scopeSql}`,
      params
    );
    return rowCount;
  }

  const { rows: candidates } = await pool.query(
    `SELECT id, scheduled_period FROM absences
     WHERE school_id = $1 AND date = $2
       AND is_auto_generated = true AND status = 'Absent'${scopeSql}`,
    params
  );
  const winFrom = timeToMinutes(startTime);
  const winTo   = timeToMinutes(endTime);
  const toExcuse = candidates.filter(c => {
    const m = PERIOD_RE.exec(c.scheduled_period || '');
    if (!m) return false; // can't tell the lesson's time — leave it alone, safer default
    const lStart = timeToMinutes(m[1]);
    const lEnd   = timeToMinutes(m[2]);
    return lStart < winTo && lEnd > winFrom;
  });
  if (!toExcuse.length) return 0;

  const { rowCount } = await pool.query(
    `UPDATE absences SET status = 'Excused', excused_via = 'school_event', updated_at = now() WHERE id = ANY($1::uuid[])`,
    [toExcuse.map(c => c.id)]
  );
  return rowCount;
}

// Validates & normalizes the scope fields from a create/update body. Throws a
// string error message on invalid input — callers turn that into a 400.
function parseScope(body) {
  const scope_type = body.scope_type || 'school';
  if (!VALID_SCOPE_TYPES.includes(scope_type)) {
    throw new Error(`scope_type must be one of: ${VALID_SCOPE_TYPES.join(', ')}`);
  }
  const scope_department_id  = scope_type === 'department'  ? (body.scope_department_id || null)  : null;
  const scope_class_level_id = scope_type === 'class_level' ? (body.scope_class_level_id || null)  : null;
  const scope_class_names    = scope_type === 'classes'
    ? (Array.isArray(body.scope_class_names) ? body.scope_class_names.filter(Boolean) : null)
    : null;
  if (scope_type === 'department' && !scope_department_id) throw new Error('scope_department_id is required when scope_type is department');
  if (scope_type === 'class_level' && !scope_class_level_id) throw new Error('scope_class_level_id is required when scope_type is class_level');
  if (scope_type === 'classes' && (!scope_class_names || !scope_class_names.length)) throw new Error('scope_class_names is required when scope_type is classes');
  return { scope_type, scope_department_id, scope_class_level_id, scope_class_names };
}

// Self-heal: ensure vacation/exam periods table and kind column exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_vacation_periods (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date   DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT vp_end_after_start CHECK (end_date >= start_date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vacation_periods_school ON school_vacation_periods(school_id, start_date, end_date)`);
    await pool.query(`ALTER TABLE school_vacation_periods ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'vacation'`);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE school_vacation_periods ADD CONSTRAINT svp_kind_check CHECK (kind IN ('vacation','exam'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    console.log('[school-calendar] DB ready');
  } catch (err) {
    console.error('[school-calendar] DB setup failed:', err.code, err.message);
  }
})();

router.use(authenticate, requireActiveSubscription);

// GET /api/school-calendar?year=2026&month=5  — all authenticated users (teachers read-only)
router.get('/', async (req, res, next) => {
  try {
    const conditions = ['sc.school_id = $1'];
    const params     = [req.schoolId];

    if (req.query.year) {
      params.push(req.query.year);
      conditions.push(`EXTRACT(YEAR FROM sc.date) = $${params.length}`);
    }
    if (req.query.month) {
      params.push(req.query.month);
      conditions.push(`EXTRACT(MONTH FROM sc.date) = $${params.length}`);
    }
    if (req.query.from) {
      params.push(req.query.from);
      conditions.push(`sc.date >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      conditions.push(`sc.date <= $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT sc.id, sc.date::text, sc.name, sc.type, sc.notes,
              sc.start_time::text AS start_time, sc.end_time::text AS end_time,
              sc.scope_type, sc.scope_department_id, sc.scope_class_level_id, sc.scope_class_names,
              d.name  AS scope_department_name,
              cl.name AS scope_class_level_name,
              sc.created_at
       FROM school_calendar sc
       LEFT JOIN departments  d  ON d.id  = sc.scope_department_id
       LEFT JOIN class_levels cl ON cl.id = sc.scope_class_level_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sc.date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/school-calendar/day-status?date=YYYY-MM-DD — today's school status
router.get('/day-status', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const { rows: calRows } = await pool.query(
      `SELECT name, type FROM school_calendar
       WHERE school_id = $1 AND date = $2 AND start_time IS NULL
       ORDER BY CASE type WHEN 'Holiday' THEN 1 WHEN 'Closed Day' THEN 2 ELSE 3 END LIMIT 1`,
      [req.schoolId, date]
    );
    if (calRows.length) {
      const t = calRows[0].type;
      const status = t === 'Holiday' ? 'holiday' : t === 'Closed Day' ? 'closed' : 'event';
      return res.json({ status, label: calRows[0].name, type: t });
    }
    const { rows: vacRows } = await pool.query(
      `SELECT name, kind FROM school_vacation_periods
       WHERE school_id = $1 AND start_date <= $2 AND end_date >= $2 LIMIT 1`,
      [req.schoolId, date]
    );
    if (vacRows.length) {
      return res.json({ status: 'vacation', label: vacRows[0].name, kind: vacRows[0].kind });
    }
    res.json({ status: 'normal', label: null });
  } catch (err) { next(err); }
});

// POST /api/school-calendar — admin only
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { date, name, type, notes, start_time, end_time } = req.body;
    const valid = ['Holiday', 'School Event', 'Closed Day'];
    if (!date || !name || !type) {
      return res.status(400).json({ error: 'date, name and type are required' });
    }
    if (!valid.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${valid.join(', ')}` });
    }
    if ((start_time && !end_time) || (!start_time && end_time)) {
      return res.status(400).json({ error: 'Provide both start_time and end_time, or neither (whole-day event)' });
    }
    if (start_time && end_time && start_time >= end_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }
    let scope;
    try { scope = parseScope(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (scope.scope_department_id) {
      const { rows: d } = await pool.query(`SELECT 1 FROM departments WHERE id = $1 AND school_id = $2`, [scope.scope_department_id, req.schoolId]);
      if (!d.length) return res.status(400).json({ error: 'Department not found' });
    }
    if (scope.scope_class_level_id) {
      const { rows: l } = await pool.query(`SELECT 1 FROM class_levels WHERE id = $1 AND school_id = $2`, [scope.scope_class_level_id, req.schoolId]);
      if (!l.length) return res.status(400).json({ error: 'Class level not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO school_calendar
         (school_id, date, name, type, notes, start_time, end_time,
          scope_type, scope_department_id, scope_class_level_id, scope_class_names)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (school_id, date, name) DO UPDATE
         SET type = EXCLUDED.type, notes = EXCLUDED.notes,
             start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
             scope_type = EXCLUDED.scope_type, scope_department_id = EXCLUDED.scope_department_id,
             scope_class_level_id = EXCLUDED.scope_class_level_id, scope_class_names = EXCLUDED.scope_class_names
       RETURNING id, date::text AS date, name, type, notes,
                 start_time::text AS start_time, end_time::text AS end_time,
                 scope_type, scope_department_id, scope_class_level_id, scope_class_names, created_at`,
      [req.schoolId, date, name.trim(), type, notes || null, start_time || null, end_time || null,
       scope.scope_type, scope.scope_department_id, scope.scope_class_level_id, scope.scope_class_names]
    );

    // Retroactively clear auto-generated absences already recorded for this event,
    // narrowed to the event's scope (department / year-batch / selected classes)
    // and, for a partial-day event, to absences whose own lesson period overlaps
    // the event's time window.
    const rowCount = await excuseScopedAbsences(req.schoolId, date, scope, start_time, end_time);
    if (rowCount > 0) {
      console.log(`[Calendar] Retroactively excused ${rowCount} absence(s) on ${date} for school ${req.schoolId} (${type}: ${name})`);
    }

    res.status(201).json({ ...rows[0], absences_excused: rowCount });
  } catch (err) { next(err); }
});

// POST /api/school-calendar/:id/reapply — re-run retroactive absence clearing for an existing event
router.post('/:id/reapply', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT date::text AS date, name, type, start_time::text AS start_time, end_time::text AS end_time,
              scope_type, scope_department_id, scope_class_level_id, scope_class_names
       FROM school_calendar WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    const { date, name, type, start_time, end_time, ...scope } = rows[0];

    const rowCount = await excuseScopedAbsences(req.schoolId, date, scope, start_time, end_time);

    console.log(`[Calendar] Reapply: excused ${rowCount} absence(s) on ${date} (${type}: ${name})`);
    res.json({ date, name, absences_excused: rowCount });
  } catch (err) { next(err); }
});

// ── Vacation periods ──────────────────────────────────────────────────────────

// GET /api/school-calendar/vacations?year=YYYY&kind=vacation|exam
router.get('/vacations', async (req, res, next) => {
  try {
    const { year, kind } = req.query;
    const params = [req.schoolId];
    const conds  = ['school_id = $1'];
    if (year) {
      params.push(year);
      conds.push(`(EXTRACT(YEAR FROM start_date) = $${params.length} OR EXTRACT(YEAR FROM end_date) = $${params.length})`);
    }
    if (kind) {
      params.push(kind);
      conds.push(`kind = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT id, name, kind, start_date::text AS start_date, end_date::text AS end_date, created_at
       FROM school_vacation_periods WHERE ${conds.join(' AND ')}
       ORDER BY start_date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/school-calendar/vacations — admin only; retroactively excuses absences in range
router.post('/vacations', adminOnly, async (req, res, next) => {
  try {
    const { name, start_date, end_date, kind = 'vacation' } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, start_date and end_date are required' });
    }
    if (!['vacation', 'exam'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be vacation or exam' });
    }
    if (end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }
    const { rows } = await pool.query(
      `INSERT INTO school_vacation_periods (school_id, name, kind, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, kind, start_date::text AS start_date, end_date::text AS end_date, created_at`,
      [req.schoolId, name.trim(), kind, start_date, end_date]
    );
    // Retroactively excuse any auto-generated absences within this period
    const { rowCount } = await pool.query(
      `UPDATE absences SET status = 'Excused', excused_via = 'vacation', updated_at = now()
       WHERE school_id = $1 AND date BETWEEN $2 AND $3
         AND is_auto_generated = true AND status = 'Absent'`,
      [req.schoolId, start_date, end_date]
    );
    if (rowCount > 0) {
      console.log(`[Calendar] ${kind} period "${name}": retroactively excused ${rowCount} absence(s) for school ${req.schoolId}`);
    }
    res.status(201).json({ ...rows[0], absences_excused: rowCount });
  } catch (err) { next(err); }
});

// PUT /api/school-calendar/vacations/:id — admin only
router.put('/vacations/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }
    const { rows } = await pool.query(
      `UPDATE school_vacation_periods
       SET name       = COALESCE($1, name),
           start_date = COALESCE($2, start_date),
           end_date   = COALESCE($3, end_date)
       WHERE id = $4 AND school_id = $5
       RETURNING id, name, kind, start_date::text AS start_date, end_date::text AS end_date, created_at`,
      [name?.trim() || null, start_date || null, end_date || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Period not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/school-calendar/vacations/:id — admin only
router.delete('/vacations/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM school_vacation_periods WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Vacation period not found' });
    res.json({ message: 'Removed' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────

// PUT /api/school-calendar/:id — admin only
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { date, name, type, notes, start_time, end_time } = req.body;
    const valid = ['Holiday', 'School Event', 'Closed Day'];
    if (type && !valid.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${valid.join(', ')}` });
    }
    if ((start_time && !end_time) || (!start_time && end_time)) {
      return res.status(400).json({ error: 'Provide both start_time and end_time, or neither' });
    }
    if (start_time && end_time && start_time >= end_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }
    let scope;
    try { scope = parseScope(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (scope.scope_department_id) {
      const { rows: d } = await pool.query(`SELECT 1 FROM departments WHERE id = $1 AND school_id = $2`, [scope.scope_department_id, req.schoolId]);
      if (!d.length) return res.status(400).json({ error: 'Department not found' });
    }
    if (scope.scope_class_level_id) {
      const { rows: l } = await pool.query(`SELECT 1 FROM class_levels WHERE id = $1 AND school_id = $2`, [scope.scope_class_level_id, req.schoolId]);
      if (!l.length) return res.status(400).json({ error: 'Class level not found' });
    }
    const { rows } = await pool.query(
      `UPDATE school_calendar
       SET date       = COALESCE($1, date),
           name       = COALESCE($2, name),
           type       = COALESCE($3, type),
           notes      = $4,
           start_time = $5,
           end_time   = $6,
           scope_type = $9,
           scope_department_id = $10,
           scope_class_level_id = $11,
           scope_class_names = $12
       WHERE id = $7 AND school_id = $8
       RETURNING id, date::text AS date, name, type, notes,
                 start_time::text AS start_time, end_time::text AS end_time,
                 scope_type, scope_department_id, scope_class_level_id, scope_class_names, created_at`,
      [date || null, name?.trim() || null, type || null,
       notes ?? null, start_time || null, end_time || null,
       req.params.id, req.schoolId,
       scope.scope_type, scope.scope_department_id, scope.scope_class_level_id, scope.scope_class_names]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/school-calendar/:id — admin only
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM school_calendar WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Removed' });
  } catch (err) { next(err); }
});

module.exports = router;
