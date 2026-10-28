'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { uploadFile } = require('../services/storage.service');
const { generateObservationReportPDFBuffer, generateBlankObservationFormPDFBuffer } = require('../services/pdf.service');
const { notifyTeacherObservationScheduled, notifyTeacherObservationFeedbackReady } = require('../services/notification.service');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('lesson_observation'));

// ── Permission helpers ──────────────────────────────────────────────────────
// See design doc §6: management may observe anyone; a HOD may observe (a)
// teachers in their own department(s) and (b) any teacher who heads a
// *different* department (peer-HOD review) — never themselves.

function isManagementUser(user) {
  return user?.role === 'admin' || user?.role === 'super_admin' || user?.type === 'management';
}

async function getMyDepartments(schoolId, teacherId) {
  const { rows } = await pool.query(
    `SELECT id, name FROM departments WHERE school_id = $1 AND head_teacher_id = $2`,
    [schoolId, teacherId]
  );
  return rows;
}

async function canObserve(schoolId, user, targetTeacherId) {
  if (user.id === targetTeacherId) return false;
  if (isManagementUser(user)) return true;
  const myDepts = await getMyDepartments(schoolId, user.id);
  if (!myDepts.length) return false;
  const myDeptIds = myDepts.map(d => d.id);
  const { rows } = await pool.query(
    `SELECT 1 WHERE EXISTS (
       SELECT 1 FROM department_teachers dt WHERE dt.department_id = ANY($1::uuid[]) AND dt.teacher_id = $2
     ) OR EXISTS (
       SELECT 1 FROM departments d JOIN teachers t ON LOWER(t.department) = LOWER(d.name) AND t.school_id = d.school_id
       WHERE d.id = ANY($1::uuid[]) AND t.id = $2
     ) OR EXISTS (
       SELECT 1 FROM departments d2 WHERE d2.school_id = $3 AND d2.head_teacher_id = $2 AND d2.id != ALL($1::uuid[])
     )`,
    [myDeptIds, targetTeacherId, schoolId]
  );
  return rows.length > 0;
}

