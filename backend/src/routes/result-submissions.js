const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, adminOrManagement, requireActiveSubscription } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');
const { getClassRoster, mapWithLimit } = require('../services/classHistory.service');

// Resolves student_count/class_size per distinct (class_name, academic_year_id,
// semester[, subject]) combo in a result set via getClassRoster(), since a
// response can span many different batches/periods rather than just one.
// Pass subjectKey when every row carries its own subject (e.g. result_submissions
// rows) so an elective subject's count reflects only its enrolled students
// rather than the whole class. Mutates nothing; returns rows with the given
// key set to the resolved roster size.
async function attachRosterCounts(schoolId, rows, { classNameKey = 'class_name', yearKey = 'academic_year_id', semesterKey = 'semester', outKey = 'student_count', subjectKey = null } = {}) {
  const comboKey = r => `${r[classNameKey].toLowerCase()}|${r[yearKey]}|${r[semesterKey]}|${subjectKey ? r[subjectKey] : ''}`;
  const distinctCombos = [...new Map(rows.map(r => [comboKey(r), r])).values()];
  const entries = await mapWithLimit(distinctCombos, 3, async r =>
    [comboKey(r), (await getClassRoster(schoolId, r[classNameKey], r[yearKey], r[semesterKey], subjectKey ? { subject: r[subjectKey] } : {})).length]
  );
  const sizeMap = Object.fromEntries(entries);
  return rows.map(r => ({ ...r, [outKey]: sizeMap[comboKey(r)] ?? 0 }));
}

