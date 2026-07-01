const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── Submission lock helpers ────────────────────────────────────────────────────

async function getSubmissionStatus(schoolId, yearId, semester, subject, className) {
  if (!yearId) return 'draft';
  const { rows } = await pool.query(
    `SELECT status FROM result_submissions
     WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5`,
    [schoolId, yearId, parseInt(semester), subject, className]
  );
  return rows[0]?.status ?? 'draft';
}
const LOCKED_STATUSES = ['submitted','hod_approved','final_approved','published'];

// GET /api/exam-scores?academic_year_id=&semester=&subject=&class_name=
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin';
    const params = [req.schoolId, academic_year_id, parseInt(semester), subject, class_name];
    let teacherFilter = '';
    if (!isAdmin) { params.push(req.user.id); teacherFilter = `AND e.teacher_id = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name,
              e.id AS exam_id, e.score, e.max_score
       FROM students s
       LEFT JOIN exam_scores e
         ON  e.student_id      = s.id
         AND e.school_id       = $1
         AND e.academic_year_id = $2
         AND e.semester        = $3
         AND LOWER(e.subject)  = LOWER($4)
         AND LOWER(e.class_name) = LOWER($5)
         ${teacherFilter}
       WHERE s.school_id = $1 AND s.status = 'Active'
         AND LOWER(s.class_name) = LOWER($5)
       ORDER BY s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/exam-scores — bulk upsert exam scores
router.post('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name, max_score, scores } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name || !Array.isArray(scores)) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name, scores[] required' });
    }

    // Check if results are locked
    const subStatus = await getSubmissionStatus(req.schoolId, academic_year_id, semester, subject, class_name);
    if (LOCKED_STATUSES.includes(subStatus)) {
      return res.status(409).json({ error: `Scores are locked — submission status is “${subStatus}”. Contact your HOD or admin to unlock.` });
    }

    const examMax = parseFloat(max_score) || 100;

    // Validate scores against max_score
    for (const s of scores) {
      if (s.score != null) {
        const numScore = parseFloat(s.score);
        if (isNaN(numScore) || numScore < 0 || numScore > parseFloat(max_score || 100)) {
          return res.status(400).json({ error: `Score ${s.score} exceeds max score of ${max_score || 100}` });
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score } of scores) {
        await client.query(
          `INSERT INTO exam_scores
             (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, teacher_id = EXCLUDED.teacher_id`,
          [req.schoolId, academic_year_id, parseInt(semester), subject, class_name,
           student_id, req.user.id, score != null ? parseFloat(score) : null, examMax]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ message: 'Exam scores saved' });
  } catch (err) { next(err); }
});

module.exports = router;