async function getObservableTeachers(schoolId, user) {
  if (isManagementUser(user)) {
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, department FROM teachers WHERE school_id = $1 AND status = 'Active' AND id <> $2 ORDER BY name`,
      [schoolId, user.id]
    );
    return rows;
  }
  const myDepts = await getMyDepartments(schoolId, user.id);
  if (!myDepts.length) return [];
  const myDeptIds = myDepts.map(d => d.id);
  const { rows } = await pool.query(
    `SELECT DISTINCT t.id, t.name, t.teacher_code, t.department
     FROM teachers t
     WHERE t.school_id = $1 AND t.status = 'Active' AND t.id <> $2
       AND (
         EXISTS (SELECT 1 FROM department_teachers dt WHERE dt.department_id = ANY($3::uuid[]) AND dt.teacher_id = t.id)
         OR EXISTS (SELECT 1 FROM departments d WHERE d.id = ANY($3::uuid[]) AND LOWER(d.name) = LOWER(t.department))
         OR EXISTS (SELECT 1 FROM departments d2 WHERE d2.school_id = $1 AND d2.head_teacher_id = t.id AND d2.id != ALL($3::uuid[]))
       )
     ORDER BY t.name`,
    [schoolId, user.id, myDeptIds]
  );
  return rows;
}

async function getCurrentYearSemester(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return rows[0] ? { academic_year_id: rows[0].id, semester: rows[0].current_semester } : { academic_year_id: null, semester: null };
}

// Resolves the year/semester to save on an observation: an explicitly chosen
// academic_year_id must belong to this school; semester (if given) must be 1 or 2.
// Falls back to the school's current year/semester when none is chosen.
async function resolveYearSemester(schoolId, academic_year_id, semester) {
  if (!academic_year_id) return getCurrentYearSemester(schoolId);
  const { rows } = await pool.query(
    `SELECT id FROM academic_years WHERE id = $1 AND school_id = $2`,
    [academic_year_id, schoolId]
  );
  if (!rows.length) return { error: 'academic_year_id does not belong to this school' };
  if (semester != null && ![1, 2].includes(Number(semester))) {
    return { error: 'semester must be 1 or 2' };
  }
  return { academic_year_id, semester: semester != null ? Number(semester) : null };
}

const OBS_DETAIL_SELECT = `
  SELECT o.*, ot.name AS observer_name, ot.teacher_code AS observer_code,
         tt.name AS observed_teacher_name, tt.teacher_code AS observed_teacher_code, tt.email AS observed_teacher_email, tt.phone AS observed_teacher_phone,
         ay.name AS academic_year_name
  FROM lesson_observations o
  JOIN teachers ot ON ot.id = o.observer_id
  JOIN teachers tt ON tt.id = o.observed_teacher_id
  LEFT JOIN academic_years ay ON ay.id = o.academic_year_id
  WHERE o.id = $1 AND o.school_id = $2
`;

async function loadObservation(schoolId, id) {
  const { rows } = await pool.query(OBS_DETAIL_SELECT, [id, schoolId]);
  return rows[0] ?? null;
}

async function canViewObservation(schoolId, user, obs) {
  if (user.id === obs.observer_id || user.id === obs.observed_teacher_id) return true;
  if (isManagementUser(user)) return true;
  return canObserve(schoolId, user, obs.observed_teacher_id);
}

// ── Reference data ──────────────────────────────────────────────────────────

router.get('/criteria', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, nts_domain, sort_order FROM observation_criteria
       WHERE school_id IS NULL OR school_id = $1
       ORDER BY sort_order, name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/observable-teachers', async (req, res, next) => {
  try {
    if (!isManagementUser(req.user)) {
      const myDepts = await getMyDepartments(req.schoolId, req.user.id);
      if (!myDepts.length) return res.status(403).json({ error: 'HOD or management access required' });
    }
    const teachers = await getObservableTeachers(req.schoolId, req.user);
    res.json(teachers);
  } catch (err) { next(err); }
});

// Distinct (subject, class) pairs taught by a teacher, for the create/edit form's
// dropdown — replaces free-text subject/class entry with the teacher's real timetable.
router.get('/teacher-lessons/:teacherId', async (req, res, next) => {
  try {
    const allowed = await canObserve(req.schoolId, req.user, req.params.teacherId) || req.user.id === req.params.teacherId;
    if (!allowed) return res.status(403).json({ error: 'You are not permitted to view this teacher\'s timetable' });

    let { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      const current = await getCurrentYearSemester(req.schoolId);
      academic_year_id = academic_year_id || current.academic_year_id;
      semester = semester || current.semester;
    }

    const params = [req.schoolId, req.params.teacherId];
    let where = 'WHERE school_id = $1 AND teacher_id = $2';
    if (academic_year_id) { params.push(academic_year_id); where += ` AND academic_year_id = $${params.length}`; }
    if (semester)         { params.push(parseInt(semester)); where += ` AND semester = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (subject, class_names) id AS timetable_id, subject, class_names
       FROM timetable ${where} ORDER BY subject, class_names`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/blank-form/pdf', async (req, res, next) => {
  try {
    if (!isManagementUser(req.user)) {
      const myDepts = await getMyDepartments(req.schoolId, req.user.id);
      if (!myDepts.length) return res.status(403).json({ error: 'HOD or management access required' });
    }
    const { rows: criteria } = await pool.query(
      `SELECT id, name, nts_domain, sort_order FROM observation_criteria
       WHERE school_id IS NULL OR school_id = $1 ORDER BY sort_order, name`,
      [req.schoolId]
    );
    const { rows: schRows } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);
    if (!schRows.length) return res.status(404).json({ error: 'School not found' });

    const pdfBuffer = await generateBlankObservationFormPDFBuffer(criteria, schRows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="lesson-observation-blank-form.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── Analytics (v1) — coverage, score trend, action-item counts ─────────────

router.get('/analytics', async (req, res, next) => {
  try {
    if (!isManagementUser(req.user)) {
      const myDepts = await getMyDepartments(req.schoolId, req.user.id);
      if (!myDepts.length) return res.status(403).json({ error: 'HOD or management access required' });
    }
    const scopeTeachers = await getObservableTeachers(req.schoolId, req.user);
    const scopeIds = scopeTeachers.map(t => t.id);

    let { academic_year_id, semester } = req.query;
    if (!academic_year_id) {
      ({ academic_year_id } = await getCurrentYearSemester(req.schoolId));
    }
    semester = semester ? Number(semester) : null;

    if (!scopeIds.length) {
      return res.json({ coverage: [], score_trend: [], actions: { open: 0, done: 0, overdue: 0 }, academic_year_id, semester });
    }

    const { rows: coverage } = await pool.query(
      `SELECT t.id AS teacher_id, t.name AS teacher_name, t.department,
              COUNT(o.id) FILTER (
                WHERE (o.academic_year_id = $2 OR $2 IS NULL) AND (o.semester = $4 OR $4 IS NULL)
              )::int AS observation_count,
              MAX(o.observed_at) AS last_observed_at
       FROM teachers t
       LEFT JOIN lesson_observations o ON o.observed_teacher_id = t.id AND o.school_id = $1
       WHERE t.id = ANY($3::uuid[])
       GROUP BY t.id, t.name, t.department
       ORDER BY observation_count ASC, t.name`,
      [req.schoolId, academic_year_id, scopeIds, semester]
    );

    const { rows: scoreTrend } = await pool.query(
      `SELECT c.id AS criterion_id, c.name AS criterion_name,
              ROUND(AVG(s.score)::numeric, 2) AS avg_score, COUNT(s.score)::int AS n
       FROM lesson_observation_scores s
       JOIN observation_criteria c ON c.id = s.criterion_id
       JOIN lesson_observations o ON o.id = s.observation_id
       WHERE o.school_id = $1 AND o.observed_teacher_id = ANY($2::uuid[]) AND s.score IS NOT NULL
         AND (o.academic_year_id = $3 OR $3 IS NULL) AND (o.semester = $4 OR $4 IS NULL)
       GROUP BY c.id, c.name, c.sort_order
       ORDER BY c.sort_order`,
      [req.schoolId, scopeIds, academic_year_id, semester]
    );

    const { rows: actionCounts } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE a.status = 'Open')::int AS open,
         COUNT(*) FILTER (WHERE a.status = 'Done')::int AS done,
         COUNT(*) FILTER (WHERE a.status = 'Open' AND a.due_date < CURRENT_DATE)::int AS overdue
       FROM lesson_observation_actions a
       JOIN lesson_observations o ON o.id = a.observation_id
       WHERE o.school_id = $1 AND o.observed_teacher_id = ANY($2::uuid[])
         AND (o.academic_year_id = $3 OR $3 IS NULL) AND (o.semester = $4 OR $4 IS NULL)`,
      [req.schoolId, scopeIds, academic_year_id, semester]
    );

    res.json({ coverage, score_trend: scoreTrend, actions: actionCounts[0], academic_year_id, semester });
  } catch (err) { next(err); }
});

