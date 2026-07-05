const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/assessment-modes
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, ca_contribution, sort_order, max_instances
       FROM assessment_modes
       WHERE school_id = $1
       ORDER BY sort_order, name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/assessment-modes
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, ca_contribution, sort_order, max_instances } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const contribution = parseFloat(ca_contribution) || 0;
    const limit = (max_instances != null && max_instances !== '') ? parseInt(max_instances) : null;
    if (limit != null && (isNaN(limit) || limit < 1))
      return res.status(400).json({ error: 'max_instances must be a positive integer' });
    const { rows } = await pool.query(
      `INSERT INTO assessment_modes (school_id, name, ca_contribution, sort_order, max_instances)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, ca_contribution, sort_order, max_instances`,
      [req.schoolId, name.trim(), contribution, parseInt(sort_order) || 0, limit]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A mode with that name already exists' });
    next(err);
  }
});

// PUT /api/assessment-modes/:id
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, ca_contribution, sort_order, max_instances } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const contribution = parseFloat(ca_contribution) || 0;
    const limit = (max_instances != null && max_instances !== '') ? parseInt(max_instances) : null;
    if (limit != null && (isNaN(limit) || limit < 1))
      return res.status(400).json({ error: 'max_instances must be a positive integer' });
    const { rows } = await pool.query(
      `UPDATE assessment_modes
       SET name = $1, ca_contribution = $2, sort_order = $3, max_instances = $4
       WHERE id = $5 AND school_id = $6
       RETURNING id, name, ca_contribution, sort_order, max_instances`,
      [name.trim(), contribution, parseInt(sort_order) || 0, limit, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Mode not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A mode with that name already exists' });
    next(err);
  }
});

// DELETE /api/assessment-modes/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM assessment_modes WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Mode not found' });
    res.json({ message: 'Mode deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
