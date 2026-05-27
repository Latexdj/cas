const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { recalcFullyCleared } = require('./clearanceAdmin');

router.use(authenticate, requireActiveSubscription);

function clearanceStaffOnly(req, res, next) {
  const role = req.user?.role;
  if (role === 'teacher' || role === 'admin') return next();
  if (role === 'staff' && req.staffRoles?.includes('clearance')) return next();
  return res.status(403).json({ error: 'Clearance staff access only' });
}
router.use(clearanceStaffOnly);

async function getMyOfficeIds(schoolId, userId, role) {
  if (role === 'staff') {
    const { rows } = await pool.query(
      `SELECT office_id FROM clearance_office_staff WHERE school_id = $1 AND school_staff_id = $2`,
      [schoolId, userId]
    );
    return rows.map(r => r.office_id);
  }
  const { rows } = await pool.query(
    `SELECT office_id FROM clearance_office_staff WHERE school_id = $1 AND teacher_id = $2`,
    [schoolId, userId]
  );
  return rows.map(r => r.office_id);
}

// GET /api/clearance/my-offices
router.get('/my-offices', async (req, res, next) => {
  try {
    const officeIds = await getMyOfficeIds(req.schoolId, req.user.id, req.user.role);
    if (!officeIds.length) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, name, office_type, sort_order FROM clearance_offices
       WHERE id = ANY($1) ORDER BY sort_order, name`,
      [officeIds]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/clearance/pending?office_id=
// Returns students whose clearance item for my office(s) is still pending or not_cleared
router.get('/pending', async (req, res, next) => {
  try {
    const { office_id } = req.query;
    const officeIds = await getMyOfficeIds(req.schoolId, req.user.id, req.user.role);
    if (!officeIds.length) return res.json([]);

    const targetOffices = office_id && officeIds.includes(office_id) ? [office_id] : officeIds;

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.name, s.student_code, s.class_name, s.picture_url,
              sci.id AS item_id, sci.office_id, sci.status, sci.notes, sci.actioned_at,
              co.name AS office_name
       FROM student_clearance_items sci
       JOIN student_clearances sc ON sc.id = sci.clearance_id
       JOIN students s ON s.id = sc.student_id
       JOIN clearance_offices co ON co.id = sci.office_id
       WHERE sci.school_id = $1
         AND sci.office_id = ANY($2)
         AND sci.status IN ('pending', 'not_cleared')
       ORDER BY s.class_name, s.name`,
      [req.schoolId, targetOffices]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/clearance/student/:studentCode  — look up student + their items for my office(s)
router.get('/student/:studentCode', async (req, res, next) => {
  try {
    const officeIds = await getMyOfficeIds(req.schoolId, req.user.id, req.user.role);

    const { rows: sRows } = await pool.query(
      `SELECT id, name, student_code, class_name, picture_url
       FROM students
       WHERE school_id = $1 AND UPPER(student_code) = UPPER($2) AND status = 'Active'`,
      [req.schoolId, req.params.studentCode]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
    const student = sRows[0];

    if (!officeIds.length) return res.json({ student, items: [] });

    const { rows: items } = await pool.query(
      `SELECT sci.id AS item_id, sci.office_id, sci.status, sci.notes, sci.actioned_at,
              co.name AS office_name
       FROM student_clearance_items sci
       JOIN student_clearances sc ON sc.id = sci.clearance_id
       JOIN clearance_offices co ON co.id = sci.office_id
       WHERE sc.student_id = $1 AND sci.school_id = $2 AND sci.office_id = ANY($3)
       ORDER BY co.sort_order, co.name`,
      [student.id, req.schoolId, officeIds]
    );
    res.json({ student, items });
  } catch (err) { next(err); }
});

// POST /api/clearance/action
// body: { item_id, status: 'cleared'|'not_cleared', notes? }
router.post('/action', async (req, res, next) => {
  try {
    const { item_id, status, notes } = req.body;
    if (!item_id || !status) return res.status(400).json({ error: 'item_id and status are required' });
    if (!['cleared', 'not_cleared'].includes(status)) {
      return res.status(400).json({ error: 'status must be cleared or not_cleared' });
    }
    if (status === 'not_cleared' && !notes?.trim()) {
      return res.status(400).json({ error: 'A reason is required when marking as not cleared' });
    }

    const officeIds = await getMyOfficeIds(req.schoolId, req.user.id, req.user.role);
    if (!officeIds.length) return res.status(403).json({ error: 'You are not assigned to any clearance office' });

    // Verify item belongs to this school and one of the user's offices
    const { rows: itemRows } = await pool.query(
      `SELECT sci.id, sci.clearance_id FROM student_clearance_items sci
       WHERE sci.id = $1 AND sci.school_id = $2 AND sci.office_id = ANY($3)`,
      [item_id, req.schoolId, officeIds]
    );
    if (!itemRows.length) return res.status(404).json({ error: 'Item not found or not in your office' });
    const clearanceId = itemRows[0].clearance_id;

    const role = req.user.role;
    const isTeacher = role === 'teacher' || role === 'admin';
    const isStaff   = role === 'staff';
    await pool.query(
      `UPDATE student_clearance_items
       SET status = $1, notes = $2,
           actioned_by_teacher_id      = $3,
           actioned_by_school_staff_id = $4,
           actioned_at = NOW()
       WHERE id = $5`,
      [status, notes?.trim() || null,
       isTeacher ? req.user.id : null,
       isStaff   ? req.user.id : null,
       item_id]
    );

    await recalcFullyCleared(clearanceId, req.schoolId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/clearance/history  — recently actioned items for my office(s)
router.get('/history', async (req, res, next) => {
  try {
    const officeIds = await getMyOfficeIds(req.schoolId, req.user.id, req.user.role);
    if (!officeIds.length) return res.json([]);

    const { rows } = await pool.query(
      `SELECT s.name, s.student_code, s.class_name,
              sci.item_id, sci.office_id, sci.status, sci.notes, sci.actioned_at,
              co.name AS office_name
       FROM (
         SELECT sci.id AS item_id, sci.office_id, sci.status, sci.notes,
                sci.actioned_at, sci.clearance_id
         FROM student_clearance_items sci
         WHERE sci.school_id = $1 AND sci.office_id = ANY($2)
           AND sci.actioned_at IS NOT NULL
         ORDER BY sci.actioned_at DESC
         LIMIT 50
       ) sci
       JOIN student_clearances sc ON sc.id = sci.clearance_id
       JOIN students s ON s.id = sc.student_id
       JOIN clearance_offices co ON co.id = sci.office_id
       ORDER BY sci.actioned_at DESC`,
      [req.schoolId, officeIds]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