// ── Create (schedule or drop-in) ────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const {
      observed_teacher_id, observation_type = 'scheduled', timetable_id,
      subject, class_names, scheduled_at, observed_at, entry_mode = 'live',
      follow_up_of_id, academic_year_id: reqYearId, semester: reqSemester,
    } = req.body;

    if (!observed_teacher_id) return res.status(400).json({ error: 'observed_teacher_id is required' });
    if (!['scheduled', 'drop_in'].includes(observation_type)) return res.status(400).json({ error: 'observation_type must be scheduled or drop_in' });
    if (!['live', 'paper_entered_later'].includes(entry_mode)) return res.status(400).json({ error: 'entry_mode must be live or paper_entered_later' });

    const allowed = await canObserve(req.schoolId, req.user, observed_teacher_id);
    if (!allowed) return res.status(403).json({ error: 'You are not permitted to observe this teacher' });

    const { rows: teacherRows } = await pool.query(
      `SELECT id, name, email, phone FROM teachers WHERE id = $1 AND school_id = $2 AND status = 'Active'`,
      [observed_teacher_id, req.schoolId]
    );
    if (!teacherRows.length) return res.status(404).json({ error: 'Teacher not found' });

    const yearSem = await resolveYearSemester(req.schoolId, reqYearId, reqSemester);
    if (yearSem.error) return res.status(400).json({ error: yearSem.error });
    const { academic_year_id, semester } = yearSem;

    const { rows } = await pool.query(
      `INSERT INTO lesson_observations
         (school_id, observer_id, observed_teacher_id, observation_type, entry_mode,
          timetable_id, subject, class_names, academic_year_id, semester,
          scheduled_at, observed_at, follow_up_of_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, status, observation_type, entry_mode, scheduled_at, observed_at, created_at`,
      [req.schoolId, req.user.id, observed_teacher_id, observation_type, entry_mode,
       timetable_id || null, subject || null, class_names || null, academic_year_id, semester,
       scheduled_at || (observation_type === 'drop_in' ? new Date().toISOString() : null),
       observed_at || null, follow_up_of_id || null]
    );
    const created = rows[0];

    if (observation_type === 'scheduled') {
      const { rows: observerRows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [req.user.id]);
      notifyTeacherObservationScheduled(req.schoolId, teacherRows[0], {
        ...created, subject, class_names, observer_name: observerRows[0]?.name,
      }).catch(err => console.error('[LessonObservation] schedule notify failed:', err.message));
    }

    res.status(201).json(created);
  } catch (err) { next(err); }
});

