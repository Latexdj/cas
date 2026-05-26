const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/assessments/my-subjects?academic_year_id=&semester=
// Returns subjects + classes the requesting teacher is assigned to in the timetable
router.get('/my-subjects', async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    if (!academic_year_id || !semester) {
      return res.status(400).json({ error: 'academic_year_id and semester are required' });
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT subject, class_names
       FROM timetable
       WHERE school_id = $1 AND teacher_id = $2
       ORDER BY subject, class_names`,
      [req.schoolId, req.user.id]
    );
    // Expand class_names (comma-separated) into individual rows
    const subjects = [];
    for (const r of rows) {
      const classes = r.class_names.split(',').map(c => c.trim()).filter(Boolean);
      for (const cls of classes) {
        subjects.push({ subject: r.subject, class_name: cls });
      }
    }
    // Deduplicate
    const seen = new Set();
    const unique = subjects.filter(s => {
      const key = `${s.subject}|${s.class_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json(unique);
  } catch (err) { next(err); }
});

// GET /api/assessments?academic_year_id=&semester=&subject=&class_name=
router.get('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name } = req.query;
    if (!academic_year_id || !semester || !subject || !class_name) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name are required' });
    }
    const isAdmin = req.user.role === 'admin';
    const params = [req.schoolId, academic_year_id, parseInt(semester), subject, class_name];
    let teacherFilter = '';
    if (!isAdmin) { params.push(req.user.id); teacherFilter = `AND a.teacher_id = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT a.id, a.mode_id, m.name AS mode_name, m.ca_contribution,
              a.title, a.date, a.max_score,
              a.subject, a.class_name,
              t.name AS teacher_name,
              COUNT(sc.id)::int AS score_count
       FROM assessments a
       JOIN assessment_modes m ON m.id = a.mode_id
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN assessment_scores sc ON sc.assessment_id = a.id
       WHERE a.school_id = $1
         AND a.academic_year_id = $2
         AND a.semester = $3
         AND LOWER(a.subject) = LOWER($4)
         AND LOWER(a.class_name) = LOWER($5)
         ${teacherFilter}
       GROUP BY a.id, m.name, m.ca_contribution, t.name
       ORDER BY a.date NULLS LAST, m.name, a.title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/assessments
router.post('/', async (req, res, next) => {
  try {
    const { academic_year_id, semester, subject, class_name, mode_id, title, date, max_score } = req.body;
    if (!academic_year_id || !semester || !subject || !class_name || !mode_id) {
      return res.status(400).json({ error: 'academic_year_id, semester, subject, class_name, mode_id are required' });
    }
    // Verify mode belongs to school
    const modeCheck = await pool.query(
      `SELECT id FROM assessment_modes WHERE id = $1 AND school_id = $2`,
      [mode_id, req.schoolId]
    );
    if (!modeCheck.rows.length) return res.status(400).json({ error: 'Invalid assessment mode' });

    const { rows } = await pool.query(
      `INSERT INTO assessments
         (school_id, academic_year_id, semester, subject, class_name, teacher_id, mode_id, title, date, max_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, mode_id, title, date, max_score, subject, class_name`,
      [req.schoolId, academic_year_id, parseInt(semester), subject, class_name,
       req.user.id, mode_id, title||null, date||null, parseFloat(max_score)||100]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/assessments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { title, date, max_score, mode_id } = req.body;
    const isAdmin = req.user.role === 'admin';
    const params = [title||null, date||null, parseFloat(max_score)||100, mode_id||null, req.params.id, req.schoolId];
    let ownerFilter = '';
    if (!isAdmin) { params.push(req.user.id); ownerFilter = `AND teacher_id = $${params.length}`; }

    const { rows } = await pool.query(
      `UPDATE assessments
       SET title = $1, date = $2, max_score = $3,
           mode_id = COALESCE($4, mode_id)
       WHERE id = $5 AND school_id = $6 ${ownerFilter}
       RETURNING id, mode_id, title, date, max_score`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Assessment not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/assessments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const params = [req.params.id, req.schoolId];
    let ownerFilter = '';
    if (!isAdmin) { params.push(req.user.id); ownerFilter = `AND teacher_id = $${params.length}`; }

    const { rowCount } = await pool.query(
      `DELETE FROM assessments WHERE id = $1 AND school_id = $2 ${ownerFilter}`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Assessment not found' });
    res.json({ message: 'Assessment deleted' });
  } catch (err) { next(err); }
});

// GET /api/assessments/:id/scores â€” all student scores for an assessment
router.get('/:id/scores', async (req, res, next) => {
  try {
    const { rows: [assessment] } = await pool.query(
      `SELECT * FROM assessments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    // Get all active students in this class
    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.student_code, s.name,
              sc.id AS score_id, sc.score, sc.absent
       FROM students s
       LEFT JOIN assessment_scores sc ON sc.assessment_id = $1 AND sc.student_id = s.id
       WHERE s.school_id = $2 AND s.status = 'Active'
         AND LOWER(s.class_name) = LOWER($3)
       ORDER BY s.name`,
      [req.params.id, req.schoolId, assessment.class_name]
    );
    res.json({ assessment, scores: rows });
  } catch (err) { next(err); }
});

// POST /api/assessments/:id/scores â€” bulk upsert scores
router.post('/:id/scores', async (req, res, next) => {
  try {
    const { scores } = req.body; // [{ student_id, score, absent }]
    if (!Array.isArray(scores)) return res.status(400).json({ error: 'scores must be an array' });

    const { rows: [assessment] } = await pool.query(
      `SELECT * FROM assessments WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, score, absent } of scores) {
        await client.query(
          `INSERT INTO assessment_scores (assessment_id, student_id, score, absent)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (assessment_id, student_id)
           DO UPDATE SET score = EXCLUDED.score, absent = EXCLUDED.absent`,
          [req.params.id, student_id, score != null ? parseFloat(score) : null, absent || false]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ message: 'Scores saved' });
  } catch (err) { next(err); }
});

module.exports = router;