// Resolves scored_count (exam ∪ CA scores, distinct students) per row,
// bounded to that row's own (class, year, semester, subject) roster —
// otherwise a currently-inactive student's real historical score can push
// the count above the roster size, the same asymmetry fixed in
// assessment-monitoring.js and reports.js. Rosters are cached per subject
// combo (not just per class) since an elective subject's roster can now
// differ from its classmates' rosters for a different subject.
async function attachScoredCounts(schoolId, rows) {
  const classComboKey = r => `${r.class_name.toLowerCase()}|${r.academic_year_id}|${r.semester}`;
  const subjectComboKey = r => `${r.subject}|${classComboKey(r)}`;

  const distinctSubjectCombos = [...new Map(rows.map(r => [subjectComboKey(r), r])).values()];
  const rosterEntries = await mapWithLimit(distinctSubjectCombos, 3, async r =>
    [subjectComboKey(r), new Set(await getClassRoster(schoolId, r.class_name, r.academic_year_id, r.semester, { subject: r.subject }))]
  );
  const rosterMap = new Map(rosterEntries);

  const scoredEntries = await mapWithLimit(distinctSubjectCombos, 3, async r => {
    const { rows: scored } = await pool.query(
      `SELECT es.student_id FROM exam_scores es
       WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 AND es.subject=$4 AND es.class_name=$5
       UNION
       SELECT asc2.student_id FROM assessment_scores asc2
       JOIN assessments a ON a.id = asc2.assessment_id
       WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3 AND a.subject=$4 AND a.class_name=$5
         AND asc2.score IS NOT NULL`,
      [schoolId, r.academic_year_id, r.semester, r.subject, r.class_name]
    );
    const roster = rosterMap.get(subjectComboKey(r)) || new Set();
    return [subjectComboKey(r), scored.filter(s => roster.has(s.student_id)).length];
  });
  const scoredMap = Object.fromEntries(scoredEntries);
  return rows.map(r => ({ ...r, scored_count: scoredMap[subjectComboKey(r)] ?? 0 }));
}

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
    return { isHod: true, hodDept: null, hodDepts: [], programmeId: null, isSubjectHod: false };
  }

  const [
    { rows: deptRows },
    { rows: officeRows },
    { rows: respRows },
  ] = await Promise.all([
    // Path 1: departments.head_teacher_id (set via Departments admin page).
    // A teacher can head more than one department — collect all of them
    // (no LIMIT 1) so /hod-queue can show submissions from every department
    // they head, not just whichever one Postgres happens to return first.
    pool.query(
      `SELECT d.name AS dept_name FROM departments d
       WHERE d.school_id = $1 AND d.head_teacher_id = $2
       ORDER BY d.name`,
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
    return {
      isHod: true,
      hodDept: deptRows[0].dept_name,
      hodDepts: deptRows.map(r => r.dept_name),
      programmeId: null,
      isSubjectHod: true,
    };
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
    return { isHod: true, hodDept, hodDepts: hodDept ? [hodDept] : [], programmeId, isSubjectHod: !programmeId };
  }

  // Path 3: responsibility assignment — always a subject HOD
  return { isHod: true, hodDept, hodDepts: hodDept ? [hodDept] : [], programmeId: null, isSubjectHod: true };
}

// ── GET /my-status — teacher sees submission status for all their subjects this semester ─────
router.get('/my-status', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    // Find subjects this teacher teaches (from timetable), UNIONed with any
    // subject/class they already have real recorded work for this period
    // (an assessment, exam score, or their own result submission) — the
    // timetable has no history/effective-dating, so a mid-semester
    // reassignment would otherwise make this teacher's own past work
    // disappear from their own status list the moment an admin edits the
    // timetable, even though they genuinely did the work.
    const { rows: subjects } = await pool.query(
      `SELECT DISTINCT tt.subject, TRIM(cls) AS class_name
       FROM timetable tt,
            LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
       WHERE tt.school_id = $1 AND tt.academic_year_id = $2 AND tt.teacher_id = $3

       UNION

       SELECT DISTINCT a.subject, a.class_name
       FROM assessments a
       WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.teacher_id = $3

       UNION

       SELECT DISTINCT es.subject, es.class_name
       FROM exam_scores es
       WHERE es.school_id = $1 AND es.academic_year_id = $2 AND es.teacher_id = $3

       UNION

       SELECT DISTINCT rs.subject, rs.class_name
       FROM result_submissions rs
       WHERE rs.school_id = $1 AND rs.academic_year_id = $2 AND rs.teacher_id = $3`,
      [req.schoolId, academic_year_id, req.user.id]
    );
    if (!subjects.length) return res.json([]);

    // Get submission records for these subjects — scoped to THIS teacher's
    // own submissions. Matching by subject+class_name alone (with no teacher
    // filter) meant a newly-assigned teacher would see a slot as "already
    // submitted" based on the PREVIOUS teacher's real submission, which was
    // never theirs.
    const { rows: subs } = await pool.query(
      `SELECT rs.subject, rs.class_name, rs.status, rs.submitted_at,
              rs.hod_comment, rs.final_comment, rs.rejected_reason, rs.rejected_at,
              rs.published_at, rs.hod_reviewed_at, rs.final_reviewed_at
       FROM result_submissions rs
       WHERE rs.school_id = $1 AND rs.academic_year_id = $2 AND rs.semester = $3 AND rs.teacher_id = $4`,
      [req.schoolId, academic_year_id, parseInt(semester), req.user.id]
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
      } else if (hod.hodDepts?.length) {
        // Subject HOD: show submissions from teachers whose department matches
        // ANY department this HOD heads (a teacher can head more than one —
        // e.g. both ICT and Languages — and must see both queues, not just
        // whichever one resolveHodContext happened to return first), OR
        // whose teacher record IS the head_teacher_id of one of those
        // departments (covers the case where the HOD's own teachers.department
        // differs from departments.name).
        params.push(hod.hodDepts);
        const deptParam = params.length;
        deptFilter = `AND (
          LOWER(t.department) = ANY(SELECT LOWER(x) FROM unnest($${deptParam}::text[]) AS x)
          OR EXISTS (
            SELECT 1 FROM departments d
            WHERE d.school_id = $1
              AND LOWER(d.name) = ANY(SELECT LOWER(x) FROM unnest($${deptParam}::text[]) AS x)
              AND d.head_teacher_id = t.id
          )
        )`;
      }
    }

    if (academic_year_id) { params.push(academic_year_id); deptFilter += ` AND rs.academic_year_id = $${params.length}`; }
    if (semester) { params.push(parseInt(semester)); deptFilter += ` AND rs.semester = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT rs.id, rs.subject, rs.class_name, rs.status, rs.submitted_at,
              rs.hod_comment, rs.rejected_reason,
              rs.academic_year_id,
              t.name AS teacher_name, t.id AS teacher_id,
              ay.name AS academic_year, rs.semester
       FROM result_submissions rs
       LEFT JOIN teachers t ON t.id = rs.teacher_id
       LEFT JOIN academic_years ay ON ay.id = rs.academic_year_id
       LEFT JOIN (SELECT DISTINCT class_name, program_id FROM students WHERE school_id = $1) s ON s.class_name = rs.class_name
       WHERE rs.school_id = $1 AND rs.status = 'submitted' ${deptFilter}
       ORDER BY rs.submitted_at ASC`,
      params
    );
    const withScored = await attachScoredCounts(req.schoolId, rows);
    res.json(await attachRosterCounts(req.schoolId, withScored, { subjectKey: 'subject' }));
  } catch (err) { next(err); }
});