// ── List ─────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { status, teacher_id, academic_year_id, semester } = req.query;
    const params = [req.schoolId];
    const conditions = ['o.school_id = $1'];

    if (teacher_id) {
      if (!isManagementUser(req.user)) {
        const allowed = await canObserve(req.schoolId, req.user, teacher_id) || req.user.id === teacher_id;
        if (!allowed) return res.status(403).json({ error: 'You cannot view this teacher\'s observations' });
      }
      params.push(teacher_id);
      conditions.push(`o.observed_teacher_id = $${params.length}`);
    } else {
      params.push(req.user.id);
      conditions.push(`(o.observer_id = $${params.length} OR o.observed_teacher_id = $${params.length})`);
    }

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (academic_year_id) {
      params.push(academic_year_id);
      conditions.push(`o.academic_year_id = $${params.length}`);
    }
    if (semester) {
      params.push(parseInt(semester));
      conditions.push(`o.semester = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT o.id, o.observation_type, o.entry_mode, o.status, o.subject, o.class_names,
              o.academic_year_id, o.semester, ay.name AS academic_year_name,
              o.scheduled_at, o.observed_at, o.teacher_ack_at, o.created_at,
              ot.name AS observer_name, tt.name AS observed_teacher_name,
              (SELECT COUNT(*)::int FROM lesson_observation_actions a WHERE a.observation_id = o.id AND a.status = 'Open') AS open_actions
       FROM lesson_observations o
       JOIN teachers ot ON ot.id = o.observer_id
       JOIN teachers tt ON tt.id = o.observed_teacher_id
       LEFT JOIN academic_years ay ON ay.id = o.academic_year_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(o.observed_at, o.scheduled_at, o.created_at) DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Detail (role-shaped — see design doc §7) ────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (!(await canViewObservation(req.schoolId, req.user, obs))) {
      return res.status(403).json({ error: 'You do not have access to this observation' });
    }

    const isObservedTeacher = req.user.id === obs.observed_teacher_id && !isManagementUser(req.user) && req.user.id !== obs.observer_id;

    const { rows: actions } = await pool.query(
      `SELECT id, description, due_date, status, created_by, closed_at, created_at
       FROM lesson_observation_actions WHERE observation_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    const { rows: photos } = await pool.query(
      `SELECT id, photo_url, caption, created_at FROM observation_photos WHERE observation_id = $1 ORDER BY created_at`,
      [req.params.id]
    );

    if (isObservedTeacher) {
      // Narrative only — never serialize scores/overall_rating/evidence_notes to the observed teacher.
      const { overall_rating, evidence_notes, ...narrativeObs } = obs;
      return res.json({ ...narrativeObs, actions, photos });
    }

    const { rows: scores } = await pool.query(
      `SELECT s.id, s.criterion_id, c.name AS criterion_name, c.nts_domain, s.score, s.note
       FROM lesson_observation_scores s
       JOIN observation_criteria c ON c.id = s.criterion_id
       WHERE s.observation_id = $1 ORDER BY c.sort_order`,
      [req.params.id]
    );
    res.json({ ...obs, scores, actions, photos });
  } catch (err) { next(err); }
});

