const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { getClassRoster, mapWithLimit } = require('../services/classHistory.service');

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/assessment-monitoring?academic_year_id=&semester=&department=&teacher_id=
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, department, teacher_id } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    const semInt = parseInt(semester);

    // ── 1. All CA modes for this school ────────────────────────────────────────
    const { rows: modes } = await pool.query(
      `SELECT id, name, ca_contribution, max_instances, sort_order
       FROM assessment_modes WHERE school_id = $1
       ORDER BY sort_order, name`,
      [req.schoolId]
    );

    // ── 2. Build optional teacher/department filters ───────────────────────────
    const extraConds = [];
    const params = [req.schoolId, academic_year_id, semInt];
    if (department) { params.push(department); extraConds.push(`te.department = $${params.length}`); }
    if (teacher_id) { params.push(teacher_id); extraConds.push(`te.id = $${params.length}`); }
    const extraWhere = extraConds.length ? 'AND ' + extraConds.join(' AND ') : '';

    // ── 3. Timetable matrix (teacher × subject × class) ───────────────────────
    // Rows come from the CURRENT timetable, UNIONed with any teacher who
    // actually has real recorded work (an assessment, exam score, or result
    // submission) for a subject/class this period — the timetable has no
    // history/effective-dating, so a mid-semester reassignment would
    // otherwise make the outgoing teacher's already-completed CA work
    // silently vanish from this view (looking like it was never started)
    // the moment an admin edits the slot, while the incoming teacher shows
    // 0 progress on work they never touched. This keeps both accurate.
    const { rows } = await pool.query(`
      WITH expanded AS (
        SELECT DISTINCT
          t.teacher_id,
          LOWER(t.subject) AS subject_key,
          t.subject,
          TRIM(cls) AS class_name
        FROM timetable t,
             LATERAL unnest(string_to_array(t.class_names, ',')) AS cls
        WHERE t.school_id=$1 AND t.academic_year_id=$2 AND t.semester=$3

        UNION

        SELECT DISTINCT a.teacher_id, LOWER(a.subject) AS subject_key, a.subject, a.class_name
        FROM assessments a
        WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3

        UNION

        SELECT DISTINCT es.teacher_id, LOWER(es.subject) AS subject_key, es.subject, es.class_name
        FROM exam_scores es
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3

        UNION

        SELECT DISTINCT rs.teacher_id, LOWER(rs.subject) AS subject_key, rs.subject, rs.class_name
        FROM result_submissions rs
        WHERE rs.school_id=$1 AND rs.academic_year_id=$2 AND rs.semester=$3
      )
      SELECT
        e.teacher_id,
        te.name        AS teacher_name,
        te.department,
        e.subject,
        e.class_name,
        (SELECT rs.status FROM result_submissions rs
         WHERE rs.school_id=$1 AND rs.teacher_id=e.teacher_id
           AND rs.academic_year_id=$2 AND rs.semester=$3
           AND LOWER(rs.subject)=e.subject_key
           AND LOWER(rs.class_name)=LOWER(e.class_name)
         LIMIT 1
        ) AS submission_status
      FROM expanded e
      JOIN teachers te ON te.id=e.teacher_id AND te.school_id=$1
      WHERE TRUE ${extraWhere}
      ORDER BY te.name, e.subject, e.class_name
    `, params);

    // ── 3b. Roster per distinct class, resolved as of this period via
    //        class_history rather than current class_name — this is what
    //        keeps the completion % denominator correct after promotion.
    //        The same roster also bounds the *numerator* below: a student
    //        can have a real score yet no longer belong to this period's
    //        resolved roster (e.g. they were deactivated after being
    //        scored), and without this, students_scored could exceed
    //        total_students — a number that's visibly nonsensical wherever
    //        it's displayed as "N / total", most noticeably once a filter
    //        narrows the view down to one teacher's few rows.
    const distinctClasses = [...new Set(rows.map(r => r.class_name))];
    const rosterByClass = await mapWithLimit(distinctClasses, 3, async cls =>
      [cls.toLowerCase(), await getClassRoster(req.schoolId, cls, academic_year_id, semInt)]
    );
    const rosterCountMap = Object.fromEntries(rosterByClass.map(([key, ids]) => [key, ids.length]));
    const rosterClassKeys  = [];
    const rosterStudentIds = [];
    for (const [key, ids] of rosterByClass) {
      for (const id of ids) { rosterClassKeys.push(key); rosterStudentIds.push(id); }
    }

    // ── 4. Per-(teacher, subject, class, mode) assessment + score counts ───────
    const { rows: modeCounts } = await pool.query(
      `SELECT
         a.teacher_id,
         LOWER(a.subject)     AS subject_key,
         LOWER(a.class_name)  AS class_key,
         a.mode_id,
         COUNT(DISTINCT a.id)::int                                                                                                       AS assessments_created,
         COUNT(DISTINCT CASE WHEN (asc2.score IS NOT NULL OR asc2.absent = true) AND roster.student_id IS NOT NULL THEN asc2.student_id END)::int AS students_scored
       FROM assessments a
       LEFT JOIN assessment_scores asc2 ON asc2.assessment_id = a.id
       LEFT JOIN unnest($4::text[], $5::uuid[]) AS roster(class_key, student_id)
         ON roster.class_key = LOWER(a.class_name) AND roster.student_id = asc2.student_id
       WHERE a.school_id = $1 AND a.academic_year_id = $2 AND a.semester = $3
       GROUP BY a.teacher_id, LOWER(a.subject), LOWER(a.class_name), a.mode_id`,
      [req.schoolId, academic_year_id, semInt, rosterClassKeys, rosterStudentIds]
    );

    // Index modeCounts by "teacherId|subjectKey|classKey|modeId"
    const modeCountMap = {};
    for (const mc of modeCounts) {
      const k = `${mc.teacher_id}|${mc.subject_key}|${mc.class_key}|${mc.mode_id}`;
      modeCountMap[k] = mc;
    }

    // ── 5. Per-(teacher, subject, class) exam score counts ────────────────────
    const { rows: examCounts } = await pool.query(
      `SELECT
         es.teacher_id,
         LOWER(es.subject)     AS subject_key,
         LOWER(es.class_name)  AS class_key,
         COUNT(DISTINCT CASE WHEN roster.student_id IS NOT NULL THEN es.student_id END)::int AS students_scored
       FROM exam_scores es
       LEFT JOIN unnest($4::text[], $5::uuid[]) AS roster(class_key, student_id)
         ON roster.class_key = LOWER(es.class_name) AND roster.student_id = es.student_id
       WHERE es.school_id = $1 AND es.academic_year_id = $2 AND es.semester = $3
       GROUP BY es.teacher_id, LOWER(es.subject), LOWER(es.class_name)`,
      [req.schoolId, academic_year_id, semInt, rosterClassKeys, rosterStudentIds]
    );

    const examMap = {};
    for (const ec of examCounts) {
      examMap[`${ec.teacher_id}|${ec.subject_key}|${ec.class_key}`] = ec.students_scored;
    }

    // ── 6. Assemble final rows ─────────────────────────────────────────────────
    const withStatus = rows.map(r => {
      const subjKey  = r.subject.toLowerCase();
      const classKey = r.class_name.toLowerCase();
      const total    = rosterCountMap[classKey] ?? 0;
      const sub      = r.submission_status ?? null;
      const baseKey  = `${r.teacher_id}|${subjKey}|${classKey}`;

      // Build mode_breakdown for every CA mode
      const mode_breakdown = modes.map(m => {
        const mc = modeCountMap[`${baseKey}|${m.id}`];
        return {
          mode_id:             m.id,
          mode_name:           m.name,
          max_instances:       m.max_instances ?? null,
          assessments_created: mc?.assessments_created ?? 0,
          students_scored:     mc?.students_scored     ?? 0,
        };
      });

      const complete_modes = mode_breakdown.filter(
        m => m.assessments_created >= 1 && total > 0 && m.students_scored >= total
      ).length;
      const total_modes         = modes.length;
      const exam_students_scored = examMap[baseKey] ?? 0;
      const exam_complete        = total > 0 && exam_students_scored >= total;

      // overall completion % = (complete CA modes + exam slot) / (total modes + 1)
      const denominator   = total_modes + 1;
      const numerator     = complete_modes + (exam_complete ? 1 : 0);
      const completion_pct = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

      const anyStarted = mode_breakdown.some(m => m.assessments_created > 0) || exam_students_scored > 0;

      let status;
      if      (sub === 'published')           status = 'published';
      else if (sub === 'final_approved')      status = 'final_approved';
      else if (sub === 'hod_approved')        status = 'hod_approved';
      else if (sub === 'submitted')           status = 'submitted';
      else if (!anyStarted)                   status = 'not_started';
      else if (complete_modes === total_modes && exam_complete) status = 'scores_complete';
      else                                    status = 'in_progress';

      return {
        teacher_id:            r.teacher_id,
        teacher_name:          r.teacher_name,
        department:            r.department,
        subject:               r.subject,
        class_name:            r.class_name,
        total_students:        total,
        mode_breakdown,
        total_modes,
        complete_modes,
        exam_students_scored,
        exam_complete,
        completion_pct,
        submission_status:     sub,
        status,
      };
    });

    const summary = {
      total:           withStatus.length,
      not_started:     withStatus.filter(r => r.status === 'not_started').length,
      in_progress:     withStatus.filter(r => r.status === 'in_progress').length,
      scores_complete: withStatus.filter(r => r.status === 'scores_complete').length,
      submitted:       withStatus.filter(r => ['submitted','hod_approved','final_approved','published'].includes(r.status)).length,
      published:       withStatus.filter(r => r.status === 'published').length,
    };

    res.json({ summary, rows: withStatus, modes });
  } catch (err) { next(err); }
});

module.exports = router;
