const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// GET /api/absences — all absences (admin), paginated + filterable
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { teacherId, status, from, to } = req.query;

    const conditions = [`ab.school_id = $1`];
    const params = [req.schoolId];

    if (teacherId) { params.push(teacherId); conditions.push(`ab.teacher_id = $${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`ab.status = $${params.length}`); }
    if (from)      { params.push(from);      conditions.push(`ab.date >= $${params.length}`); }
    if (to)        { params.push(to);        conditions.push(`ab.date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT
         ab.id, ab.date, ab.detected_at, ab.subject, ab.class_name,
         ab.scheduled_period, ab.status, ab.is_auto_generated, ab.reason,
         ab.created_at, ab.updated_at,
         te.id AS teacher_id, te.name AS teacher_name
       FROM absences ab
       JOIN teachers te ON te.id = ab.teacher_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ab.date DESC, ab.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/absences/teacher/:teacherId
router.get('/teacher/:teacherId', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await pool.query(
      `SELECT
         id, date, subject, class_name, scheduled_period,
         status, reason, created_at
       FROM absences
       WHERE school_id = $1 AND teacher_id = $2
         AND status = 'Absent'
         AND is_auto_generated = true
         AND date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY date DESC`,
      [req.schoolId, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/absences/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ab.*, te.name AS teacher_name
       FROM absences ab JOIN teachers te ON te.id = ab.teacher_id
       WHERE ab.id = $1 AND ab.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Absence not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/absences/manual — admin manually records an absence for a date range
router.post('/manual', adminOnly, async (req, res, next) => {
  try {
    const { teacherId, subject, className, scheduledPeriod, reason, dates } = req.body;
    if (!teacherId || !subject || !className || !dates?.length) {
      return res.status(400).json({ error: 'teacherId, subject, className, dates[] required' });
    }

    const inserted = [];
    for (const date of dates) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO absences
             (school_id, date, teacher_id, subject, class_name, scheduled_period,
              status, is_auto_generated, reason)
           VALUES ($1,$2,$3,$4,$5,$6,'Absent',false,$7)
           ON CONFLICT (date, teacher_id, subject, class_name)
             WHERE is_auto_generated = true
           DO NOTHING
           RETURNING id`,
          [req.schoolId, date, teacherId, subject, className, scheduledPeriod || null, reason || null]
        );
        if (rows.length) inserted.push(rows[0].id);
      } catch {
        // Skip duplicate entries silently for manual batch inserts
      }
    }
    res.status(201).json({ inserted: inserted.length, ids: inserted });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/absences/:id/reason — teacher submits their reason for an absence
router.patch('/:id/reason', async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    let query, params;
    if (req.user.role === 'teacher') {
      query = `UPDATE absences SET reason = $1, updated_at = now()
               WHERE id = $2 AND teacher_id = $3 AND school_id = $4 RETURNING id`;
      params = [reason, req.params.id, req.user.id, req.schoolId];
    } else {
      query = `UPDATE absences SET reason = $1, updated_at = now()
               WHERE id = $2 AND school_id = $3 RETURNING id`;
      params = [reason, req.params.id, req.schoolId];
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Absence not found or access denied' });
    res.json({ message: 'Reason saved' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/absences/:id/status — admin changes absence status
router.patch('/:id/status', adminOnly, async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['Absent', 'Remedial Scheduled', 'Made Up', 'Cleared', 'Verified'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
    }
    const { rows } = await pool.query(
      `UPDATE absences SET status = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 RETURNING id, status`,
      [status, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Absence not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/absences/:id — reverse / remove an auto-generated absence (admin)
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM absences WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Absence not found' });
    res.json({ message: 'Absence removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