// ── Update (observer only) ──────────────────────────────────────────────────

router.patch('/:id', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observer_id && !isManagementUser(req.user)) {
      return res.status(403).json({ error: 'Only the observer may update this observation' });
    }
    if (obs.status === 'Closed') return res.status(400).json({ error: 'This observation is closed' });

    const {
      scores, glow_notes, grow_notes, recommended_action, evidence_notes,
      status, entry_mode, observed_at,
    } = req.body;

    if (status === 'Completed') {
      if (!glow_notes?.trim() || !grow_notes?.trim() || !recommended_action?.trim()) {
        return res.status(400).json({ error: 'glow_notes, grow_notes and recommended_action are all required to publish an observation' });
      }
    }

    // Setup fields (who/what/when it's scheduled for) are only safe to change
    // before the observation cycle has advanced past "Scheduled" — once it's
    // Completed/Acknowledged/Closed, scores and feedback already reference them.
    const SETUP_FIELDS = ['subject', 'class_names', 'timetable_id', 'observation_type', 'scheduled_at', 'academic_year_id', 'semester'];
    const touchingSetup = SETUP_FIELDS.some(k => k in req.body);
    let setup = {
      subject: obs.subject, class_names: obs.class_names, timetable_id: obs.timetable_id,
      observation_type: obs.observation_type, scheduled_at: obs.scheduled_at,
      academic_year_id: obs.academic_year_id, semester: obs.semester,
    };
    if (touchingSetup) {
      if (obs.status !== 'Scheduled') {
        return res.status(400).json({ error: 'Setup details can only be edited while the observation is still Scheduled' });
      }
      if ('observation_type' in req.body && !['scheduled', 'drop_in'].includes(req.body.observation_type)) {
        return res.status(400).json({ error: 'observation_type must be scheduled or drop_in' });
      }
      if ('academic_year_id' in req.body || 'semester' in req.body) {
        const yearSem = await resolveYearSemester(
          req.schoolId,
          'academic_year_id' in req.body ? req.body.academic_year_id : obs.academic_year_id,
          'semester' in req.body ? req.body.semester : obs.semester
        );
        if (yearSem.error) return res.status(400).json({ error: yearSem.error });
        setup.academic_year_id = yearSem.academic_year_id;
        setup.semester = yearSem.semester;
      }
      if ('subject' in req.body) setup.subject = req.body.subject || null;
      if ('class_names' in req.body) setup.class_names = req.body.class_names || null;
      if ('timetable_id' in req.body) setup.timetable_id = req.body.timetable_id || null;
      if ('observation_type' in req.body) setup.observation_type = req.body.observation_type;
      if ('scheduled_at' in req.body) setup.scheduled_at = req.body.scheduled_at || null;
    }

    if (Array.isArray(scores)) {
      for (const s of scores) {
        if (!s.criterion_id) continue;
        await pool.query(
          `INSERT INTO lesson_observation_scores (observation_id, criterion_id, score, note)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (observation_id, criterion_id) DO UPDATE SET score = EXCLUDED.score, note = EXCLUDED.note`,
          [req.params.id, s.criterion_id, s.score ?? null, s.note || null]
        );
      }
    }

    const { rows: avgRows } = await pool.query(
      `SELECT ROUND(AVG(score)::numeric, 2) AS avg FROM lesson_observation_scores WHERE observation_id = $1 AND score IS NOT NULL`,
      [req.params.id]
    );

    const nextStatus = status && ['Scheduled', 'Completed', 'Closed'].includes(status) ? status : obs.status;
    const settingObservedAt = observed_at || (nextStatus === 'Completed' && !obs.observed_at ? new Date().toISOString() : obs.observed_at);

    const { rows } = await pool.query(
      `UPDATE lesson_observations SET
         glow_notes         = COALESCE($1, glow_notes),
         grow_notes         = COALESCE($2, grow_notes),
         recommended_action = COALESCE($3, recommended_action),
         evidence_notes     = COALESCE($4, evidence_notes),
         entry_mode         = COALESCE($5, entry_mode),
         observed_at        = $6,
         overall_rating     = $7,
         status              = $8,
         closed_at          = CASE WHEN $8 = 'Closed' THEN now() ELSE closed_at END,
         closed_by          = CASE WHEN $8 = 'Closed' THEN $9 ELSE closed_by END,
         subject            = $12,
         class_names        = $13,
         timetable_id       = $14,
         observation_type   = $15,
         scheduled_at       = $16,
         academic_year_id   = $17,
         semester           = $18,
         updated_at         = now()
       WHERE id = $10 AND school_id = $11
       RETURNING *`,
      [glow_notes || null, grow_notes || null, recommended_action || null, evidence_notes || null,
       entry_mode || null, settingObservedAt, avgRows[0]?.avg ?? null, nextStatus, req.user.id,
       req.params.id, req.schoolId,
       setup.subject, setup.class_names, setup.timetable_id, setup.observation_type, setup.scheduled_at,
       setup.academic_year_id, setup.semester]
    );

    if (status === 'Completed' && obs.status !== 'Completed') {
      pool.query(`SELECT name, email, phone FROM teachers WHERE id = $1`, [obs.observed_teacher_id])
        .then(({ rows: t }) => t[0] && notifyTeacherObservationFeedbackReady(req.schoolId, t[0], rows[0]))
        .catch(err => console.error('[LessonObservation] feedback-ready notify failed:', err.message));
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observer_id && !isManagementUser(req.user)) {
      return res.status(403).json({ error: 'Only the observer may cancel this observation' });
    }
    if (obs.status !== 'Scheduled') return res.status(400).json({ error: 'Only a not-yet-conducted observation can be cancelled' });

    await pool.query(`DELETE FROM lesson_observations WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Observation cancelled' });
  } catch (err) { next(err); }
});

// ── Teacher acknowledgment ───────────────────────────────────────────────

router.post('/:id/acknowledge', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observed_teacher_id) return res.status(403).json({ error: 'Only the observed teacher may acknowledge this' });
    if (!['Completed'].includes(obs.status)) return res.status(400).json({ error: 'This observation is not ready to be acknowledged' });

    const { comment } = req.body;
    const { rows } = await pool.query(
      `UPDATE lesson_observations SET teacher_ack_at = now(), teacher_comment = $1, status = 'Acknowledged', updated_at = now()
       WHERE id = $2 AND school_id = $3 RETURNING id, status, teacher_ack_at, teacher_comment`,
      [comment || null, req.params.id, req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Photo evidence ───────────────────────────────────────────────────────

router.post('/:id/photos', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observer_id && !isManagementUser(req.user)) {
      return res.status(403).json({ error: 'Only the observer may attach photos' });
    }
    const { photo_base64, caption } = req.body;
    if (!photo_base64) return res.status(400).json({ error: 'photo_base64 is required' });

    const ext = (photo_base64.match(/^data:image\/(\w+);base64,/) || [])[1] || 'jpg';
    const filePath = `lesson-observations/${req.params.id}/${Date.now()}.${ext}`;
    const url = await uploadFile(photo_base64, filePath, { upsert: false });

    const { rows } = await pool.query(
      `INSERT INTO observation_photos (school_id, observation_id, photo_url, caption)
       VALUES ($1,$2,$3,$4) RETURNING id, photo_url, caption, created_at`,
      [req.schoolId, req.params.id, url, caption || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id/photos/:photoId', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observer_id && !isManagementUser(req.user)) {
      return res.status(403).json({ error: 'Only the observer may remove photos' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM observation_photos WHERE id = $1 AND observation_id = $2`,
      [req.params.photoId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Photo not found' });
    res.json({ message: 'Photo removed' });
  } catch (err) { next(err); }
});

