const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

// GET /api/assessment-monitoring?academic_year_id=&semester=&department=&teacher_id=
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, department, teacher_id } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    const semInt = parseInt(semester);

    // Build optional teacher/department filters
    const extraConds = [];
    const params = [req.schoolId, academic_year_id, semInt];
    if (department) { params.push(department); extraConds.push(`te.department = $${params.length}`); }
    if (teacher_id) { params.push(teacher_id); extraConds.push(`te.id = $${params.length}`); }
    const extraWhere = extraConds.length ? 'AND ' + extraConds.join(' AND ') : '';

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
      )
      SELECT
        e.teacher_id,
        te.name        AS teacher_name,
        te.department,
        e.subject,
        e.class_name,
        -- Total active students in this class
        (SELECT COUNT(*) FROM students s WHERE s.school_id=$1 AND LOWER(s.class_name)=LOWER(e.class_name) AND s.status='Active') AS total_students,
        -- CA assessments created for this teacher/subject/class
        (SELECT COUNT(*) FROM assessments a
         WHERE a.school_id=$1 AND a.teacher_id=e.teacher_id
           AND a.academic_year_id=$2 AND a.semester=$3
           AND LOWER(a.subject)=e.subject_key AND LOWER(a.class_name)=LOWER(e.class_name)
        ) AS assessments_created,
        -- Distinct assessment mode names entered for this teacher/subject/class
        ARRAY(
          SELECT DISTINCT m.name FROM assessments a
          JOIN assessment_modes m ON m.id = a.mode_id
          WHERE a.school_id=$1 AND a.teacher_id=e.teacher_id
            AND a.academic_year_id=$2 AND a.semester=$3
            AND LOWER(a.subject)=e.subject_key AND LOWER(a.class_name)=LOWER(e.class_name)
          ORDER BY m.name
        ) AS assessment_names,
        -- Distinct students with at least one CA score
        (SELECT COUNT(DISTINCT asc2.student_id)
         FROM assessment_scores asc2
         JOIN assessments a ON a.id=asc2.assessment_id
         WHERE a.school_id=$1 AND a.teacher_id=e.teacher_id
           AND a.academic_year_id=$2 AND a.semester=$3
           AND LOWER(a.subject)=e.subject_key AND LOWER(a.class_name)=LOWER(e.class_name)
           AND asc2.score IS NOT NULL
        ) AS students_ca_scored,
        -- Students with exam scores entered
        (SELECT COUNT(DISTINCT es.student_id)
         FROM exam_scores es
         WHERE es.school_id=$1 AND es.teacher_id=e.teacher_id
           AND es.academic_year_id=$2 AND es.semester=$3
           AND LOWER(es.subject)=e.subject_key AND LOWER(es.class_name)=LOWER(e.class_name)
        ) AS students_exam_scored,
        -- Submission status
        (SELECT rs.status FROM result_submissions rs
         WHERE rs.school_id=$1 AND rs.teacher_id=e.teacher_id
           AND rs.academic_year_id=$2 AND rs.semester=$3
           AND LOWER(rs.subject)=e.subject_key AND LOWER(rs.class_name)=LOWER(e.class_name)
         LIMIT 1
        ) AS submission_status
      FROM expanded e
      JOIN teachers te ON te.id=e.teacher_id AND te.school_id=$1
      WHERE TRUE ${extraWhere}
      ORDER BY te.name, e.subject, e.class_name
    `, params);

    // Compute a per-row completion status
    const withStatus = rows.map(r => {
      const total   = parseInt(r.total_students)    || 0;
      const caScore = parseInt(r.students_ca_scored) || 0;
      const exScore = parseInt(r.students_exam_scored) || 0;
      const created = parseInt(r.assessments_created) || 0;
      const sub     = r.submission_status;

      let status;
      if (sub === 'published')           status = 'published';
      else if (sub === 'final_approved') status = 'final_approved';
      else if (sub === 'hod_approved')   status = 'hod_approved';
      else if (sub === 'submitted')      status = 'submitted';
      else if (created === 0 && exScore === 0) status = 'not_started';
      else if (total > 0 && caScore >= total && exScore >= total) status = 'scores_complete';
      else status = 'in_progress';

      return {
        teacher_id:           r.teacher_id,
        teacher_name:         r.teacher_name,
        department:           r.department,
        subject:              r.subject,
        class_name:           r.class_name,
        total_students:       total,
        assessments_created:  created,
        assessment_names:     r.assessment_names ?? [],
        students_ca_scored:   caScore,
        students_exam_scored: exScore,
        submission_status:    sub ?? null,
        status,
      };
    });

    // Summary counts
    const summary = {
      total:           withStatus.length,
      not_started:     withStatus.filter(r => r.status === 'not_started').length,
      in_progress:     withStatus.filter(r => r.status === 'in_progress').length,
      scores_complete: withStatus.filter(r => r.status === 'scores_complete').length,
      submitted:       withStatus.filter(r => ['submitted','hod_approved','final_approved','published'].includes(r.status)).length,
      published:       withStatus.filter(r => r.status === 'published').length,
    };

    res.json({ summary, rows: withStatus });
  } catch (err) { next(err); }
});

module.exports = router;
