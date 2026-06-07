const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, notes,
              (SELECT COUNT(*)::int FROM students WHERE house = houses.name AND school_id = $1 AND status = 'Active') AS student_count
       FROM houses WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO houses (school_id, name, notes) VALUES ($1,$2,$3) RETURNING id, name, notes`,
      [req.schoolId, name.trim(), notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A house with that name already exists' });
    next(err);
  }
});

// GET /api/houses/overview — admin: all houses with housemaster and student stats
router.get('/overview', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT h.id, h.name, h.notes,
              (SELECT COUNT(*)::int FROM students s WHERE LOWER(s.house) = LOWER(h.name) AND s.school_id = h.school_id AND LOWER(s.status) = 'active') AS student_count,
              (SELECT COUNT(*)::int FROM students s WHERE LOWER(s.house) = LOWER(h.name) AND s.school_id = h.school_id AND LOWER(s.status) = 'active' AND LOWER(s.gender) = 'male') AS male_count,
              (SELECT COUNT(*)::int FROM students s WHERE LOWER(s.house) = LOWER(h.name) AND s.school_id = h.school_id AND LOWER(s.status) = 'active' AND LOWER(s.gender) = 'female') AS female_count,
              (SELECT COUNT(*)::int FROM students s WHERE LOWER(s.house) = LOWER(h.name) AND s.school_id = h.school_id AND LOWER(s.status) = 'active' AND LOWER(s.residential_status) = 'boarding') AS boarding_count,
              (SELECT COUNT(*)::int FROM students s WHERE LOWER(s.house) = LOWER(h.name) AND s.school_id = h.school_id AND LOWER(s.status) = 'active' AND LOWER(s.residential_status) = 'day') AS day_count,
              STRING_AGG(t.name, ', ' ORDER BY t.name) AS housemaster_names
       FROM houses h
       LEFT JOIN clearance_offices co ON co.school_id = h.school_id
         AND co.office_type = 'housemaster'
         AND LOWER(co.linked_house) = LOWER(h.name)
         AND co.is_active = true
       LEFT JOIN clearance_office_staff cos ON cos.office_id = co.id AND cos.teacher_id IS NOT NULL
       LEFT JOIN teachers t ON t.id = cos.teacher_id
       WHERE h.school_id = $1
       GROUP BY h.id, h.name, h.notes, h.school_id
       ORDER BY h.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Helper: check if the teacher is a senior housemaster for this school
async function isSeniorHousemaster(teacherId, schoolId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM clearance_offices co
     JOIN clearance_office_staff cos ON cos.office_id = co.id
     WHERE co.office_type = 'senior_housemaster'
       AND cos.teacher_id = $1
       AND co.school_id = $2
       AND co.is_active = true
     LIMIT 1`,
    [teacherId, schoolId]
  );
  return rows.length > 0;
}

// GET /api/houses/all-dashboard — senior housemaster: stats for every house
router.get('/all-dashboard', async (req, res, next) => {
  try {
    if (!await isSeniorHousemaster(req.user.id, req.schoolId))
      return res.status(403).json({ error: 'Senior housemaster access required' });

    const { rows: houses } = await pool.query(
      `SELECT name FROM houses WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );

    const results = await Promise.all(houses.map(async ({ name }) => {
      const [statsRes, classRes] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*)::int                                                                AS total,
             COUNT(*) FILTER (WHERE LOWER(gender) = 'male')::int                         AS male,
             COUNT(*) FILTER (WHERE LOWER(gender) = 'female')::int                       AS female,
             COUNT(*) FILTER (WHERE LOWER(residential_status) = 'boarding')::int         AS boarding,
             COUNT(*) FILTER (WHERE LOWER(residential_status) = 'day')::int              AS day
           FROM students
           WHERE LOWER(house) = LOWER($1) AND school_id = $2 AND LOWER(status) = 'active'`,
          [name, req.schoolId]
        ),
        pool.query(
          `SELECT class_name, COUNT(*)::int AS count
           FROM students
           WHERE LOWER(house) = LOWER($1) AND school_id = $2 AND LOWER(status) = 'active'
           GROUP BY class_name ORDER BY class_name`,
          [name, req.schoolId]
        ),
      ]);
      const s = statsRes.rows[0];
      return { house_name: name, total: s.total, male: s.male, female: s.female, boarding: s.boarding, day: s.day, by_class: classRes.rows };
    }));

    res.json(results);
  } catch (err) { next(err); }
});

