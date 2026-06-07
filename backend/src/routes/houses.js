'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isSeniorHousemaster(teacherId, schoolId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM clearance_offices co
     JOIN clearance_office_staff cos ON cos.office_id = co.id
     WHERE co.office_type = 'senior_housemaster'
       AND cos.teacher_id = $1 AND co.school_id = $2 AND co.is_active = true
     LIMIT 1`,
    [teacherId, schoolId]
  );
  return rows.length > 0;
}

// Returns the house name the teacher may act on, or null if no access.
// Regular HM → always their linked house (requestedHouse ignored).
// Senior HM  → uses requestedHouse (must be provided and must exist).
async function resolveHouse(teacherId, schoolId, requestedHouse) {
  const { rows: hmRows } = await pool.query(
    `SELECT co.linked_house FROM clearance_offices co
     JOIN clearance_office_staff cos ON cos.office_id = co.id
     WHERE co.office_type = 'housemaster'
       AND cos.teacher_id = $1 AND co.school_id = $2 AND co.is_active = true
     LIMIT 1`,
    [teacherId, schoolId]
  );
  if (hmRows.length && hmRows[0].linked_house) return hmRows[0].linked_house;

  if (await isSeniorHousemaster(teacherId, schoolId)) {
    if (!requestedHouse) return null;
    const { rows } = await pool.query(
      `SELECT name FROM houses WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [schoolId, requestedHouse]
    );
    return rows.length ? rows[0].name : null;
  }
  return null;
}

// Room stats for one house – used by both dashboard endpoints
async function roomStats(schoolId, houseName) {
  const [summaryRes, listRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(DISTINCT hr.id)::int                   AS total_rooms,
         COALESCE(SUM(hr.capacity), 0)::int           AS total_capacity,
         COUNT(DISTINCT hra.student_id)::int          AS assigned_students
       FROM house_rooms hr
       LEFT JOIN house_room_assignments hra ON hra.room_id = hr.id
       WHERE hr.school_id = $1 AND LOWER(hr.house_name) = LOWER($2)`,
      [schoolId, houseName]
    ),
    pool.query(
      `SELECT hr.id, hr.room_name, hr.capacity, hr.notes,
              COUNT(hra.student_id)::int AS student_count
       FROM house_rooms hr
       LEFT JOIN house_room_assignments hra ON hra.room_id = hr.id
       WHERE hr.school_id = $1 AND LOWER(hr.house_name) = LOWER($2)
       GROUP BY hr.id ORDER BY hr.room_name`,
      [schoolId, houseName]
    ),
  ]);
  const s = summaryRes.rows[0];
  return {
    total_rooms:        s.total_rooms,
    total_capacity:     s.total_capacity,
    assigned_students:  s.assigned_students,
    rooms:              listRes.rows,
  };
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────

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
              (SELECT COUNT(*)::int FROM house_rooms hr WHERE hr.school_id = h.school_id AND LOWER(hr.house_name) = LOWER(h.name)) AS room_count,
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

// ── Senior housemaster ────────────────────────────────────────────────────────

router.get('/all-dashboard', async (req, res, next) => {
  try {
    if (!await isSeniorHousemaster(req.user.id, req.schoolId))
      return res.status(403).json({ error: 'Senior housemaster access required' });

    const { rows: houses } = await pool.query(
      `SELECT name FROM houses WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );

    const results = await Promise.all(houses.map(async ({ name }) => {
      const [statsRes, classRes, rooms] = await Promise.all([
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
        roomStats(req.schoolId, name),
      ]);
      const s = statsRes.rows[0];
      return { house_name: name, total: s.total, male: s.male, female: s.female, boarding: s.boarding, day: s.day, by_class: classRes.rows, room_stats: rooms };
    }));

    res.json(results);
  } catch (err) { next(err); }
});

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
      `SELECT s.id, s.student_code, s.name, s.class_name, s.gender, s.residential_status, s.house,
              hr.room_name AS room_name
       FROM students s
       LEFT JOIN house_room_assignments hra ON hra.student_id = s.id AND hra.school_id = s.school_id
       LEFT JOIN house_rooms hr ON hr.id = hra.room_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.house, s.class_name, s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Regular housemaster ───────────────────────────────────────────────────────

router.get('/my-dashboard', async (req, res, next) => {
  try {
    const { rows: officeRows } = await pool.query(
      `SELECT co.linked_house FROM clearance_offices co
       JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.office_type = 'housemaster'
         AND cos.teacher_id = $1 AND co.school_id = $2 AND co.is_active = true
       LIMIT 1`,
      [req.user.id, req.schoolId]
    );
    if (!officeRows.length || !officeRows[0].linked_house)
      return res.status(404).json({ error: 'No house assigned' });

    const houseName = officeRows[0].linked_house;

    const [statsRes, classRes, rooms] = await Promise.all([
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
         GROUP BY class_name ORDER BY class_name`,
        [houseName, req.schoolId]
      ),
      roomStats(req.schoolId, houseName),
    ]);

    const s = statsRes.rows[0];
    res.json({
      house_name:  houseName,
      total:       s.total,
      male:        s.male,
      female:      s.female,
      boarding:    s.boarding,
      day:         s.day,
      by_class:    classRes.rows,
      room_stats:  rooms,
    });
  } catch (err) { next(err); }
});

