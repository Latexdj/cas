const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── Exam Sessions ─────────────────────────────────────────────────────────────

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
              ) AS duties
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

// ── Invigilator Pool ──────────────────────────────────────────────────────────

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

// ── Roster Generation ─────────────────────────────────────────────────────────

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
        warnings.push(`${session.hall_name} on ${session.date} ${session.start_time}–${session.end_time}: only ${pick.length}/${need} invigilators available`);
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

// ── Confirm and save generated roster ────────────────────────────────────────

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

// ── Individual Duties CRUD ────────────────────────────────────────────────────

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

module.exports = router;
