const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/grade-boundaries?exam_body=WAEC
router.get('/', async (req, res, next) => {
  try {
    const { exam_body } = req.query;
    const params = [req.schoolId];
    let where = 'WHERE school_id = $1';
    if (exam_body) { params.push(exam_body); where += ` AND exam_body = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT id, exam_body, grade, min_pct, max_pct, remark, sort_order
       FROM grade_boundaries ${where}
       ORDER BY exam_body, sort_order DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/grade-boundaries
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { exam_body, grade, min_pct, max_pct, remark, sort_order } = req.body;
    if (!exam_body || !grade) return res.status(400).json({ error: 'exam_body and grade are required' });
    if (!['WAEC','CTVET'].includes(exam_body)) return res.status(400).json({ error: 'exam_body must be WAEC or CTVET' });
    const { rows } = await pool.query(
      `INSERT INTO grade_boundaries (school_id, exam_body, grade, min_pct, max_pct, remark, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, exam_body, grade, min_pct, max_pct, remark, sort_order`,
      [req.schoolId, exam_body, grade.trim(), parseFloat(min_pct)||0, parseFloat(max_pct)||100, remark||null, parseInt(sort_order)||0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Grade already exists for this exam body' });
    next(err);
  }
});

// PUT /api/grade-boundaries/:id
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { grade, min_pct, max_pct, remark, sort_order } = req.body;
    if (!grade) return res.status(400).json({ error: 'grade is required' });
    const { rows } = await pool.query(
      `UPDATE grade_boundaries
       SET grade = $1, min_pct = $2, max_pct = $3, remark = $4, sort_order = $5
       WHERE id = $6 AND school_id = $7
       RETURNING id, exam_body, grade, min_pct, max_pct, remark, sort_order`,
      [grade.trim(), parseFloat(min_pct)||0, parseFloat(max_pct)||100, remark||null, parseInt(sort_order)||0, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Boundary not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/grade-boundaries/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM grade_boundaries WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Boundary not found' });
    res.json({ message: 'Boundary deleted' });
  } catch (err) { next(err); }
});

// POST /api/grade-boundaries/seed — reset to defaults for an exam body
router.post('/seed', adminOnly, async (req, res, next) => {
  try {
    const { exam_body } = req.body;
    if (!['WAEC','CTVET'].includes(exam_body)) return res.status(400).json({ error: 'exam_body must be WAEC or CTVET' });

    const waecDefaults = [
      { grade: 'A1', min_pct: 80, max_pct: 100, remark: 'Excellent',  sort_order: 9 },
      { grade: 'B2', min_pct: 70, max_pct: 79,  remark: 'Very Good',  sort_order: 8 },
      { grade: 'B3', min_pct: 60, max_pct: 69,  remark: 'Good',       sort_order: 7 },
      { grade: 'C4', min_pct: 55, max_pct: 59,  remark: 'Credit',     sort_order: 6 },
      { grade: 'C5', min_pct: 50, max_pct: 54,  remark: 'Credit',     sort_order: 5 },
      { grade: 'C6', min_pct: 45, max_pct: 49,  remark: 'Credit',     sort_order: 4 },
      { grade: 'D7', min_pct: 40, max_pct: 44,  remark: 'Pass',       sort_order: 3 },
      { grade: 'E8', min_pct: 35, max_pct: 39,  remark: 'Pass',       sort_order: 2 },
      { grade: 'F9', min_pct: 0,  max_pct: 34,  remark: 'Fail',       sort_order: 1 },
    ];
    const ctvetDefaults = [
      { grade: 'A',  min_pct: 80, max_pct: 100, remark: 'Distinction', sort_order: 9 },
      { grade: 'B+', min_pct: 70, max_pct: 79,  remark: 'Very Good',   sort_order: 8 },
      { grade: 'B',  min_pct: 60, max_pct: 69,  remark: 'Good',        sort_order: 7 },
      { grade: 'C+', min_pct: 55, max_pct: 59,  remark: 'Credit',      sort_order: 6 },
      { grade: 'C',  min_pct: 50, max_pct: 54,  remark: 'Pass',        sort_order: 5 },
      { grade: 'C-', min_pct: 45, max_pct: 49,  remark: 'Pass',        sort_order: 4 },
      { grade: 'D',  min_pct: 40, max_pct: 44,  remark: 'Pass',        sort_order: 3 },
      { grade: 'E',  min_pct: 35, max_pct: 39,  remark: 'Pass',        sort_order: 2 },
      { grade: 'F',  min_pct: 0,  max_pct: 34,  remark: 'Fail',        sort_order: 1 },
    ];

    const defaults = exam_body === 'WAEC' ? waecDefaults : ctvetDefaults;

    await pool.query(`DELETE FROM grade_boundaries WHERE school_id = $1 AND exam_body = $2`, [req.schoolId, exam_body]);
    for (const d of defaults) {
      await pool.query(
        `INSERT INTO grade_boundaries (school_id, exam_body, grade, min_pct, max_pct, remark, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.schoolId, exam_body, d.grade, d.min_pct, d.max_pct, d.remark, d.sort_order]
      );
    }
    const { rows } = await pool.query(
      `SELECT id, exam_body, grade, min_pct, max_pct, remark, sort_order
       FROM grade_boundaries WHERE school_id = $1 AND exam_body = $2
       ORDER BY sort_order DESC`,
      [req.schoolId, exam_body]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