// ── GET /non-submitters/debug — diagnostic: simple counts from each source ────
router.get('/non-submitters/debug', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) return res.status(400).json({ error: 'academic_year_id and semester are required' });
    const sem = parseInt(semester);
    const p = [req.schoolId, academic_year_id, sem];

    // Helper: run a query and return {cnt, error} — never throws
    const safe = async (sql, params) => {
      try { const r = await pool.query(sql, params); return { cnt: Number(r.rows[0]?.cnt ?? r.rows[0]?.total ?? -1), rows: r.rows }; }
      catch (e) { console.error('[debug safe]', e?.message); return { cnt: null, error: e?.message, rows: [] }; }
    };

    // 1. Raw timetable row count (simple — no LATERAL)
    const tt = await safe(
      `SELECT COUNT(*) AS cnt FROM timetable WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3`, p);

    // 2. Timetable distinct combos after LATERAL unnest
    const ttDistinct = await safe(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT DISTINCT tt.teacher_id, tt.subject, TRIM(cls) AS class_name
         FROM timetable tt
         CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
         WHERE tt.school_id=$1 AND tt.academic_year_id=$2 AND tt.semester=$3
       ) x`, p);

    // 3. Timetable + teachers join (checks teacher records exist)
    const ttJoined = await safe(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT DISTINCT tt.teacher_id, tt.subject, TRIM(cls) AS class_name
         FROM timetable tt
         JOIN teachers te ON te.id = tt.teacher_id AND te.school_id = $1
         CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
         WHERE tt.school_id=$1 AND tt.academic_year_id=$2 AND tt.semester=$3
       ) x`, p);

    // 4. Raw assessment count
    const assess = await safe(
      `SELECT COUNT(*) AS cnt, COUNT(teacher_id) AS with_tid
       FROM assessments WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3`, p);

    // 5. Assessments after joining teachers
    const assessJoined = await safe(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT DISTINCT a.teacher_id, a.subject, a.class_name
         FROM assessments a
         JOIN teachers te ON te.id = a.teacher_id AND te.school_id = $1
         WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
           AND a.teacher_id IS NOT NULL
       ) x`, p);

    // 6. Raw exam score count
    const exam = await safe(
      `SELECT COUNT(*) AS cnt FROM exam_scores WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3`, p);

    // 7. Submissions by status
    const rsStatus = await pool.query(
      `SELECT status, COUNT(*) AS cnt FROM result_submissions
       WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3
       GROUP BY status ORDER BY cnt DESC`, p);

    // 8. Full UNION candidate count
    const unionCount = await safe(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT DISTINCT tt.teacher_id, tt.subject, TRIM(cls) AS class_name
         FROM timetable tt
         JOIN teachers te ON te.id = tt.teacher_id AND te.school_id = $1
         CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
         WHERE tt.school_id=$1 AND tt.academic_year_id=$2 AND tt.semester=$3
         UNION
         SELECT DISTINCT a.teacher_id, a.subject, a.class_name
         FROM assessments a
         JOIN teachers te2 ON te2.id = a.teacher_id AND te2.school_id = $1
         WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3 AND a.teacher_id IS NOT NULL
         UNION
         SELECT DISTINCT es.teacher_id, es.subject, es.class_name
         FROM exam_scores es
         JOIN teachers te3 ON te3.id = es.teacher_id AND te3.school_id = $1
         WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 AND es.teacher_id IS NOT NULL
         UNION
         SELECT DISTINCT rs2.teacher_id, rs2.subject, rs2.class_name
         FROM result_submissions rs2
         WHERE rs2.school_id=$1 AND rs2.academic_year_id=$2 AND rs2.semester=$3 AND rs2.status IN ('draft','rejected')
       ) all_c`, p);

    // 9. Sample timetable rows
    const ttSample = await safe(
      `SELECT tt.teacher_id, te.name AS teacher_name, tt.subject, tt.class_names
       FROM timetable tt
       LEFT JOIN teachers te ON te.id = tt.teacher_id
       WHERE tt.school_id=$1 AND tt.academic_year_id=$2 AND tt.semester=$3
       LIMIT 5`, p);

    // 10. Sample submission rows
    const rsSample = await safe(
      `SELECT rs.subject, rs.class_name, rs.status, t.name AS teacher_name
       FROM result_submissions rs
       LEFT JOIN teachers t ON t.id = rs.teacher_id
       WHERE rs.school_id=$1 AND rs.academic_year_id=$2 AND rs.semester=$3
       LIMIT 5`, p);

    res.json({
      params: { academic_year_id, semester: sem, school_id: req.schoolId },
      source_counts: {
        timetable_raw_rows: tt.cnt,         timetable_raw_error: tt.error,
        timetable_distinct_teacher_subject_class: ttDistinct.cnt, timetable_distinct_error: ttDistinct.error,
        timetable_after_teacher_join: ttJoined.cnt,  timetable_join_error: ttJoined.error,
        timetable_total_all_years: null,
        assessments: { total: assess.rows[0] ? Number(assess.rows[0].cnt) : null, with_teacher_id: assess.rows[0] ? Number(assess.rows[0].with_tid) : null },
        assessments_error: assess.error,
        assessments_after_teacher_join: assessJoined.cnt, assessments_join_error: assessJoined.error,
        exam_scores: { total: exam.cnt }, exam_error: exam.error,
        result_submissions_by_status: rsStatus.rows.map(r => ({ status: r.status, count: Number(r.cnt) })),
      },
      pipeline: {
        total_union_candidates: unionCount.cnt,
        union_error: unionCount.error,
        final_non_submitter_count: null,
        timetable_candidates_with_no_submission: null,
        timetable_candidates_excluded_by_existing_submission: null,
      },
      samples: {
        timetable_rows: ttSample.rows,
        submission_rows: rsSample.rows,
      },
    });
  } catch (err) {
    console.error('[non-submitters/debug]', err?.message);
    next(err);
  }
});