// GET /api/houses/all-students — senior housemaster: students across all houses
router.get('/all-students', async (req, res, next) => {
  try {
    if (!await isSeniorHousemaster(req.user.id, req.schoolId))
      return res.status(403).json({ error: 'Senior housemaster access required' });

    const { house, class_name, residential_status, gender } = req.query;
    const conditions = [`s.school_id = $1`, `LOWER(s.status) = 'active'`];
    const params = [req.schoolId];

    if (house)             { params.push(house);             conditions.push(`LOWER(s.house) = LOWER($${params.length})`); }
    if (class_name)        { params.push(class_name);        conditions.push(`s.class_name = $${params.length}`); }
    if (residential_status){ params.push(residential_status); conditions.push(`LOWER(s.residential_status) = LOWER($${params.length})`); }
    if (gender)            { params.push(gender);             conditions.push(`LOWER(s.gender) = LOWER($${params.length})`); }

    const { rows } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name, s.gender, s.residential_status, s.house
       FROM students s
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.house, s.class_name, s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/houses/my-dashboard — teacher: stats for their assigned house
router.get('/my-dashboard', async (req, res, next) => {
  try {
    const { rows: officeRows } = await pool.query(
      `SELECT co.linked_house
       FROM clearance_offices co
       JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.office_type = 'housemaster'
         AND cos.teacher_id = $1
         AND co.school_id = $2
         AND co.is_active = true
       LIMIT 1`,
      [req.user.id, req.schoolId]
    );
    if (!officeRows.length || !officeRows[0].linked_house)
      return res.status(404).json({ error: 'No house assigned' });

    const houseName = officeRows[0].linked_house;

    const [statsRes, classRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int                                                                AS total,
           COUNT(*) FILTER (WHERE LOWER(gender) = 'male')::int                         AS male,
           COUNT(*) FILTER (WHERE LOWER(gender) = 'female')::int                       AS female,
           COUNT(*) FILTER (WHERE LOWER(residential_status) = 'boarding')::int         AS boarding,
           COUNT(*) FILTER (WHERE LOWER(residential_status) = 'day')::int              AS day
         FROM students
         WHERE LOWER(house) = LOWER($1) AND school_id = $2 AND LOWER(status) = 'active'`,
        [houseName, req.schoolId]
      ),
      pool.query(
        `SELECT class_name, COUNT(*)::int AS count
         FROM students
         WHERE LOWER(house) = LOWER($1) AND school_id = $2 AND LOWER(status) = 'active'
         GROUP BY class_name
         ORDER BY class_name`,
        [houseName, req.schoolId]
      ),
    ]);

    const s = statsRes.rows[0];
    res.json({
      house_name: houseName,
      total:      s.total,
      male:       s.male,
      female:     s.female,
      boarding:   s.boarding,
      day:        s.day,
      by_class:   classRes.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/houses/my-students — teacher: filtered student list for their house
router.get('/my-students', async (req, res, next) => {
  try {
    const { class_name, residential_status, gender } = req.query;

    const { rows: officeRows } = await pool.query(
      `SELECT co.linked_house
       FROM clearance_offices co
       JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.office_type = 'housemaster'
         AND cos.teacher_id = $1
         AND co.school_id = $2
         AND co.is_active = true
       LIMIT 1`,
      [req.user.id, req.schoolId]
    );
    if (!officeRows.length || !officeRows[0].linked_house)
      return res.status(404).json({ error: 'No house assigned' });

    const houseName = officeRows[0].linked_house;
    const conditions = [`LOWER(s.house) = LOWER($1)`, `s.school_id = $2`, `LOWER(s.status) = 'active'`];
    const params = [houseName, req.schoolId];

    if (class_name)        { params.push(class_name);        conditions.push(`s.class_name = $${params.length}`); }
    if (residential_status){ params.push(residential_status); conditions.push(`LOWER(s.residential_status) = LOWER($${params.length})`); }
    if (gender)            { params.push(gender);             conditions.push(`LOWER(s.gender) = LOWER($${params.length})`); }

    const { rows } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name, s.gender, s.residential_status
       FROM students s
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.class_name, s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `UPDATE houses SET name = $1, notes = $2
       WHERE id = $3 AND school_id = $4 RETURNING id, name, notes`,
      [name.trim(), notes || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'House not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A house with that name already exists' });
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM houses WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'House not found' });
    res.json({ message: 'House deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
