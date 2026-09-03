const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { verifyLocation } = require('../services/geo.service');
const { uploadPhoto }    = require('../services/storage.service');
const { logAudit }       = require('../services/audit.service');

// â”€â”€ Self-healing table setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Runs once at module load. If the migration missed these tables this creates
// them, and stores any failure so routes can surface the real error.
let _setupErr = null;
const _setupDone = (async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id           UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        date                DATE        NOT NULL,
        start_time          TIME        NOT NULL,
        end_time            TIME        NOT NULL,
        subject             TEXT        NOT NULL,
        class_name          TEXT        NOT NULL,
        hall_name           TEXT        NOT NULL,
        invigilators_needed SMALLINT    NOT NULL DEFAULT 2,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS semester SMALLINT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_exam_sessions_school ON exam_sessions(school_id, date)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_invigilator_pool (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id       UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id      UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        is_excluded     BOOLEAN     NOT NULL DEFAULT false,
        excluded_reason TEXT,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, teacher_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invigilation_duties (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        exam_session_id  UUID        NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        teacher_id       UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        role             TEXT        NOT NULL DEFAULT 'assistant',
        is_auto_generated BOOLEAN    NOT NULL DEFAULT false,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (exam_session_id, teacher_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invigilation_duties_session ON invigilation_duties(exam_session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invigilation_duties_teacher ON invigilation_duties(school_id, teacher_id)`);

    // Invigilator self check-in (photo + GPS)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invigilation_check_ins (
        id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id                     UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        exam_session_id               UUID        NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        teacher_id                    UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date                          DATE        NOT NULL,
        gps_coordinates               TEXT,
        photo_url                     TEXT,
        photo_size_kb                 INTEGER,
        location_verified             BOOLEAN     NOT NULL DEFAULT false,
        location_verification_message TEXT,
        notes                         TEXT,
        academic_year_id              UUID        REFERENCES academic_years(id) ON DELETE SET NULL,
        semester                      SMALLINT,
        submitted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (exam_session_id, teacher_id, date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invig_checkins_session ON invigilation_check_ins(exam_session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invig_checkins_teacher ON invigilation_check_ins(school_id, teacher_id, date)`);
    await pool.query(`ALTER TABLE invigilation_check_ins ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE invigilation_check_ins ADD COLUMN IF NOT EXISTS manually_entered_by UUID REFERENCES teachers(id) ON DELETE SET NULL`);

    // Student register per exam session
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_student_attendance (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id       UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        exam_session_id UUID        NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        status          TEXT        NOT NULL DEFAULT 'Present' CHECK (status IN ('Present','Absent')),
        submitted_by    UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        notes           TEXT,
        UNIQUE (exam_session_id, student_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_exam_student_att_session ON exam_student_attendance(exam_session_id)`);

    console.log('[exams] DB tables ready');
  } catch (err) {
    _setupErr = err;
    console.error('[exams] DB setup failed:', err.code, err.message);
  }
})();

// Returns setup error as a 503 response (caller checks this first)
function setupGuard(res) {
  if (_setupErr) {
    res.status(503).json({ error: `DB setup failed: ${_setupErr.message}`, code: _setupErr.code });
    return true;
  }
  return false;
}

router.use(authenticate, requireActiveSubscription);

// â”€â”€ Exam Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/sessions', async (req, res, next) => {
  try {
    const { from, to, academic_year_id } = req.query;
    const params = [req.schoolId];
    const conds  = ['es.school_id = $1'];
    if (from)             { params.push(from); conds.push(`es.date >= $${params.length}`); }
    if (to)               { params.push(to);   conds.push(`es.date <= $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id); conds.push(`es.academic_year_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT es.id, es.date::text, es.start_time::text, es.end_time::text,
              es.subject, es.class_name, es.hall_name, es.invigilators_needed,
              es.academic_year_id, es.semester,
              COALESCE(
                json_agg(
                  json_build_object('id', d.id, 'teacher_id', d.teacher_id,
                                    'teacher_name', t.name, 'role', d.role)
                ) FILTER (WHERE d.id IS NOT NULL), '[]'
              ) AS duties,
              (SELECT COUNT(*) FROM invigilation_check_ins ci
               WHERE ci.exam_session_id = es.id) AS check_in_count,
              (SELECT COUNT(*) FROM exam_student_attendance esa
               WHERE esa.exam_session_id = es.id) AS register_count
       FROM exam_sessions es
       LEFT JOIN invigilation_duties d ON d.exam_session_id = es.id
       LEFT JOIN teachers t            ON t.id = d.teacher_id
       WHERE ${conds.join(' AND ')}
       GROUP BY es.id
       ORDER BY es.date, es.start_time, es.hall_name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/sessions', adminOnly, async (req, res, next) => {
  try {
    const { date, start_time, end_time, subject, class_name, hall_name,
            invigilators_needed = 2, academic_year_id, semester } = req.body;
    if (!date || !start_time || !end_time || !subject || !class_name || !hall_name) {
      return res.status(400).json({ error: 'date, start_time, end_time, subject, class_name and hall_name are required' });
    }
    if (end_time <= start_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }
    const { rows } = await pool.query(
      `INSERT INTO exam_sessions
         (school_id, date, start_time, end_time, subject, class_name, hall_name,
          invigilators_needed, academic_year_id, semester)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, date::text, start_time::text, end_time::text,
                 subject, class_name, hall_name, invigilators_needed,
                 academic_year_id, semester`,
      [req.schoolId, date, start_time, end_time, subject.trim(), class_name.trim(),
       hall_name.trim(), invigilators_needed, academic_year_id || null, semester || null]
    );
    res.status(201).json({ ...rows[0], duties: [] });
  } catch (err) { next(err); }
});

// POST /api/exams/sessions/bulk â€” create one session per class in a single request
router.post('/sessions/bulk', adminOnly, async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { date, start_time, end_time, subject, academic_year_id, semester, classes } = req.body;
    if (!date || !start_time || !end_time || !subject) {
      return res.status(400).json({ error: 'date, start_time, end_time and subject are required' });
    }
    if (!Array.isArray(classes) || !classes.length) {
      return res.status(400).json({ error: 'classes array is required' });
    }
    if (end_time <= start_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    const created = [];
    for (const cls of classes) {
      const { class_name, hall_name, invigilators_needed = 2 } = cls;
      if (!class_name || !hall_name) continue;
      const { rows } = await pool.query(
        `INSERT INTO exam_sessions
           (school_id, date, start_time, end_time, subject, class_name, hall_name,
            invigilators_needed, academic_year_id, semester)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, date::text, start_time::text, end_time::text,
                   subject, class_name, hall_name, invigilators_needed,
                   academic_year_id, semester`,
        [req.schoolId, date, start_time, end_time, subject.trim(), class_name.trim(),
         hall_name.trim(), Number(invigilators_needed) || 2,
         academic_year_id || null, semester || null]
      );
      if (rows[0]) created.push({ ...rows[0], duties: [] });
    }
    res.status(201).json({ created, count: created.length });
  } catch (err) { next(err); }
});

// POST /api/exams/sessions/merge â€” combine multiple sessions into one
router.post('/sessions/merge', adminOnly, async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { session_ids } = req.body;
    if (!Array.isArray(session_ids) || session_ids.length < 2) {
      return res.status(400).json({ error: 'At least 2 session_ids are required' });
    }
    const { rows: sessions } = await pool.query(
      `SELECT id, class_name, invigilators_needed FROM exam_sessions
       WHERE school_id=$1 AND id=ANY($2::uuid[]) ORDER BY created_at`,
      [req.schoolId, session_ids]
    );
    if (sessions.length < 2) {
      return res.status(404).json({ error: 'One or more sessions not found' });
    }
    const primary  = sessions[0];
    const toMerge  = sessions.slice(1);
    const combined = sessions.map(s => s.class_name).join(', ');
    const totalInv = sessions.reduce((n, s) => n + s.invigilators_needed, 0);

    await pool.query(
      `UPDATE exam_sessions SET class_name=$1, invigilators_needed=$2 WHERE id=$3 AND school_id=$4`,
      [combined, totalInv, primary.id, req.schoolId]
    );

    for (const other of toMerge) {
      // Move non-conflicting duties to the primary session
      await pool.query(
        `UPDATE invigilation_duties SET exam_session_id=$1
         WHERE exam_session_id=$2 AND school_id=$3
           AND teacher_id NOT IN (
             SELECT teacher_id FROM invigilation_duties WHERE exam_session_id=$1 AND school_id=$3
           )`,
        [primary.id, other.id, req.schoolId]
      );
      // Deleting the session cascades remaining (conflicting) duties
      await pool.query(`DELETE FROM exam_sessions WHERE id=$1 AND school_id=$2`, [other.id, req.schoolId]);
    }

    res.json({ merged_into: primary.id, class_name: combined });
  } catch (err) { next(err); }
});

router.put('/sessions/:id', adminOnly, async (req, res, next) => {
  try {
    const { date, start_time, end_time, subject, class_name, hall_name,
            invigilators_needed, academic_year_id, semester } = req.body;
    const { rows } = await pool.query(
      `UPDATE exam_sessions
       SET date                = COALESCE($1, date),
           start_time          = COALESCE($2, start_time),
           end_time            = COALESCE($3, end_time),
           subject             = COALESCE($4, subject),
           class_name          = COALESCE($5, class_name),
           hall_name           = COALESCE($6, hall_name),
           invigilators_needed = COALESCE($7, invigilators_needed),
           academic_year_id    = COALESCE($8, academic_year_id),
           semester            = COALESCE($9, semester)
       WHERE id = $10 AND school_id = $11
       RETURNING id, date::text, start_time::text, end_time::text,
                 subject, class_name, hall_name, invigilators_needed,
                 academic_year_id, semester`,
      [date||null, start_time||null, end_time||null, subject||null, class_name||null,
       hall_name||null, invigilators_needed??null, academic_year_id??null, semester??null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/sessions/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM exam_sessions WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// â”€â”€ Invigilator Pool â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/pool', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.department,
              COALESCE(p.is_excluded, false) AS is_excluded,
              p.excluded_reason,
              p.notes,
              COUNT(d.id)::int AS duty_count
       FROM teachers t
       LEFT JOIN exam_invigilator_pool p ON p.teacher_id = t.id AND p.school_id = t.school_id
       LEFT JOIN invigilation_duties d   ON d.teacher_id = t.id AND d.school_id = t.school_id
       WHERE t.school_id = $1 AND t.status = 'Active'
       GROUP BY t.id, t.name, t.department, p.is_excluded, p.excluded_reason, p.notes
       ORDER BY t.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.put('/pool/:teacherId', adminOnly, async (req, res, next) => {
  try {
    const { is_excluded, excluded_reason, notes } = req.body;
    await pool.query(
      `INSERT INTO exam_invigilator_pool (school_id, teacher_id, is_excluded, excluded_reason, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (school_id, teacher_id) DO UPDATE
         SET is_excluded = EXCLUDED.is_excluded,
             excluded_reason = EXCLUDED.excluded_reason,
             notes = EXCLUDED.notes`,
      [req.schoolId, req.params.teacherId, is_excluded ?? false,
       excluded_reason || null, notes || null]
    );
    res.json({ message: 'Pool updated' });
  } catch (err) { next(err); }
});

// â”€â”€ Roster Generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/generate', adminOnly, async (req, res, next) => {
  try {
    const { session_ids, invigilators_per_hall = 2, exclude_subject_teachers = false } = req.body;
    if (!Array.isArray(session_ids) || !session_ids.length) {
      return res.status(400).json({ error: 'session_ids array is required' });
    }

    // Sessions to roster
    const { rows: sessions } = await pool.query(
      `SELECT id, date::text, start_time::text, end_time::text, subject, class_name, hall_name, invigilators_needed
       FROM exam_sessions WHERE school_id=$1 AND id=ANY($2::uuid[])
       ORDER BY date, start_time, hall_name`,
      [req.schoolId, session_ids]
    );

    // Eligible pool members (not excluded)
    const { rows: eligible } = await pool.query(
      `SELECT t.id, t.name
       FROM teachers t
       LEFT JOIN exam_invigilator_pool p ON p.teacher_id=t.id AND p.school_id=t.school_id
       WHERE t.school_id=$1 AND t.status='Active'
         AND COALESCE(p.is_excluded, false) = false
       ORDER BY t.name`,
      [req.schoolId]
    );

    if (!sessions.length) return res.json({ assignments: [], duty_counts: [], warnings: [] });

    const minDate = sessions[0].date;
    const maxDate = sessions[sessions.length - 1].date;

    // Teacher excuses overlapping the date range
    const { rows: excuses } = await pool.query(
      `SELECT teacher_id, date_from::text, date_to::text
       FROM teacher_excuses
       WHERE school_id=$1 AND status='Approved'
         AND date_from <= $2 AND date_to >= $3`,
      [req.schoolId, maxDate, minDate]
    );
    const excuseRanges = new Map();
    for (const e of excuses) {
      if (!excuseRanges.has(e.teacher_id)) excuseRanges.set(e.teacher_id, []);
      excuseRanges.get(e.teacher_id).push({ from: e.date_from, to: e.date_to });
    }
    function isExcused(tid, date) {
      return (excuseRanges.get(tid) ?? []).some(r => r.from <= date && r.to >= date);
    }

    // Subject-teacher associations (optional)
    const subjectTeacherSet = new Set();
    if (exclude_subject_teachers) {
      const { rows: tt } = await pool.query(
        `SELECT DISTINCT teacher_id, subject FROM timetable WHERE school_id=$1`,
        [req.schoolId]
      );
      for (const r of tt) subjectTeacherSet.add(`${r.teacher_id}:${r.subject.toLowerCase()}`);
    }

    // Generate
    const dutyCount = new Map(eligible.map(t => [t.id, 0]));
    const busySlots = new Map(); // teacher_id -> [{date, start, end}]
    const assignments = [];
    const warnings    = [];

    function hasClash(tid, date, start, end) {
      return (busySlots.get(tid) ?? []).some(
        s => s.date === date && s.start < end && s.end > start
      );
    }

    for (const session of sessions) {
      const need = invigilators_per_hall ?? session.invigilators_needed;
      let available = eligible.filter(t =>
        !isExcused(t.id, session.date) &&
        !hasClash(t.id, session.date, session.start_time, session.end_time) &&
        !(exclude_subject_teachers && subjectTeacherSet.has(`${t.id}:${session.subject.toLowerCase()}`))
      );
      available.sort((a, b) => {
        const diff = (dutyCount.get(a.id) || 0) - (dutyCount.get(b.id) || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });

      const pick = available.slice(0, need);
      if (pick.length < need) {
        warnings.push(`${session.hall_name} on ${session.date} ${session.start_time}â€“${session.end_time}: only ${pick.length}/${need} invigilators available`);
      }

      for (let i = 0; i < pick.length; i++) {
        const t = pick[i];
        assignments.push({
          exam_session_id: session.id,
          session_date:    session.date,
          session_start:   session.start_time,
          session_end:     session.end_time,
          session_subject: session.subject,
          session_class:   session.class_name,
          session_hall:    session.hall_name,
          teacher_id:      t.id,
          teacher_name:    t.name,
          role:            i === 0 ? 'chief' : 'assistant',
        });
        dutyCount.set(t.id, (dutyCount.get(t.id) || 0) + 1);
        if (!busySlots.has(t.id)) busySlots.set(t.id, []);
        busySlots.get(t.id).push({ date: session.date, start: session.start_time, end: session.end_time });
      }
    }

    const duty_counts = eligible
      .filter(t => (dutyCount.get(t.id) || 0) > 0)
      .map(t => ({ teacher_id: t.id, teacher_name: t.name, count: dutyCount.get(t.id) }))
      .sort((a, b) => b.count - a.count);

    res.json({ assignments, duty_counts, warnings, eligible_count: eligible.length });
  } catch (err) { next(err); }
});

// â”€â”€ Confirm and save generated roster â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/duties/confirm', adminOnly, async (req, res, next) => {
  try {
    const { duties, session_ids } = req.body;
    if (!Array.isArray(duties) || !duties.length) {
      return res.status(400).json({ error: 'duties array is required' });
    }

    // Delete existing duties for these sessions if replacing
    if (Array.isArray(session_ids) && session_ids.length) {
      await pool.query(
        `DELETE FROM invigilation_duties WHERE school_id=$1 AND exam_session_id=ANY($2::uuid[])`,
        [req.schoolId, session_ids]
      );
    }

    // Bulk insert
    let inserted = 0;
    for (const d of duties) {
      await pool.query(
        `INSERT INTO invigilation_duties (school_id, exam_session_id, teacher_id, role, is_auto_generated)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (exam_session_id, teacher_id) DO UPDATE
           SET role = EXCLUDED.role, is_auto_generated = EXCLUDED.is_auto_generated`,
        [req.schoolId, d.exam_session_id, d.teacher_id, d.role || 'assistant', d.is_auto_generated ?? true]
      );
      inserted++;
    }
    res.json({ saved: inserted });
  } catch (err) { next(err); }
});

// â”€â”€ Individual Duties CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/duties', adminOnly, async (req, res, next) => {
  try {
    const { session_id, from, to } = req.query;
    const params = [req.schoolId];
    const conds  = ['d.school_id = $1'];
    if (session_id) { params.push(session_id); conds.push(`d.exam_session_id = $${params.length}`); }
    if (from)       { params.push(from); conds.push(`es.date >= $${params.length}`); }
    if (to)         { params.push(to);   conds.push(`es.date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT d.id, d.exam_session_id, d.teacher_id, t.name AS teacher_name,
              d.role, d.is_auto_generated,
              es.date::text, es.start_time::text, es.end_time::text,
              es.subject, es.class_name, es.hall_name
       FROM invigilation_duties d
       JOIN exam_sessions es ON es.id = d.exam_session_id
       JOIN teachers t       ON t.id  = d.teacher_id
       WHERE ${conds.join(' AND ')}
       ORDER BY es.date, es.start_time, es.hall_name, d.role`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/duties', adminOnly, async (req, res, next) => {
  try {
    const { exam_session_id, teacher_id, role = 'assistant' } = req.body;
    if (!exam_session_id || !teacher_id) {
      return res.status(400).json({ error: 'exam_session_id and teacher_id are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO invigilation_duties (school_id, exam_session_id, teacher_id, role, is_auto_generated)
       VALUES ($1,$2,$3,$4,false)
       ON CONFLICT (exam_session_id, teacher_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [req.schoolId, exam_session_id, teacher_id, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/duties/:id', adminOnly, async (req, res, next) => {
  try {
    const { teacher_id, role } = req.body;
    const { rows } = await pool.query(
      `UPDATE invigilation_duties
       SET teacher_id = COALESCE($1, teacher_id),
           role       = COALESCE($2, role),
           is_auto_generated = false
       WHERE id = $3 AND school_id = $4
       RETURNING *`,
      [teacher_id||null, role||null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Duty not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/duties/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM invigilation_duties WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Duty not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// â”€â”€ Invigilation Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /sessions/duties/mine â€” teacher: their assigned sessions (today + upcoming)
router.get('/sessions/duties/mine', async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const teacherId = req.user.id;
    const today     = new Date().toISOString().slice(0, 10);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT es.id, es.date::text, es.start_time::text, es.end_time::text,
              es.subject, es.class_name, es.hall_name, d.role,
              ci.id                          AS check_in_id,
              ci.submitted_at                AS checked_in_at,
              ci.photo_url                   AS check_in_photo,
              ci.location_verified,
              COALESCE(ci.is_manual, false)  AS is_manual,
              (SELECT COUNT(*) FROM exam_student_attendance esa
               WHERE esa.exam_session_id = es.id) AS register_count,
              (SELECT COUNT(*) FROM students s
               WHERE s.school_id = es.school_id
                 AND LOWER(s.class_name) = ANY(
                   SELECT LOWER(TRIM(c))
                   FROM UNNEST(STRING_TO_ARRAY(es.class_name, ',')) AS c
                 )) AS student_count
       FROM exam_sessions es
       JOIN invigilation_duties d ON d.exam_session_id = es.id AND d.teacher_id = $2
       LEFT JOIN invigilation_check_ins ci
              ON ci.exam_session_id = es.id AND ci.teacher_id = $2 AND ci.date = es.date
       WHERE es.school_id = $1 AND es.date >= $3
       ORDER BY es.date, es.start_time`,
      [req.schoolId, teacherId, thirtyDaysAgo]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /sessions/:id/check-in â€” invigilator submits own attendance (photo + GPS)
router.post('/sessions/:id/check-in', async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { gpsCoordinates, imageBase64, photoSizeKb, notes } = req.body;
    const teacherId = req.user.id;

    if (!gpsCoordinates || !imageBase64) {
      return res.status(400).json({ error: 'gpsCoordinates and imageBase64 are required' });
    }

    // Verify teacher is assigned to this session
    const { rows: sessionRows } = await pool.query(
      `SELECT es.*, d.id AS duty_id
       FROM exam_sessions es
       JOIN invigilation_duties d ON d.exam_session_id = es.id AND d.teacher_id = $2
       WHERE es.id = $1 AND es.school_id = $3`,
      [req.params.id, teacherId, req.schoolId]
    );
    if (!sessionRows.length) {
      return res.status(403).json({ error: 'You are not assigned to this exam session' });
    }
    const session = sessionRows[0];
    const sessionDate = session.date instanceof Date
      ? session.date.toISOString().slice(0, 10)
      : String(session.date).slice(0, 10);

    // Only allow check-in on the exam day
    const today = new Date().toISOString().slice(0, 10);
    if (sessionDate !== today) {
      return res.status(400).json({ error: `Check-in is only available on the exam day (${sessionDate})` });
    }

    // Duplicate check â€” return existing record info so client can know it's already done
    const { rows: existing } = await pool.query(
      `SELECT id, submitted_at FROM invigilation_check_ins
       WHERE exam_session_id = $1 AND teacher_id = $2 AND date = $3`,
      [req.params.id, teacherId, today]
    );
    if (existing.length) {
      return res.status(409).json({
        error: 'You have already checked in for this session.',
        check_in_id: existing[0].id,
        submitted_at: existing[0].submitted_at,
      });
    }

    // GPS verification â€” hall must be in the location registry with coordinates configured
    const { rows: locRows } = await pool.query(
      `SELECT * FROM locations WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [req.schoolId, session.hall_name]
    );
    if (!locRows.length) {
      return res.status(400).json({
        error: `Exam hall "${session.hall_name}" is not registered as a location. Ask your administrator to add it to the Locations list before check-in is available.`,
      });
    }
    if (!locRows[0].has_coordinates) {
      return res.status(400).json({
        error: `GPS coordinates have not been configured for "${session.hall_name}". Ask your administrator to set the coordinates for this hall.`,
      });
    }
    const [lat, lng] = gpsCoordinates.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid GPS coordinates. Please refresh your location and try again.' });
    }
    const result = verifyLocation(locRows[0], lat, lng);
    if (!result.valid) {
      return res.status(400).json({
        error: `You do not appear to be in ${session.hall_name}. ${result.message}`,
      });
    }
    const locationVerified = result.verified;
    const locationMsg      = result.message;

    // Academic year
    const { rows: ayRows } = await pool.query(
      `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
      [req.schoolId]
    );
    const yearId = ayRows[0]?.id              ?? null;
    const sem    = ayRows[0]?.current_semester ?? null;

    // Upload photo
    const { rows: tRows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [teacherId]);
    const tName    = tRows[0]?.name ?? teacherId;
    const fileName = `invigilation/${req.schoolId}/${tName}_${today}_${Date.now()}.jpg`;
    const photoUrl = await uploadPhoto(imageBase64, fileName);

    // Insert check-in record
    const { rows: inserted } = await pool.query(
      `INSERT INTO invigilation_check_ins
         (school_id, exam_session_id, teacher_id, date, gps_coordinates, photo_url,
          photo_size_kb, location_verified, location_verification_message, notes,
          academic_year_id, semester)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.schoolId, req.params.id, teacherId, today, gpsCoordinates, photoUrl,
       photoSizeKb || null, locationVerified, locationMsg, notes?.trim() || null, yearId, sem]
    );

    await logAudit(
      req.schoolId, 'INVIGILATION_CHECKIN', teacherId, tName,
      'invigilation_check_ins', inserted[0].id,
      { session_id: req.params.id, subject: session.subject, hall: session.hall_name, date: today }
    );

    res.status(201).json({
      message: 'Checked in successfully',
      record: inserted[0],
      locationMessage: locationMsg,
    });
  } catch (err) { next(err); }
});

// GET /sessions/:id/check-ins â€” admin: view all check-ins for a session
router.get('/sessions/:id/check-ins', adminOnly, async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT ci.id, ci.date::text, ci.submitted_at, ci.gps_coordinates,
              ci.photo_url, ci.photo_size_kb, ci.location_verified,
              ci.location_verification_message, ci.notes,
              ci.is_manual, ci.manually_entered_by,
              t.name AS teacher_name, t.id AS teacher_id
       FROM invigilation_check_ins ci
       JOIN teachers t ON t.id = ci.teacher_id
       WHERE ci.exam_session_id = $1 AND ci.school_id = $2
       ORDER BY ci.submitted_at`,
      [req.params.id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /sessions/:id/check-in/manual â€” admin manually records an invigilator's attendance
router.post('/sessions/:id/check-in/manual', adminOnly, async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { teacher_id, notes } = req.body;
    if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required.' });

    // Verify session belongs to this school
    const { rows: sessionRows } = await pool.query(
      `SELECT es.*, ay.id AS ay_id, ay.current_semester AS ay_sem
       FROM exam_sessions es
       LEFT JOIN academic_years ay ON ay.school_id = es.school_id AND ay.is_current = TRUE
       WHERE es.id = $1 AND es.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!sessionRows.length) return res.status(404).json({ error: 'Session not found.' });
    const session = sessionRows[0];

    // Verify teacher is assigned to this session
    const { rowCount: assigned } = await pool.query(
      `SELECT 1 FROM invigilation_duties WHERE exam_session_id = $1 AND teacher_id = $2 AND school_id = $3`,
      [req.params.id, teacher_id, req.schoolId]
    );
    if (!assigned) return res.status(400).json({ error: 'This teacher is not assigned to this exam session.' });

    // Get teacher name for audit
    const { rows: tRows } = await pool.query(
      `SELECT name FROM teachers WHERE id = $1 AND school_id = $2`,
      [teacher_id, req.schoolId]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Teacher not found.' });

    const sessionDate = session.date instanceof Date
      ? session.date.toISOString().slice(0, 10)
      : String(session.date).slice(0, 10);

    // Duplicate guard
    const { rows: existing } = await pool.query(
      `SELECT id, submitted_at FROM invigilation_check_ins
       WHERE exam_session_id = $1 AND teacher_id = $2 AND date = $3`,
      [req.params.id, teacher_id, sessionDate]
    );
    if (existing.length) {
      return res.status(409).json({
        error: `${tRows[0].name} has already been checked in for this session.`,
        check_in_id: existing[0].id,
        submitted_at: existing[0].submitted_at,
      });
    }

    const adminId = req.user?.id ?? null;

    const { rows: inserted } = await pool.query(
      `INSERT INTO invigilation_check_ins
         (school_id, exam_session_id, teacher_id, date, notes,
          is_manual, manually_entered_by, academic_year_id, semester)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8)
       RETURNING *`,
      [req.schoolId, req.params.id, teacher_id, sessionDate,
       notes?.trim() || 'Manually recorded by administrator',
       adminId, session.ay_id, session.ay_sem]
    );

    await logAudit(
      req.schoolId, 'INVIGILATION_CHECKIN_MANUAL', adminId, 'Administrator',
      'invigilation_check_ins', inserted[0].id,
      { session_id: req.params.id, teacher_id, teacher_name: tRows[0].name,
        subject: session.subject, hall: session.hall_name, date: sessionDate }
    );

    res.json({ ok: true, check_in: inserted[0] });
  } catch (err) { next(err); }
});

// GET /report â€” admin: invigilation attendance report across sessions
router.get('/report', adminOnly, async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { from, to, teacher_id, subject } = req.query;
    const params = [req.schoolId];
    const conditions = ['es.school_id = $1', 'd.school_id = $1'];
    let p = 2;
    if (from)       { conditions.push(`es.date >= $${p++}`); params.push(from); }
    if (to)         { conditions.push(`es.date <= $${p++}`); params.push(to); }
    if (teacher_id) { conditions.push(`d.teacher_id = $${p++}`); params.push(teacher_id); }
    if (subject)    { conditions.push(`LOWER(es.subject) = LOWER($${p++})`); params.push(subject); }

    const { rows } = await pool.query(`
      SELECT
        es.id                                     AS session_id,
        es.date::text,
        es.start_time::text,
        es.end_time::text,
        es.subject,
        es.class_name,
        es.hall_name,
        t.id                                      AS teacher_id,
        t.name                                    AS teacher_name,
        d.role,
        (ci.id IS NOT NULL)                       AS checked_in,
        ci.submitted_at                           AS checked_in_at,
        COALESCE(ci.is_manual, false)             AS is_manual,
        COALESCE(ci.location_verified, false)     AS location_verified,
        (SELECT COUNT(*) FROM exam_student_attendance
         WHERE exam_session_id = es.id AND status = 'Present') AS students_present,
        (SELECT COUNT(*) FROM exam_student_attendance
         WHERE exam_session_id = es.id AND status = 'Absent')  AS students_absent,
        (SELECT COUNT(*) FROM exam_student_attendance
         WHERE exam_session_id = es.id)                        AS register_count
      FROM exam_sessions es
      JOIN invigilation_duties d ON d.exam_session_id = es.id
      JOIN teachers t ON t.id = d.teacher_id
      LEFT JOIN invigilation_check_ins ci
             ON ci.exam_session_id = es.id AND ci.teacher_id = t.id AND ci.school_id = $1
      WHERE ${conditions.join(' AND ')}
      ORDER BY es.date DESC, es.start_time, es.subject, t.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /sessions/:id/register â€” load student roster (+ existing attendance if any)
router.get('/sessions/:id/register', async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const teacherId = req.user.id;

    // Admins can always view; teachers must be assigned
    if (req.user.role === 'teacher') {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM invigilation_duties WHERE exam_session_id = $1 AND teacher_id = $2 AND school_id = $3`,
        [req.params.id, teacherId, req.schoolId]
      );
      if (!rowCount) return res.status(403).json({ error: 'You are not assigned to this session' });
    }

    const { rows: sessionRows } = await pool.query(
      `SELECT class_name FROM exam_sessions WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!sessionRows.length) return res.status(404).json({ error: 'Session not found' });

    // Parse class names (handles merged sessions like "Form 1A, Form 1B")
    const classNames = sessionRows[0].class_name.split(',').map(c => c.trim().toLowerCase());

    const { rows: students } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name,
              esa.status, esa.notes AS attendance_notes, esa.submitted_at
       FROM students s
       LEFT JOIN exam_student_attendance esa
              ON esa.student_id = s.id AND esa.exam_session_id = $1
       WHERE s.school_id = $2 AND LOWER(s.class_name) = ANY($3::text[])
       ORDER BY s.class_name, s.name`,
      [req.params.id, req.schoolId, classNames]
    );
    res.json(students);
  } catch (err) { next(err); }
});

// POST /sessions/:id/register â€” submit student attendance (requires check-in first)
router.post('/sessions/:id/register', async (req, res, next) => {
  if (setupGuard(res)) return;
  try {
    const { records } = req.body; // [{ student_id, status, notes }]
    const teacherId   = req.user.id;

    if (!Array.isArray(records) || !records.length) {
      return res.status(400).json({ error: 'records[] is required' });
    }

    // Verify assignment
    const { rowCount: assigned } = await pool.query(
      `SELECT 1 FROM invigilation_duties WHERE exam_session_id = $1 AND teacher_id = $2 AND school_id = $3`,
      [req.params.id, teacherId, req.schoolId]
    );
    if (!assigned && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not assigned to this session' });
    }

    // Natural guard: teacher must have checked in first
    if (req.user.role === 'teacher') {
      const today = new Date().toISOString().slice(0, 10);
      const { rows: sessionRows } = await pool.query(
        `SELECT date::text AS date FROM exam_sessions WHERE id = $1 AND school_id = $2`,
        [req.params.id, req.schoolId]
      );
      if (!sessionRows.length) return res.status(404).json({ error: 'Session not found' });
      const sessionDate = sessionRows[0].date.slice(0, 10);

      const { rowCount: checkedIn } = await pool.query(
        `SELECT 1 FROM invigilation_check_ins
         WHERE exam_session_id = $1 AND teacher_id = $2 AND date = $3`,
        [req.params.id, teacherId, sessionDate]
      );
      if (!checkedIn) {
        return res.status(403).json({
          error: 'You must check in first before submitting the student register.',
          code: 'CHECKIN_REQUIRED',
        });
      }
    }

    // Bulk upsert student attendance
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let count = 0;
      for (const r of records) {
        const status = ['Present', 'Absent'].includes(r.status) ? r.status : 'Present';
        await client.query(
          `INSERT INTO exam_student_attendance
             (school_id, exam_session_id, student_id, status, submitted_by, notes, submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6,now())
           ON CONFLICT (exam_session_id, student_id) DO UPDATE
             SET status = EXCLUDED.status, submitted_by = EXCLUDED.submitted_by,
                 notes  = EXCLUDED.notes,  submitted_at  = now()`,
          [req.schoolId, req.params.id, r.student_id, status, teacherId, r.notes?.trim() || null]
        );
        count++;
      }
      await client.query('COMMIT');
      res.json({ message: 'Register submitted', count });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;