// ── GET /non-submitters — teachers with no/draft/rejected submission ──────────
// Four sources are unioned so teachers without timetable entries are caught:
//   1. Timetable: scheduled teacher→subject→class for this year/sem
//   2. Assessments: teacher who created CA assessments for this year/sem
//   3. Exam scores: teacher who entered exam scores for this year/sem
//   4. result_submissions draft/rejected: started but not completed
router.get('/non-submitters', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    const sem = parseInt(semester);
    const { rows } = await pool.query(
      `WITH candidates AS (
         -- 1. Timetable assignments
         SELECT DISTINCT tt.teacher_id, te.name AS teacher_name,
                tt.subject, TRIM(cls) AS class_name
         FROM timetable tt
         JOIN teachers te ON te.id = tt.teacher_id AND te.school_id = $1
         CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
         WHERE tt.school_id = $1 AND tt.academic_year_id = $2 AND tt.semester = $3

         UNION

         -- 2. Assessments (CA marks entered by teacher)
         SELECT DISTINCT a.teacher_id, te.name AS teacher_name,
                a.subject, a.class_name
         FROM assessments a
         JOIN teachers te ON te.id = a.teacher_id AND te.school_id = $1
         WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
           AND a.teacher_id IS NOT NULL

         UNION

         -- 3. Exam scores entered by teacher
         SELECT DISTINCT es.teacher_id, te.name AS teacher_name,
                es.subject, es.class_name
         FROM exam_scores es
         JOIN teachers te ON te.id = es.teacher_id AND te.school_id = $1
         WHERE es.school_id = $1 AND es.academic_year_id = $2 AND es.semester = $3
           AND es.teacher_id IS NOT NULL

         UNION

         -- 4. Draft / rejected submissions (started but not completed)
         SELECT DISTINCT rs2.teacher_id, te.name AS teacher_name,
                rs2.subject, rs2.class_name
         FROM result_submissions rs2
         JOIN teachers te ON te.id = rs2.teacher_id AND te.school_id = $1
         WHERE rs2.school_id = $1 AND rs2.academic_year_id = $2 AND rs2.semester = $3
           AND rs2.status IN ('draft', 'rejected')
       )
       SELECT DISTINCT ON (c.teacher_id, LOWER(c.subject), LOWER(c.class_name))
         c.teacher_id,
         c.teacher_name,
         (SELECT d.name FROM department_teachers dt
          JOIN departments d ON d.id = dt.department_id
          WHERE dt.teacher_id = c.teacher_id LIMIT 1) AS department,
         c.subject,
         c.class_name,
         COALESCE(rs.status, 'not_started') AS submission_status,
         rs.id AS submission_id
       FROM candidates c
       LEFT JOIN result_submissions rs
         ON  rs.school_id        = $1
         AND rs.academic_year_id = $2
         AND rs.semester         = $3
         AND rs.teacher_id       = c.teacher_id
         AND LOWER(rs.subject)   = LOWER(c.subject)
         AND LOWER(rs.class_name)= LOWER(c.class_name)
       WHERE rs.id IS NULL OR rs.status IN ('draft', 'rejected')
       ORDER BY c.teacher_id, LOWER(c.subject), LOWER(c.class_name), c.teacher_name`,
      [req.schoolId, academic_year_id, sem]
    );
    rows.sort((a, b) =>
      a.teacher_name.localeCompare(b.teacher_name) ||
      a.subject.localeCompare(b.subject) ||
      a.class_name.localeCompare(b.class_name)
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /final-queue/counts — status tally only, for dashboard widgets ──
// /final-queue enriches every row with a roster count (attachRosterCounts),
// which for a period with many subject/class combos can take 20-30s+ — far
// too slow for a summary widget that only wants counts by status. One GROUP
// BY query instead.
router.get('/final-queue/counts', adminOrManagement, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    let filter = '';
    const params = [req.schoolId];
    if (academic_year_id) { params.push(academic_year_id); filter += ` AND academic_year_id = $${params.length}`; }
    if (semester) { params.push(parseInt(semester)); filter += ` AND semester = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS n
       FROM result_submissions
       WHERE school_id = $1 AND status IN ('submitted','hod_approved','final_approved','published') ${filter}
       GROUP BY status`,
      params
    );
    const counts = {};
    for (const r of rows) counts[r.status] = r.n;
    res.json(counts);
  } catch (err) { next(err); }
});

