const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/class-levels — levels with how many classes currently sit under each
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT cl.id, cl.name, cl.sort_order,
              COUNT(c.id)::int AS class_count
       FROM class_levels cl
       LEFT JOIN classes c ON c.level_id = cl.id
       WHERE cl.school_id = $1
       GROUP BY cl.id
       ORDER BY cl.sort_order, cl.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO class_levels (school_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id, name, sort_order`,
      [req.schoolId, name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A level with this name already exists' });
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE class_levels SET name = COALESCE($1, name), sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND school_id = $4 RETURNING id, name, sort_order`,
      [name?.trim() || null, sort_order ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Level not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A level with this name already exists' });
    next(err);
  }
});

// Deleting a level leaves its classes in place with level_id cleared
// (ON DELETE SET NULL) — nothing about the classes or their students changes.
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM class_levels WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Level not found' });
    res.json({ message: 'Level deleted' });
  } catch (err) { next(err); }
});

// POST /api/class-levels/auto-detect — group currently-unassigned classes by
// their name's leading digit run (e.g. "2A" -> "2") into levels. Never
// touches a class that already has a level_id, so it's safe to re-run after
// an admin has manually corrected some assignments.
router.post('/auto-detect', adminOnly, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: unassigned } = await client.query(
      `SELECT id, name FROM classes WHERE school_id = $1 AND level_id IS NULL AND name ~ '^[0-9]+'`,
      [req.schoolId]
    );

    const groups = new Map(); // leading-digit string -> class ids
    for (const c of unassigned) {
      const digits = c.name.match(/^[0-9]+/)[0];
      if (!groups.has(digits)) groups.set(digits, []);
      groups.get(digits).push(c.id);
    }

    let levelsCreated = 0, classesAssigned = 0;
    for (const [digits, classIds] of groups) {
      const { rows: existing } = await client.query(
        `SELECT id FROM class_levels WHERE school_id = $1 AND name = $2`,
        [req.schoolId, digits]
      );
      let levelId;
      if (existing.length) {
        levelId = existing[0].id;
      } else {
        const { rows: created } = await client.query(
          `INSERT INTO class_levels (school_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
          [req.schoolId, digits, parseInt(digits, 10)]
        );
        levelId = created[0].id;
        levelsCreated++;
      }
      const { rowCount } = await client.query(
        `UPDATE classes SET level_id = $1 WHERE id = ANY($2::uuid[]) AND school_id = $3`,
        [levelId, classIds, req.schoolId]
      );
      classesAssigned += rowCount;
    }

    await client.query('COMMIT');
    res.json({ levels_created: levelsCreated, classes_assigned: classesAssigned });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
