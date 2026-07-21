const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');

router.use(authenticate, requireActiveSubscription);

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getOrCreateSubmission(schoolId, yearId, semester, subject, className, teacherId) {
  const { rows } = await pool.query(
    `INSERT INTO result_submissions (school_id, academic_year_id, semester, subject, class_name, teacher_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (school_id, academic_year_id, semester, subject, class_name) DO NOTHING
     RETURNING *`,
    [schoolId, yearId, semester, subject, className, teacherId]
  );
  if (rows.length) return rows[0];
  const { rows: existing } = await pool.query(
    `SELECT * FROM result_submissions WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5`,
    [schoolId, yearId, semester, subject, className]
  );
  return existing[0];
}

async function notifyTeacher(schoolId, teacherId, title, message, emailBody = null) {
  try {
    await createNotification(schoolId, teacherId, title, message);
    if (emailBody) {
      const { rows } = await pool.query(`SELECT email FROM teachers WHERE id=$1`, [teacherId]);
      if (rows[0]?.email) await sendTeacherEmail(rows[0].email, title, emailBody);
    }
  } catch (e) { /* non-fatal */ }
}

// Check whether the requesting teacher is a HOD and attach hodDept/programmeId context.
// Returns null if not a HOD (and not admin).
async function resolveHodContext(req) {
  if (req.user.role === 'admin') {
    return { isHod: true, hodDept: null, programmeId: null, isSubjectHod: false };
  }

  const [
    { rows: deptRows },
    { rows: officeRows },
    { rows: respRows },
  ] = await Promise.all([
    // Path 1: departments.head_teacher_id (set via Departments admin page)
    pool.query(
      `SELECT d.name AS dept_name FROM departments d
       WHERE d.school_id = $1 AND d.head_teacher_id = $2 LIMIT 1`,
      [req.schoolId, req.user.id]
    ),
    // Path 2: clearance_office_staff (supports programme HODs with linked_programme_id)
    pool.query(
      `SELECT co.linked_programme_id, p.name AS programme_name
       FROM clearance_office_staff cos
       JOIN clearance_offices co ON co.id = cos.office_id
       LEFT JOIN programs p ON p.id = co.linked_programme_id
       WHERE cos.school_id = $1 AND cos.teacher_id = $2
         AND co.office_type = 'hod' AND co.is_active = true
       LIMIT 1`,
      [req.schoolId, req.user.id]
    ),
    // Path 3: teacher_responsibility_assignments (subject HOD via responsibilities module)
    pool.query(
      `SELECT 1 FROM teacher_responsibility_assignments tra
       JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
       WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key = 'hod'
       LIMIT 1`,
      [req.user.id, req.schoolId]
    ),
  ]);

  if (!deptRows.length && !officeRows.length && !respRows.length) return null;

  // Path 1: Departments page HOD — always a subject HOD; never look up programme by name
  if (deptRows.length) {
    return { isHod: true, hodDept: deptRows[0].dept_name, programmeId: null, isSubjectHod: true };
  }

  // Paths 2 & 3 need the teacher's department field
  const { rows: tRows } = await pool.query(
    `SELECT department FROM teachers WHERE id = $1 AND school_id = $2 LIMIT 1`,
    [req.user.id, req.schoolId]
  );
  const hodDept = tRows[0]?.department ?? null;

  // Path 2: clearance-office — may be a programme HOD
  if (officeRows.length) {
    let programmeId = officeRows[0].linked_programme_id ?? null;
    // Only on this path: fallback to matching dept name against programme names
    if (!programmeId && hodDept) {
      const { rows: pRows } = await pool.query(
        `SELECT id FROM programs WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [req.schoolId, hodDept]
      );
      if (pRows.length) programmeId = pRows[0].id;
    }
    return { isHod: true, hodDept, programmeId, isSubjectHod: !programmeId };
  }

  // Path 3: responsibility assignment — always a subject HOD
  return { isHod: true, hodDept, programmeId: null, isSubjectHod: true };
}

// ── GET /my-status — teacher sees submission status for all their subjects this semester ─────
router.get('/my-status', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    // Find subjects this teacher teaches (from timetable)
    const { rows: subjects } = await pool.query(
      `SELECT DISTINCT tt.subject, TRIM(cls) AS class_name
       FROM timetable tt,
            LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
       WHERE tt.school_id = $1 AND tt.academic_year_id = $2 AND tt.teacher_id = $3`,
      [req.schoolId, academic_year_id, req.user.id]
    );
    if (!subjects.length) return res.json([]);

    // Get submission records for these subjects
    const { rows: subs } = await pool.query(
      `SELECT rs.subject, rs.class_name, rs.status, rs.submitted_at,
              rs.hod_comment, rs.final_comment, rs.rejected_reason, rs.rejected_at,
              rs.published_at, rs.hod_reviewed_at, rs.final_reviewed_at
       FROM result_submissions rs
       WHERE rs.school_id = $1 AND rs.academic_year_id = $2 AND rs.semester = $3`,
      [req.schoolId, academic_year_id, parseInt(semester)]
    );

    const subMap = new Map(subs.map(s => [`${s.subject}||${s.class_name}`, s]));

    const result = subjects.map(({ subject, class_name }) => {
      const sub = subMap.get(`${subject}||${class_name}`);
      return {
        subject, class_name,
        status:            sub?.status ?? 'draft',
        submitted_at:      sub?.submitted_at ?? null,
        hod_comment:       sub?.hod_comment ?? null,
        final_comment:     sub?.final_comment ?? null,
        rejected_reason:   sub?.rejected_reason ?? null,
        rejected_at:       sub?.rejected_at ?? null,
        published_at:      sub?.published_at ?? null,
        hod_reviewed_at:   sub?.hod_reviewed_at ?? null,
        final_reviewed_at: sub?.final_reviewed_at ?? null,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /hod-queue — HOD sees submitted entries in their dept ──────────────────
router.get('/hod-queue', async (req, res, next) => {
  try {
    const hod = await resolveHodContext(req);
    if (!hod) {
      return res.status(403).json({ error: 'HOD access required' });
    }

    const { academic_year_id, semester } = req.query;

    let deptFilter = '';
    const params = [req.schoolId];

    if (req.user.role !== 'admin') {
      if (hod.programmeId) {
        // Programme HOD: filter by students' program_id
        params.push(hod.programmeId);
        deptFilter = `AND s.program_id = $${params.length}`;
      } else if (hod.hodDept) {
        // Subject HOD: show submissions from teachers in the same department
        params.push(hod.hodDept);
        deptFilter = `AND LOWER(t.department) = LOWER($${params.length})`;
      }
    }

    if (academic_year_id) { params.push(academic_year_id); deptFilter += ` AND rs.academic_year_id = $${params.length}`; }
    if (semester) { params.push(parseInt(semester)); deptFilter += ` AND rs.semester = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT rs.id, rs.subject, rs.class_name, rs.status, rs.submitted_at,
              rs.hod_comment, rs.rejected_reason,
              rs.academic_year_id,
              t.name AS teacher_name, t.id AS teacher_id,
              ay.name AS academic_year, rs.semester,
              (SELECT COUNT(*) FROM students st WHERE st.class_name = rs.class_name AND st.school_id = rs.school_id AND st.status = 'Active') AS student_count,
              (SELECT COUNT(DISTINCT student_id) FROM (
                SELECT es.student_id FROM exam_scores es
                WHERE es.academic_year_id = rs.academic_year_id AND es.semester = rs.semester
                  AND es.subject = rs.subject AND es.class_name = rs.class_name AND es.school_id = rs.school_id
                UNION
                SELECT asc2.student_id FROM assessment_scores asc2
                JOIN assessments a ON a.id = asc2.assessment_id
                WHERE a.academic_year_id = rs.academic_year_id AND a.semester = rs.semester
                  AND a.subject = rs.subject AND a.class_name = rs.class_name AND a.school_id = rs.school_id
                  AND asc2.score IS NOT NULL
              ) _scored) AS scored_count
       FROM result_submissions rs
       LEFT JOIN teachers t ON t.id = rs.teacher_id
       LEFT JOIN academic_years ay ON ay.id = rs.academic_year_id
       LEFT JOIN (SELECT DISTINCT class_name, program_id FROM students WHERE school_id = $1) s ON s.class_name = rs.class_name
       WHERE rs.school_id = $1 AND rs.status = 'submitted' ${deptFilter}
       ORDER BY rs.submitted_at ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /final-queue — admin sees hod_approved entries awaiting final approval ──
router.get('/final-queue', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    let filter = '';
    const params = [req.schoolId];
    if (academic_year_id) { params.push(academic_year_id); filter += ` AND rs.academic_year_id = $${params.length}`; }
    if (semester) { params.push(parseInt(semester)); filter += ` AND rs.semester = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT rs.id, rs.subject, rs.class_name, rs.status, rs.submitted_at,
              rs.hod_reviewed_at, rs.hod_comment,
              rs.final_reviewed_at, rs.final_comment, rs.rejected_reason,
              rs.published_at,
              t.name AS teacher_name,
              hod.name AS hod_name,
              ay.name AS academic_year, rs.semester,
              (SELECT COUNT(*) FROM students st WHERE st.class_name = rs.class_name AND st.school_id = rs.school_id AND st.status = 'Active') AS student_count
       FROM result_submissions rs
       LEFT JOIN teachers t   ON t.id = rs.teacher_id
       LEFT JOIN teachers hod ON hod.id = rs.hod_reviewed_by
       LEFT JOIN academic_years ay ON ay.id = rs.academic_year_id
       WHERE rs.school_id = $1 AND rs.status IN ('hod_approved','final_approved','published') ${filter}
       ORDER BY rs.hod_reviewed_at ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /readiness-check — preflight check before teacher submits ──────────────
router.get('/readiness-check', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const sem = parseInt(semester);
    const p   = [req.schoolId, academic_year_id, sem, subject, class_name];

    const [examRes, missingRes, totalRes, scoredExamRes, scoredCaRes] = await Promise.all([
      // A: any exam score entered?
      pool.query(
        `SELECT COUNT(*) AS cnt FROM exam_scores
         WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5`,
        p
      ),
      // B: CA modes with ca_contribution > 0 that have no assessment created yet
      pool.query(
        `SELECT m.name FROM assessment_modes m
         WHERE m.school_id=$1 AND m.ca_contribution > 0
           AND NOT EXISTS (
             SELECT 1 FROM assessments a
             WHERE a.school_id=$1 AND a.mode_id=m.id
               AND a.subject=$4 AND a.class_name=$5
               AND a.academic_year_id=$2 AND a.semester=$3
           )
         ORDER BY m.sort_order`,
        p
      ),
      // C: total active students in the class
      pool.query(
        `SELECT COUNT(*) AS cnt FROM students WHERE school_id=$1 AND class_name=$5 AND status='Active'`,
        p
      ),
      // D: students who already have an exam score
      pool.query(
        `SELECT COUNT(DISTINCT student_id) AS cnt FROM exam_scores
         WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5`,
        p
      ),
      // E: students who have at least one CA score
      pool.query(
        `SELECT COUNT(DISTINCT asc2.student_id) AS cnt
         FROM assessment_scores asc2
         JOIN assessments a ON a.id = asc2.assessment_id
         WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
           AND a.subject=$4 AND a.class_name=$5 AND asc2.score IS NOT NULL`,
        p
      ),
    ]);

    const examScoresEntered = parseInt(examRes.rows[0].cnt) > 0;
    const missingModes      = missingRes.rows.map(r => r.name);
    const totalStudents     = parseInt(totalRes.rows[0].cnt);
    const studentsWithoutExamScore = Math.max(0, totalStudents - parseInt(scoredExamRes.rows[0].cnt));
    const studentsWithoutAnyCA     = Math.max(0, totalStudents - parseInt(scoredCaRes.rows[0].cnt));

    res.json({
      examScoresEntered,
      missingModes,
      studentsWithoutExamScore,
      studentsWithoutAnyCA,
      totalStudents,
      canSubmit: examScoresEntered && missingModes.length === 0,
    });
  } catch (err) { next(err); }
});

// ── POST /submit — teacher submits a subject for HOD review ───────────────────
router.post('/submit', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }

    const sem = parseInt(semester);

    // Check A: end-of-semester exam scores must exist
    const { rows: examCheck } = await pool.query(
      `SELECT 1 FROM exam_scores
       WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5
       LIMIT 1`,
      [req.schoolId, academic_year_id, sem, subject, class_name]
    );
    if (!examCheck.length) {
      return res.status(400).json({ error: 'End-of-semester exam scores have not been entered yet. Please enter exam scores before submitting.' });
    }

    // Check B: every CA mode with a contribution must have at least one assessment
    const { rows: missingModes } = await pool.query(
      `SELECT m.name FROM assessment_modes m
       WHERE m.school_id=$1 AND m.ca_contribution > 0
         AND NOT EXISTS (
           SELECT 1 FROM assessments a
           WHERE a.school_id=$1 AND a.mode_id=m.id
             AND a.subject=$4 AND a.class_name=$5
             AND a.academic_year_id=$2 AND a.semester=$3
         )
       ORDER BY m.sort_order`,
      [req.schoolId, academic_year_id, sem, subject, class_name]
    );
    if (missingModes.length) {
      const names = missingModes.map(m => m.name).join(', ');
      return res.status(400).json({ error: `Missing assessments for: ${names}. Every CA mode must have at least one assessment before submitting.` });
    }

    const sub = await getOrCreateSubmission(req.schoolId, academic_year_id, sem, subject, class_name, req.user.id);

    if (!['draft', 'rejected'].includes(sub.status)) {
      return res.status(409).json({ error: `Cannot submit — current status is "${sub.status}".` });
    }

    await pool.query(
      `UPDATE result_submissions
       SET status='submitted', submitted_at=now(), teacher_id=$1,
           rejected_reason=NULL, rejected_at=NULL, rejected_by=NULL,
           hod_comment=NULL, final_comment=NULL
       WHERE id=$2`,
      [req.user.id, sub.id]
    );

    await logAudit(req.schoolId, 'RESULT_SUBMITTED', req.user.id, req.user.name,
      'result_submissions', sub.id, { subject, class_name, semester });

    // Notify HODs in this department (notify all HOD-assigned teachers)
    const { rows: hods } = await pool.query(
      `SELECT DISTINCT t.id FROM teachers t
       JOIN teacher_responsibility_assignments tra ON tra.teacher_id = t.id
       JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
       WHERE t.school_id=$1 AND tr.module_key='hod' AND t.status='Active'`,
      [req.schoolId]
    );
    for (const hod of hods) {
      await notifyTeacher(req.schoolId, hod.id,
        'New Result Submission',
        `${subject} (${class_name}) results submitted and awaiting your review.`);
    }

    res.json({ message: 'Submitted for HOD review.', submission_id: sub.id });
  } catch (err) { next(err); }
});

// ── POST /hod-review — HOD approves or rejects a submission ───────────────────
router.post('/hod-review', async (req, res, next) => {
  try {
    const hod = await resolveHodContext(req);
    if (!hod) {
      return res.status(403).json({ error: 'HOD access required' });
    }

    const { submission_id, action, comment } = req.body;
    if (!submission_id || !['approve','reject'].includes(action)) {
      return res.status(400).json({ error: 'submission_id and action (approve|reject) are required' });
    }
    if (action === 'reject' && !comment?.trim()) {
      return res.status(400).json({ error: 'A reason is required when rejecting.' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM result_submissions WHERE id=$1 AND school_id=$2`,
      [submission_id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
    const sub = rows[0];
    if (sub.status !== 'submitted') {
      return res.status(409).json({ error: `Cannot review — status is "${sub.status}"` });
    }

    if (action === 'approve') {
      await pool.query(
        `UPDATE result_submissions SET status='hod_approved', hod_reviewed_by=$1, hod_reviewed_at=now(), hod_comment=$2 WHERE id=$3`,
        [req.user.id, comment?.trim() || null, submission_id]
      );
      await logAudit(req.schoolId, 'RESULT_HOD_APPROVED', req.user.id, req.user.name,
        'result_submissions', submission_id, { subject: sub.subject, class_name: sub.class_name });
      if (sub.teacher_id) {
        const { rows: tr } = await pool.query(`SELECT name FROM teachers WHERE id=$1`, [sub.teacher_id]);
        const tName = tr[0]?.name || 'Teacher';
        const msg = `Your ${sub.subject} (${sub.class_name}) results have been approved by HOD and forwarded for final review.`;
        await notifyTeacher(req.schoolId, sub.teacher_id, 'Results Approved by HOD', msg,
          `Dear ${tName},\n\n${msg}\n\n— CAS`);
      }
    } else {
      await pool.query(
        `UPDATE result_submissions SET status='rejected', rejected_by=$1, rejected_at=now(), rejected_reason=$2, hod_comment=$2 WHERE id=$3`,
        [req.user.id, comment.trim(), submission_id]
      );
      await logAudit(req.schoolId, 'RESULT_HOD_REJECTED', req.user.id, req.user.name,
        'result_submissions', submission_id, { subject: sub.subject, class_name: sub.class_name, reason: comment.trim() });
      if (sub.teacher_id) {
        const { rows: tr } = await pool.query(`SELECT name FROM teachers WHERE id=$1`, [sub.teacher_id]);
        const tName = tr[0]?.name || 'Teacher';
        const msg = `Your ${sub.subject} (${sub.class_name}) results were returned by HOD. Reason: ${comment.trim()}`;
        await notifyTeacher(req.schoolId, sub.teacher_id, 'Results Returned by HOD', msg,
          `Dear ${tName},\n\n${msg}\n\nPlease revise and resubmit.\n\n— CAS`);
      }
    }

    res.json({ message: action === 'approve' ? 'Approved and forwarded for final review.' : 'Rejected and returned to teacher.' });
  } catch (err) { next(err); }
});

// ── POST /final-review — admin/head does final approval ───────────────────────
router.post('/final-review', adminOnly, async (req, res, next) => {
  try {
    const { submission_id, action, comment } = req.body;
    if (!submission_id || !['approve','reject'].includes(action)) {
      return res.status(400).json({ error: 'submission_id and action (approve|reject) are required' });
    }
    if (action === 'reject' && !comment?.trim()) {
      return res.status(400).json({ error: 'A reason is required when rejecting.' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM result_submissions WHERE id=$1 AND school_id=$2`,
      [submission_id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
    const sub = rows[0];
    if (sub.status !== 'hod_approved') {
      return res.status(409).json({ error: `Cannot do final review — status is "${sub.status}"` });
    }

    if (action === 'approve') {
      await pool.query(
        `UPDATE result_submissions SET status='final_approved', final_reviewed_by=$1, final_reviewed_at=now(), final_comment=$2 WHERE id=$3`,
        [req.user.id, comment?.trim() || null, submission_id]
      );
      await logAudit(req.schoolId, 'RESULT_FINAL_APPROVED', req.user.id, req.user.name,
        'result_submissions', submission_id, { subject: sub.subject, class_name: sub.class_name });
      if (sub.teacher_id) {
        const { rows: tr } = await pool.query(`SELECT name FROM teachers WHERE id=$1`, [sub.teacher_id]);
        const tName = tr[0]?.name || 'Teacher';
        const msg = `Your ${sub.subject} (${sub.class_name}) results have been finally approved and are ready for publication.`;
        await notifyTeacher(req.schoolId, sub.teacher_id, 'Results Finally Approved', msg,
          `Dear ${tName},\n\n${msg}\n\n— CAS`);
      }
    } else {
      await pool.query(
        `UPDATE result_submissions SET status='rejected', rejected_by=$1, rejected_at=now(), rejected_reason=$2, final_comment=$2 WHERE id=$3`,
        [req.user.id, comment.trim(), submission_id]
      );
      await logAudit(req.schoolId, 'RESULT_FINAL_REJECTED', req.user.id, req.user.name,
        'result_submissions', submission_id, { subject: sub.subject, class_name: sub.class_name, reason: comment.trim() });
      if (sub.teacher_id) {
        const { rows: tr } = await pool.query(`SELECT name FROM teachers WHERE id=$1`, [sub.teacher_id]);
        const tName = tr[0]?.name || 'Teacher';
        const msg = `Your ${sub.subject} (${sub.class_name}) results were returned by management. Reason: ${comment.trim()}`;
        await notifyTeacher(req.schoolId, sub.teacher_id, 'Results Returned by Management', msg,
          `Dear ${tName},\n\n${msg}\n\nPlease revise and resubmit.\n\n— CAS`);
      }
    }

    res.json({ message: action === 'approve' ? 'Final approval granted.' : 'Returned to teacher.' });
  } catch (err) { next(err); }
});

// ── POST /publish — admin publishes results (students can now see them) ────────
router.post('/publish', adminOnly, async (req, res, next) => {
  try {
    const { submission_id, academic_year_id, semester, class_name } = req.body;

    if (submission_id) {
      // Publish single submission
      const { rows } = await pool.query(
        `SELECT * FROM result_submissions WHERE id=$1 AND school_id=$2`,
        [submission_id, req.schoolId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
      if (rows[0].status !== 'final_approved') {
        return res.status(409).json({ error: 'Only final_approved submissions can be published.' });
      }
      await pool.query(
        `UPDATE result_submissions SET status='published', published_at=now() WHERE id=$1`,
        [submission_id]
      );
      await logAudit(req.schoolId, 'RESULT_PUBLISHED', req.user.id, req.user.name,
        'result_submissions', submission_id, { subject: rows[0].subject, class_name: rows[0].class_name });
      return res.json({ message: 'Published.', published: 1 });
    }

    // Bulk publish: all final_approved for a class/semester/year
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'submission_id or (academic_year_id + semester) required' });
    }
    let filter = 'AND school_id=$1 AND academic_year_id=$2 AND semester=$3 AND status=\'final_approved\'';
    const params = [req.schoolId, academic_year_id, parseInt(semester)];
    if (class_name) { params.push(class_name); filter += ` AND class_name=$${params.length}`; }

    const { rows: updated } = await pool.query(
      `UPDATE result_submissions SET status='published', published_at=now()
       WHERE ${filter.slice(4)} RETURNING id, subject, class_name`,
      params
    );
    await logAudit(req.schoolId, 'RESULTS_BULK_PUBLISHED', req.user.id, req.user.name,
      'result_submissions', null, { count: updated.length, academic_year_id, semester, class_name });
    res.json({ message: `${updated.length} submission(s) published.`, published: updated.length });
  } catch (err) { next(err); }
});

// ── POST /unlock — admin unlocks any submission back to draft ─────────────────
router.post('/unlock', adminOnly, async (req, res, next) => {
  try {
    const { submission_id, reason } = req.body;
    if (!submission_id || !reason?.trim()) {
      return res.status(400).json({ error: 'submission_id and reason are required' });
    }
    const { rows } = await pool.query(
      `UPDATE result_submissions
       SET status='draft', submitted_at=NULL, hod_reviewed_by=NULL, hod_reviewed_at=NULL,
           hod_comment=NULL, final_reviewed_by=NULL, final_reviewed_at=NULL, final_comment=NULL,
           rejected_at=NULL, rejected_by=NULL, rejected_reason=NULL, published_at=NULL
       WHERE id=$1 AND school_id=$2 RETURNING *`,
      [submission_id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
    await logAudit(req.schoolId, 'RESULT_UNLOCKED', req.user.id, req.user.name,
      'result_submissions', submission_id, { reason: reason.trim(), subject: rows[0].subject, class_name: rows[0].class_name });
    res.json({ message: 'Unlocked and returned to draft.' });
  } catch (err) { next(err); }
});

// ── GET /notifications — unread notifications for current user ────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, message, link, is_read, created_at
       FROM notifications
       WHERE school_id=$1 AND user_id=$2 AND user_type=$3
       ORDER BY created_at DESC LIMIT 50`,
      [req.schoolId, req.user.id, req.user.role === 'admin' ? 'admin' : 'teacher']
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /notifications/mark-read ─────────────────────────────────────────────
router.post('/notifications/mark-read', async (req, res, next) => {
  try {
    const { ids } = req.body; // array of notification IDs, or empty = mark all
    if (ids?.length) {
      await pool.query(
        `UPDATE notifications SET is_read=true WHERE school_id=$1 AND user_id=$2 AND id=ANY($3::uuid[])`,
        [req.schoolId, req.user.id, ids]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET is_read=true WHERE school_id=$1 AND user_id=$2`,
        [req.schoolId, req.user.id]
      );
    }
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
});

module.exports = router;