// ── GET /final-queue — admin sees hod_approved entries awaiting final approval ──
// Also readable by the principal/vice-principal management portal, which
// surfaces the same counts as a dashboard "pipeline" summary.
router.get('/final-queue', adminOrManagement, async (req, res, next) => {
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
              rs.academic_year_id,
              t.name AS teacher_name,
              hod.name AS hod_name,
              assigned_hod.name AS assigned_hod_name,
              ay.name AS academic_year, rs.semester
       FROM result_submissions rs
       LEFT JOIN teachers t   ON t.id = rs.teacher_id
       LEFT JOIN teachers hod ON hod.id = rs.hod_reviewed_by
       LEFT JOIN academic_years ay ON ay.id = rs.academic_year_id
       LEFT JOIN department_subjects ds ON ds.school_id = rs.school_id AND LOWER(ds.subject) = LOWER(rs.subject)
       LEFT JOIN departments dept ON dept.id = ds.department_id
       LEFT JOIN teachers assigned_hod ON assigned_hod.id = dept.head_teacher_id
       WHERE rs.school_id = $1 AND rs.status IN ('submitted','hod_approved','final_approved','published') ${filter}
       ORDER BY rs.submitted_at ASC`,
      params
    );
    // hod_name is who actually reviewed (null until that happens); for rows
    // still awaiting review, show who the row is actually waiting ON — the
    // subject's assigned department head — so the admin isn't staring at a
    // blank "HOD" column with no way to tell who's supposed to act.
    const withHod = rows.map(r => ({ ...r, hod_name: r.hod_name ?? r.assigned_hod_name }));
    res.json(await attachRosterCounts(req.schoolId, withHod, { subjectKey: 'subject' }));
  } catch (err) { next(err); }
});

// ── GET /submission-readiness — admin sees the same score-completeness checks ──
// identical gate logic to /submit so academics see exactly what blocked/passed
router.get('/submission-readiness', adminOnly, async (req, res, next) => {
  try {
    const { submission_id } = req.query;
    if (!submission_id) return res.status(400).json({ error: 'submission_id is required' });

    const { rows: subRows } = await pool.query(
      `SELECT subject, class_name, academic_year_id, semester
       FROM result_submissions WHERE id=$1 AND school_id=$2`,
      [submission_id, req.schoolId]
    );
    if (!subRows.length) return res.status(404).json({ error: 'Submission not found' });

    const { subject, class_name, academic_year_id, semester } = subRows[0];
    const sem = parseInt(semester);
    const p   = [req.schoolId, academic_year_id, sem, subject, class_name];

    const roster = await getClassRoster(req.schoolId, class_name, academic_year_id, sem, { subject });

    const [examRes, missingModesRes, incompleteRes] = await Promise.all([
      // roster students with an exam score for this subject, resolved as of
      // this submission's own period rather than current class_name/status
      pool.query(
        `SELECT COUNT(DISTINCT es.student_id)::int AS cnt
         FROM exam_scores es
         WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3
           AND LOWER(es.subject)=LOWER($4) AND LOWER(es.class_name)=LOWER($5)
           AND es.score IS NOT NULL
           AND es.student_id = ANY($6::uuid[])`,
        [...p, roster]
      ),
      // CA modes with ca_contribution > 0 that have no assessment created yet
      pool.query(
        `SELECT m.name FROM assessment_modes m
         WHERE m.school_id=$1 AND m.ca_contribution > 0
           AND NOT EXISTS (
             SELECT 1 FROM assessments a
             WHERE a.school_id=$1 AND a.mode_id=m.id
               AND LOWER(a.subject)=LOWER($4) AND LOWER(a.class_name)=LOWER($5)
               AND a.academic_year_id=$2 AND a.semester=$3
           )
         ORDER BY m.sort_order`,
        p
      ),
      // assessments where some students are still not acted on (no score & not absent) —
      // from ANY teacher sharing this subject/class/period, same as POST /submit's check,
      // so a co-teacher's leftover assessment is visible to the admin by name, not just a block.
      pool.query(
        `SELECT a.id,
                COALESCE(a.title, m.name || ' #' || ROW_NUMBER() OVER (PARTITION BY a.mode_id ORDER BY a.created_at)) AS label,
                m.name AS mode_name,
                COALESCE(t.name, 'a former teacher') AS teacher_name,
                COUNT(DISTINCT CASE WHEN (sc.score IS NOT NULL OR sc.absent = true) AND sc.student_id = ANY($6::uuid[]) THEN sc.student_id END)::int AS acted_on
         FROM assessments a
         JOIN assessment_modes m ON m.id = a.mode_id
         LEFT JOIN teachers t ON t.id = a.teacher_id
         LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
         WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
           AND LOWER(a.subject)=LOWER($4) AND LOWER(a.class_name)=LOWER($5)
         GROUP BY a.id, m.name, m.id, t.name`,
        [...p, roster]
      ),
    ]);

    const totalStudents  = roster.length;
    const examScoredCount = examRes.rows[0].cnt;
    const examComplete   = totalStudents > 0 && examScoredCount === totalStudents;
    const missingModes   = missingModesRes.rows.map(r => r.name);
    const assessments    = incompleteRes.rows.map(r => ({
      label:       r.label,
      modeName:    r.mode_name,
      teacherName: r.teacher_name,
      actedOn:     r.acted_on,
      total:       totalStudents,
      complete:    r.acted_on >= totalStudents,
    }));

    res.json({
      totalStudents,
      examScoredCount,
      examComplete,
      missingModes,
      assessments,
      canApprove: examComplete && missingModes.length === 0 && assessments.every(a => a.complete),
    });
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
    const roster = await getClassRoster(req.schoolId, class_name, academic_year_id, sem, { subject });
    const totalStudents = roster.length;

    const [examRes, missingRes, scoredExamRes, scoredCaRes, incompleteRes] = await Promise.all([
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
      // D: roster students who already have an exam score, resolved as of
      // this period rather than current class_name/status
      pool.query(
        `SELECT COUNT(DISTINCT es.student_id) AS cnt
         FROM exam_scores es
         WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3
           AND es.subject=$4 AND es.class_name=$5
           AND es.student_id = ANY($6::uuid[])`,
        [...p, roster]
      ),
      // E: students who have at least one CA score
      pool.query(
        `SELECT COUNT(DISTINCT asc2.student_id) AS cnt
         FROM assessment_scores asc2
         JOIN assessments a ON a.id = asc2.assessment_id
         WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
           AND a.subject=$4 AND a.class_name=$5 AND asc2.score IS NOT NULL
           AND asc2.student_id = ANY($6::uuid[])`,
        [...p, roster]
      ),
      // F: assessments where some students are still not acted on — from ANY
      // teacher sharing this subject/class/period, not just the caller, so a
      // co-teacher's incomplete assessment shows up here before the teacher
      // even attempts to submit (POST /submit enforces the same check).
      pool.query(
        `SELECT a.id, a.teacher_id, COALESCE(t.name, 'a former teacher') AS teacher_name,
                COALESCE(a.title, m.name || ' #' || ROW_NUMBER() OVER (PARTITION BY a.mode_id ORDER BY a.created_at)) AS label,
                m.name AS mode_name,
                COUNT(DISTINCT CASE WHEN (sc.score IS NOT NULL OR sc.absent = true) AND sc.student_id = ANY($6::uuid[]) THEN sc.student_id END)::int AS acted_on
         FROM assessments a
         JOIN assessment_modes m ON m.id = a.mode_id
         LEFT JOIN teachers t ON t.id = a.teacher_id
         LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
         WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
           AND LOWER(a.subject)=LOWER($4) AND LOWER(a.class_name)=LOWER($5)
         GROUP BY a.id, a.teacher_id, t.name, m.name, m.id
         HAVING COUNT(DISTINCT CASE WHEN (sc.score IS NOT NULL OR sc.absent = true) AND sc.student_id = ANY($6::uuid[]) THEN sc.student_id END) < $7`,
        [...p, roster, totalStudents]
      ),
    ]);

    const examScoredCount  = parseInt(scoredExamRes.rows[0].cnt);
    const examComplete     = totalStudents > 0 && examScoredCount === totalStudents;
    const missingModes     = missingRes.rows.map(r => r.name);
    const studentsWithoutAnyCA = Math.max(0, totalStudents - parseInt(scoredCaRes.rows[0].cnt));
    const incompleteAssessments = incompleteRes.rows.map(r => ({
      id:          r.id,
      label:       r.label,
      modeName:    r.mode_name,
      actedOn:     r.acted_on,
      teacherName: r.teacher_name,
      isOwn:       r.teacher_id === req.user.id,
    }));

    res.json({
      examScoredCount,
      examComplete,
      totalStudents,
      missingModes,
      incompleteAssessments,
      studentsWithoutAnyCA,
      canSubmit: examComplete && missingModes.length === 0 && incompleteAssessments.length === 0,
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
    const p   = [req.schoolId, academic_year_id, sem, subject, class_name];

    // Roster resolved as of this submission's own period, not current
    // class_name/status (used in every check below).
    const roster = await getClassRoster(req.schoolId, class_name, academic_year_id, sem, { subject });
    const totalStudents = roster.length;

    // Check A: ALL roster students must have exam scores entered
    const { rows: examRows } = await pool.query(
      `SELECT COUNT(DISTINCT es.student_id)::int AS cnt
       FROM exam_scores es
       WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3
         AND LOWER(es.subject)=LOWER($4) AND LOWER(es.class_name)=LOWER($5)
         AND es.score IS NOT NULL
         AND es.student_id = ANY($6::uuid[])`,
      [...p, roster]
    );
    const examScored = examRows[0]?.cnt ?? 0;
    if (examScored < totalStudents) {
      const missing = totalStudents - examScored;
      return res.status(400).json({
        error: `Exam scores incomplete: ${missing} of ${totalStudents} student${missing !== 1 ? 's' : ''} ${missing !== 1 ? 'are' : 'is'} missing exam scores. Enter a score (or 0) for every student before submitting.`,
      });
    }

    // Check B: every CA mode with a contribution must have at least one assessment
    // scoped to the submitting teacher (consistent with the teacher's UI view).
    const { rows: missingModes } = await pool.query(
      `SELECT m.name FROM assessment_modes m
       WHERE m.school_id=$1 AND m.ca_contribution > 0
         AND NOT EXISTS (
           SELECT 1 FROM assessments a
           WHERE a.school_id=$1 AND a.mode_id=m.id
             AND LOWER(a.subject)=LOWER($4) AND LOWER(a.class_name)=LOWER($5)
             AND a.academic_year_id=$2 AND a.semester=$3
             AND a.teacher_id = $6
         )
       ORDER BY m.sort_order`,
      [...p, req.user.id]
    );
    if (missingModes.length) {
      const names = missingModes.map(m => m.name).join(', ');
      return res.status(400).json({ error: `Missing assessments for: ${names}. Every CA mode must have at least one assessment before submitting.` });
    }

    // Check C: every CA assessment for this subject/class/period — from ANY
    // teacher, not just the submitter — must have ALL students acted on
    // (scored or absent). A shared subject's CA grade is computed from every
    // teacher's assessments, so a co-teacher's incomplete one blocks the
    // subject regardless of who created it. Scoped to the whole subject+
    // class+period (not teacher_id) specifically so a co-teacher's leftover
    // or forgotten assessment can't silently sit in the table and only
    // surface as a mysterious block at HOD/admin approval — the submitting
    // teacher is told exactly whose assessment is holding things up.
    const { rows: incomplete } = await pool.query(
      `SELECT a.id, a.teacher_id,
              COALESCE(t.name, 'a former teacher') AS teacher_name,
              COALESCE(a.title, m.name || ' #' || ROW_NUMBER() OVER (PARTITION BY a.mode_id ORDER BY a.created_at)) AS label,
              COUNT(DISTINCT CASE WHEN (sc.score IS NOT NULL OR sc.absent = true) AND sc.student_id = ANY($6::uuid[]) THEN sc.student_id END)::int AS acted_on
       FROM assessments a
       JOIN assessment_modes m ON m.id = a.mode_id
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
       WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
         AND LOWER(a.subject)=LOWER($4) AND LOWER(a.class_name)=LOWER($5)
       GROUP BY a.id, a.teacher_id, t.name, m.name, m.id
       HAVING COUNT(DISTINCT CASE WHEN (sc.score IS NOT NULL OR sc.absent = true) AND sc.student_id = ANY($6::uuid[]) THEN sc.student_id END) < $7`,
      [...p, roster, totalStudents]
    );
    if (incomplete.length) {
      const own = incomplete.filter(a => a.teacher_id === req.user.id);
      const others = incomplete.filter(a => a.teacher_id !== req.user.id);
      const sentences = [];
      if (own.length) {
        const names = own.map(a => `"${a.label}" (${a.acted_on}/${totalStudents})`).join(', ');
        sentences.push(`You have an incomplete assessment: ${names}.`);
      }
      if (others.length) {
        const byTeacher = new Map();
        for (const a of others) {
          if (!byTeacher.has(a.teacher_name)) byTeacher.set(a.teacher_name, []);
          byTeacher.get(a.teacher_name).push(`"${a.label}" (${a.acted_on}/${totalStudents})`);
        }
        for (const [teacherName, labels] of byTeacher) {
          sentences.push(`Co-teacher ${teacherName} has an incomplete assessment for this subject: ${labels.join(', ')}.`);
        }
      }
      return res.status(400).json({
        error: `Cannot submit — not every student has a score or an absence marked yet. ${sentences.join(' ')} All students must have a score or be marked absent before this subject can be submitted.`,
      });
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