// ── Follow-up actions ─────────────────────────────────────────────────────

router.post('/:id/actions', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observer_id && !isManagementUser(req.user)) {
      return res.status(403).json({ error: 'Only the observer may add action items' });
    }
    const { description, due_date } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'description is required' });

    const { rows } = await pool.query(
      `INSERT INTO lesson_observation_actions (observation_id, description, due_date, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id, description, due_date, status, created_by, created_at`,
      [req.params.id, description.trim(), due_date || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/actions/:actionId', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    if (req.user.id !== obs.observer_id && req.user.id !== obs.observed_teacher_id && !isManagementUser(req.user)) {
      return res.status(403).json({ error: 'You cannot update this action item' });
    }
    const { status } = req.body;
    if (!['Open', 'Done'].includes(status)) return res.status(400).json({ error: 'status must be Open or Done' });

    const { rows } = await pool.query(
      `UPDATE lesson_observation_actions SET status = $1, closed_at = CASE WHEN $1 = 'Done' THEN now() ELSE NULL END
       WHERE id = $2 AND observation_id = $3 RETURNING id, description, due_date, status, closed_at`,
      [status, req.params.actionId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Action item not found' });

    const { rows: remaining } = await pool.query(
      `SELECT COUNT(*)::int AS open_count FROM lesson_observation_actions WHERE observation_id = $1 AND status = 'Open'`,
      [req.params.id]
    );
    if (remaining[0].open_count === 0 && ['Completed', 'Acknowledged'].includes(obs.status)) {
      await pool.query(
        `UPDATE lesson_observations SET status = 'Closed', closed_at = now(), closed_by = $1, updated_at = now() WHERE id = $2`,
        [req.user.id, req.params.id]
      );
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Completed-observation report PDF ────────────────────────────────────────

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const obs = await loadObservation(req.schoolId, req.params.id);
    if (!obs) return res.status(404).json({ error: 'Observation not found' });
    const isObservedTeacherOnly = req.user.id === obs.observed_teacher_id && req.user.id !== obs.observer_id && !isManagementUser(req.user);
    if (isObservedTeacherOnly || !(await canViewObservation(req.schoolId, req.user, obs))) {
      return res.status(403).json({ error: 'You do not have access to this report' });
    }

    const { rows: scores } = await pool.query(
      `SELECT c.name AS criterion_name, s.score, s.note
       FROM lesson_observation_scores s JOIN observation_criteria c ON c.id = s.criterion_id
       WHERE s.observation_id = $1 ORDER BY c.sort_order`,
      [req.params.id]
    );
    const { rows: actions } = await pool.query(
      `SELECT description, due_date::text AS due_date, status FROM lesson_observation_actions WHERE observation_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    const { rows: photos } = await pool.query(
      `SELECT photo_url, caption FROM observation_photos WHERE observation_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    const { rows: schRows } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);
    if (!schRows.length) return res.status(404).json({ error: 'School not found' });

    const pdfBuffer = await generateObservationReportPDFBuffer(obs, scores, actions, photos, schRows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="lesson-observation-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

module.exports = router;