router.get('/my-students', async (req, res, next) => {
  try {
    const { class_name, residential_status, gender } = req.query;
    const { rows: officeRows } = await pool.query(
      `SELECT co.linked_house FROM clearance_offices co
       JOIN clearance_office_staff cos ON cos.office_id = co.id
       WHERE co.office_type = 'housemaster'
         AND cos.teacher_id = $1 AND co.school_id = $2 AND co.is_active = true
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
      `SELECT s.id, s.student_code, s.name, s.class_name, s.gender, s.residential_status,
              hr.room_name AS room_name
       FROM students s
       LEFT JOIN house_room_assignments hra ON hra.student_id = s.id AND hra.school_id = s.school_id
       LEFT JOIN house_rooms hr ON hr.id = hra.room_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.class_name, s.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Room CRUD ─────────────────────────────────────────────────────────────────

// GET /api/houses/my-rooms?house=  (house param required for senior HM)
router.get('/my-rooms', async (req, res, next) => {
  try {
    const houseName = await resolveHouse(req.user.id, req.schoolId, req.query.house);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted or house not found' });

    const { rows } = await pool.query(
      `SELECT hr.id, hr.room_name, hr.capacity, hr.notes,
              COUNT(hra.student_id)::int AS student_count
       FROM house_rooms hr
       LEFT JOIN house_room_assignments hra ON hra.room_id = hr.id
       WHERE hr.school_id = $1 AND LOWER(hr.house_name) = LOWER($2)
       GROUP BY hr.id ORDER BY hr.room_name`,
      [req.schoolId, houseName]
    );
    res.json({ house_name: houseName, rooms: rows });
  } catch (err) { next(err); }
});

// POST /api/houses/my-rooms  (body: room_name, capacity, notes, house_name[senior HM])
router.post('/my-rooms', async (req, res, next) => {
  try {
    const { room_name, capacity, notes, house_name: bodyHouse } = req.body;
    if (!room_name?.trim()) return res.status(400).json({ error: 'room_name is required' });

    const houseName = await resolveHouse(req.user.id, req.schoolId, bodyHouse);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted or house not found' });

    const { rows } = await pool.query(
      `INSERT INTO house_rooms (school_id, house_name, room_name, capacity, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, room_name, capacity, notes`,
      [req.schoolId, houseName, room_name.trim(), capacity ? parseInt(capacity) : null, notes || null]
    );
    res.status(201).json({ ...rows[0], student_count: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A room with that name already exists in this house' });
    next(err);
  }
});

// PUT /api/houses/my-rooms/:roomId
router.put('/my-rooms/:roomId', async (req, res, next) => {
  try {
    const { room_name, capacity, notes, house_name: bodyHouse } = req.body;
    if (!room_name?.trim()) return res.status(400).json({ error: 'room_name is required' });

    const houseName = await resolveHouse(req.user.id, req.schoolId, bodyHouse);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted' });

    const { rows } = await pool.query(
      `UPDATE house_rooms SET room_name = $1, capacity = $2, notes = $3
       WHERE id = $4 AND school_id = $5 AND LOWER(house_name) = LOWER($6)
       RETURNING id, room_name, capacity, notes`,
      [room_name.trim(), capacity ? parseInt(capacity) : null, notes || null,
       req.params.roomId, req.schoolId, houseName]
    );
    if (!rows.length) return res.status(404).json({ error: 'Room not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A room with that name already exists in this house' });
    next(err);
  }
});

// DELETE /api/houses/my-rooms/:roomId
router.delete('/my-rooms/:roomId', async (req, res, next) => {
  try {
    const houseName = await resolveHouse(req.user.id, req.schoolId, req.query.house);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted' });

    const { rowCount } = await pool.query(
      `DELETE FROM house_rooms WHERE id = $1 AND school_id = $2 AND LOWER(house_name) = LOWER($3)`,
      [req.params.roomId, req.schoolId, houseName]
    );
    if (!rowCount) return res.status(404).json({ error: 'Room not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/houses/my-rooms/:roomId/students  — students in a specific room
router.get('/my-rooms/:roomId/students', async (req, res, next) => {
  try {
    const houseName = await resolveHouse(req.user.id, req.schoolId, req.query.house);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted' });

    const { rows } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name, s.gender, s.residential_status
       FROM house_room_assignments hra
       JOIN students s ON s.id = hra.student_id
       JOIN house_rooms hr ON hr.id = hra.room_id
       WHERE hra.room_id = $1 AND hra.school_id = $2 AND LOWER(hr.house_name) = LOWER($3)
       ORDER BY s.class_name, s.name`,
      [req.params.roomId, req.schoolId, houseName]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/houses/my-rooms/:roomId/unassigned  — house students NOT in any room
router.get('/my-rooms/:roomId/unassigned', async (req, res, next) => {
  try {
    const houseName = await resolveHouse(req.user.id, req.schoolId, req.query.house);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted' });

    const { rows } = await pool.query(
      `SELECT s.id, s.student_code, s.name, s.class_name, s.gender, s.residential_status
       FROM students s
       WHERE LOWER(s.house) = LOWER($1)
         AND s.school_id = $2
         AND LOWER(s.status) = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM house_room_assignments hra WHERE hra.student_id = s.id AND hra.school_id = s.school_id
         )
       ORDER BY s.class_name, s.name`,
      [houseName, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/houses/my-rooms/:roomId/assign  — body: { student_ids: [] }
router.post('/my-rooms/:roomId/assign', async (req, res, next) => {
  try {
    const { student_ids, house_name: bodyHouse } = req.body;
    if (!Array.isArray(student_ids) || !student_ids.length)
      return res.status(400).json({ error: 'student_ids array is required' });

    const houseName = await resolveHouse(req.user.id, req.schoolId, bodyHouse);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted' });

    // Verify room belongs to this house
    const { rows: roomRows } = await pool.query(
      `SELECT id FROM house_rooms WHERE id = $1 AND school_id = $2 AND LOWER(house_name) = LOWER($3)`,
      [req.params.roomId, req.schoolId, houseName]
    );
    if (!roomRows.length) return res.status(404).json({ error: 'Room not found' });

    // Upsert: if student is already in another room, move them
    let assigned = 0;
    for (const studentId of student_ids) {
      await pool.query(
        `INSERT INTO house_room_assignments (school_id, room_id, student_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (school_id, student_id) DO UPDATE SET room_id = EXCLUDED.room_id, assigned_at = NOW()`,
        [req.schoolId, req.params.roomId, studentId]
      );
      assigned++;
    }
    res.json({ assigned });
  } catch (err) { next(err); }
});

// DELETE /api/houses/my-rooms/:roomId/students/:studentId
router.delete('/my-rooms/:roomId/students/:studentId', async (req, res, next) => {
  try {
    const houseName = await resolveHouse(req.user.id, req.schoolId, req.query.house);
    if (!houseName) return res.status(403).json({ error: 'House access not permitted' });

    const { rowCount } = await pool.query(
      `DELETE FROM house_room_assignments
       WHERE room_id = $1 AND student_id = $2 AND school_id = $3`,
      [req.params.roomId, req.params.studentId, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Admin house CRUD (keep at end to avoid matching before literal routes) ────

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
