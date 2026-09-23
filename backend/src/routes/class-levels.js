const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { promoteClass } = require('../services/promotion.service');

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

// GET /api/class-levels/:id/promotion-preview?to_level_id=X
// Suggests a same-letter/suffix destination for each class under the source
// level. A class with no matching destination name comes back with
// suggested_to_class_id: null — the caller decides what to do about it.
router.get('/:id/promotion-preview', adminOnly, async (req, res, next) => {
  try {
    const fromLevelId = req.params.id;
    const toLevelId   = req.query.to_level_id;
    if (!toLevelId) return res.status(400).json({ error: 'to_level_id is required' });
    if (fromLevelId === toLevelId) return res.status(400).json({ error: 'Source and destination levels must differ' });

    const { rows: levels } = await pool.query(
      `SELECT id FROM class_levels WHERE school_id = $1 AND id = ANY($2::uuid[])`,
      [req.schoolId, [fromLevelId, toLevelId]]
    );
    if (levels.length < 2) return res.status(404).json({ error: 'Level not found' });

    const { rows: sourceClasses } = await pool.query(
      `SELECT c.id, c.name,
              (SELECT COUNT(*)::int FROM students s
                WHERE s.school_id = c.school_id AND s.class_name = c.name AND s.status = 'Active') AS active_count
       FROM classes c WHERE c.school_id = $1 AND c.level_id = $2 ORDER BY c.name`,
      [req.schoolId, fromLevelId]
    );
    const { rows: destClasses } = await pool.query(
      `SELECT id, name FROM classes WHERE school_id = $1 AND level_id = $2 ORDER BY name`,
      [req.schoolId, toLevelId]
    );

    const suffixOf = (name) => name.replace(/^[0-9]+/, '').trim().toLowerCase();
    const destBySuffix = new Map();
    for (const d of destClasses) {
      const key = suffixOf(d.name);
      if (!destBySuffix.has(key)) destBySuffix.set(key, d);
    }

    const mapping = sourceClasses.map(c => {
      const match = destBySuffix.get(suffixOf(c.name));
      return {
        from_class_id:           c.id,
        from_class_name:         c.name,
        active_count:            c.active_count,
        suggested_to_class_id:   match ? match.id   : null,
        suggested_to_class_name: match ? match.name : null,
      };
    });

    res.json({ from_level_id: fromLevelId, to_level_id: toLevelId, mapping, dest_classes: destClasses });
  } catch (err) { next(err); }
});

// POST /api/class-levels/:id/promote
// body: { to_level_id, mappings: [{ from_class_id, to_class_id, excluded_student_ids? }] }
// Every class currently under the source level must appear in mappings with
// a valid destination class under to_level_id, or the whole request is
// rejected before anything is written — no partial/silent skips.
router.post('/:id/promote', adminOnly, async (req, res, next) => {
  const fromLevelId = req.params.id;
  const { to_level_id: toLevelId, mappings } = req.body;
  if (!toLevelId) return res.status(400).json({ error: 'to_level_id is required' });
  if (fromLevelId === toLevelId) return res.status(400).json({ error: 'Source and destination levels must differ' });
  if (!Array.isArray(mappings) || !mappings.length) return res.status(400).json({ error: 'mappings are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: levels } = await client.query(
      `SELECT id FROM class_levels WHERE school_id = $1 AND id = ANY($2::uuid[])`,
      [req.schoolId, [fromLevelId, toLevelId]]
    );
    if (levels.length < 2) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Level not found' }); }

    const { rows: sourceClasses } = await client.query(
      `SELECT id, name FROM classes WHERE school_id = $1 AND level_id = $2`,
      [req.schoolId, fromLevelId]
    );
    const sourceById = new Map(sourceClasses.map(c => [c.id, c]));

    const { rows: destClasses } = await client.query(
      `SELECT id, name FROM classes WHERE school_id = $1 AND level_id = $2`,
      [req.schoolId, toLevelId]
    );
    const destById = new Map(destClasses.map(c => [c.id, c]));

    const mappedSourceIds = new Set();
    for (const m of mappings) {
      if (!sourceById.has(m.from_class_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Class ${m.from_class_id} is not under the source level` });
      }
      if (!destById.has(m.to_class_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Destination class ${m.to_class_id} is not under the destination level` });
      }
      mappedSourceIds.add(m.from_class_id);
    }
    const missing = sourceClasses.filter(c => !mappedSourceIds.has(c.id));
    if (missing.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Every class under the source level needs a destination before promoting',
        missing_classes: missing.map(c => ({ id: c.id, name: c.name })),
      });
    }

    const results = [];
    for (const m of mappings) {
      const from = sourceById.get(m.from_class_id);
      const to   = destById.get(m.to_class_id);
      const { rows: activeRows } = await client.query(
        `SELECT id FROM students WHERE school_id = $1 AND class_name = $2 AND status = 'Active'`,
        [req.schoolId, from.name]
      );
      const excluded   = new Set(m.excluded_student_ids || []);
      const includeIds = activeRows.map(r => r.id).filter(id => !excluded.has(id));

      let promoted = 0;
      if (includeIds.length > 0) {
        promoted = await promoteClass(client, {
          schoolId: req.schoolId, fromClass: from.name, toClass: to.name, studentIds: includeIds,
        });
      }
      results.push({ from_class: from.name, to_class: to.name, promoted, held_back: excluded.size });
    }

    await client.query('COMMIT');
    res.json({ promoted_total: results.reduce((sum, r) => sum + r.promoted, 0), results });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
