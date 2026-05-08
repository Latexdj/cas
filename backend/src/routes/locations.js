const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, type, latitude, longitude, radius_meters, has_coordinates
       FROM locations WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, type = 'Classroom', latitude, longitude, radius_meters = 30 } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const hasCoords = !!(latitude && longitude);
    const { rows } = await pool.query(
      `INSERT INTO locations (school_id, name, type, latitude, longitude, radius_meters, has_coordinates)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.schoolId, name.trim(), type, latitude||null, longitude||null, radius_meters, hasCoords]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A location with that name already exists' });
    }
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, type, latitude, longitude, radius_meters } = req.body;
    const hasCoords = (latitude != null && longitude != null) ? true : undefined;

    const { rows } = await pool.query(
      `UPDATE locations
       SET name            = COALESCE($1, name),
           type            = COALESCE($2, type),
           latitude        = COALESCE($3, latitude),
           longitude       = COALESCE($4, longitude),
           radius_meters   = COALESCE($5, radius_meters),
           has_coordinates = COALESCE($6, has_coordinates)
       WHERE id = $7 AND school_id = $8 RETURNING *`,
      [name||null, type||null, latitude??null, longitude??null,
       radius_meters||null, hasCoords??null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Location not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM locations WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Location not found' });
    res.json({ message: 'Location deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
