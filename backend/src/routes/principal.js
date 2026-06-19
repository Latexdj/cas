'use strict';
const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');
const ExcelJS = require('exceljs');

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (payload.type !== 'management') return res.status(403).json({ error: 'Management access required' });
    req.user     = payload;
    req.schoolId = payload.schoolId;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

router.use(auth);

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

// ── 1. Snapshot ───────────────────────────────────────────────────────────────
router.get('/snapshot', async (req, res, next) => {
  try {
    const sid  = req.schoolId;
    const date = today();
    const dow  = new Date().getDay(); // 0=Sun

    const [teacherRes, absenceRes, leaveRes, exeatRes, studentRes] = await Promise.all([
      // Teachers with a slot today
      pool.query(`
        SELECT COUNT(DISTINCT t.id)::int AS total,
               COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN t.id END)::int AS submitted
        FROM teachers t
        JOIN timetable tt ON tt.teacher_id = t.id AND tt.school_id = $1
          AND tt.day_of_week = $2
        LEFT JOIN attendance a ON a.teacher_id = t.id AND a.school_id = $1 AND a.date = $3
        WHERE t.school_id = $1 AND t.status = 'Active'
      `, [sid, dow, date]),

      // Auto-absences today
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM absences
        WHERE school_id = $1 AND date = $2 AND is_auto_generated = true
          AND status NOT IN ('Excused','Made Up','Verified')
      `, [sid, date]),

      // Pending leave requests
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM teacher_excuses
        WHERE school_id = $1 AND status = 'Pending'
      `, [sid]),

      // Active exeats
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM exeats
        WHERE school_id = $1 AND status = 'active'
      `, [sid]),

      // Active students
      pool.query(`
        SELECT COUNT(*)::int AS total FROM students
        WHERE school_id = $1 AND status = 'Active'
      `, [sid]),
    ]);

    const teachers  = teacherRes.rows[0];
    const scheduled = teachers.total;
    const submitted = teachers.submitted;
    const rate      = scheduled > 0 ? Math.round((submitted / scheduled) * 100) : null;

    res.json({
      teacherAttendanceRate: rate,
      teachersScheduledToday: scheduled,
      teachersSubmittedToday:  submitted,
      autoAbsencesToday:   absenceRes.rows[0].cnt,
      pendingLeaves:       leaveRes.rows[0].cnt,
      activeExeats:        exeatRes.rows[0].cnt,
      activeStudents:      studentRes.rows[0].total,
    });
  } catch (err) { next(err); }
});

// ── 2. Classroom Occupancy ────────────────────────────────────────────────────
router.get('/occupancy', async (req, res, next) => {
  try {
    const sid  = req.schoolId;
    const date = req.query.date || today();
    const dow  = new Date(date + 'T12:00:00').getDay();

    const [slotRes, attRes, absRes] = await Promise.all([
      pool.query(`
        SELECT tt.id, tt.start_time, tt.end_time, tt.subject, tt.class_names,
               t.id AS teacher_id, t.name AS teacher_name, t.teacher_code
        FROM timetable tt
        JOIN teachers t ON t.id = tt.teacher_id
        WHERE tt.school_id = $1 AND tt.day_of_week = $2 AND t.status = 'Active'
        ORDER BY tt.start_time, tt.class_names
      `, [sid, dow]),

      pool.query(`
        SELECT teacher_id, subject, class_names, submitted_at
        FROM attendance WHERE school_id = $1 AND date = $2
      `, [sid, date]),

      pool.query(`
        SELECT teacher_id, subject FROM absences
        WHERE school_id = $1 AND date = $2
          AND is_auto_generated = true
          AND status NOT IN ('Excused','Made Up','Verified')
      `, [sid, date]),
    ]);

    const now = new Date();
    const slots = slotRes.rows.map(slot => {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      const slotDate  = new Date(date);
      const startDt   = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), sh, sm);
      const endDt     = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), eh, em);

      const submitted = attRes.rows.some(a =>
        a.teacher_id === slot.teacher_id &&
        a.subject.toLowerCase() === slot.subject.toLowerCase()
      );
      const absent = absRes.rows.some(a =>
        a.teacher_id === slot.teacher_id &&
        a.subject.toLowerCase() === slot.subject.toLowerCase()
      );

      let status;
      if (submitted)              status = 'confirmed';
      else if (absent)            status = 'absent';
      else if (now < startDt)     status = 'upcoming';
      else if (now <= endDt)      status = 'ongoing';
      else                        status = 'not_submitted';

      return {
        id:          slot.id,
        startTime:   slot.start_time,
        endTime:     slot.end_time,
        subject:     slot.subject,
        classNames:  slot.class_names,
        teacherId:   slot.teacher_id,
        teacherName: slot.teacher_name,
        teacherCode: slot.teacher_code,
        status,
      };
    });

    res.json({ date, slots });
  } catch (err) { next(err); }
});

// ── 3. Teacher Attendance Stats ───────────────────────────────────────────────
router.get('/teacher-attendance', async (req, res, next) => {
  try {
    const sid    = req.schoolId;
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const from   = new Date();
    from.setMonth(from.getMonth() - months);
    const fromDate = from.toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      SELECT
        t.id, t.name, t.teacher_code, t.department, t.rank,
        COUNT(ab.id) FILTER (WHERE ab.is_auto_generated = true
          AND ab.status NOT IN ('Excused','Made Up','Verified'))::int  AS unexcused,
        COUNT(ab.id) FILTER (WHERE ab.status IN ('Excused','Made Up','Verified'))::int AS excused,
        COUNT(ab.id)::int                                              AS total_absences,
        COUNT(a.id)::int                                               AS total_submitted
      FROM teachers t
      LEFT JOIN absences ab ON ab.teacher_id = t.id AND ab.school_id = $1
        AND ab.date >= $2
      LEFT JOIN attendance a ON a.teacher_id = t.id AND a.school_id = $1
        AND a.date >= $2
      WHERE t.school_id = $1 AND t.status = 'Active'
      GROUP BY t.id
      ORDER BY unexcused DESC, t.name
    `, [sid, fromDate]);

    res.json({ fromDate, months, teachers: rows });
  } catch (err) { next(err); }
});

// ── 4. Leave Requests ─────────────────────────────────────────────────────────
router.get('/leaves', async (req, res, next) => {
  try {
    const sid    = req.schoolId;
    const status = req.query.status || '';
    const params = [sid];
    let   where  = 'te.school_id = $1';
    if (status) { params.push(status); where += ` AND te.status = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT te.id, te.reason, te.start_date, te.end_date, te.status,
             te.rejection_reason, te.approved_at, te.created_at,
             t.name AS teacher_name, t.teacher_code, t.department
      FROM teacher_excuses te
      JOIN teachers t ON t.id = te.teacher_id
      WHERE ${where}
      ORDER BY te.created_at DESC
      LIMIT 200
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/leaves/:id/approve', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      UPDATE teacher_excuses
      SET status = 'Approved', approved_by = $1, approved_at = now(), updated_at = now()
      WHERE id = $2 AND school_id = $3 AND status = 'Pending'
      RETURNING id, status
    `, [req.user.id, req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found or already actioned' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/leaves/:id/reject', async (req, res, next) => {
  try {
    const reason = req.body?.reason?.trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required when rejecting' });
    const { rows } = await pool.query(`
      UPDATE teacher_excuses
      SET status = 'Rejected', approved_by = $1, approved_at = now(),
          updated_at = now(), rejection_reason = $2
      WHERE id = $3 AND school_id = $4 AND status = 'Pending'
      RETURNING id, status, rejection_reason
    `, [req.user.id, reason, req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found or already actioned' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── 5. Exeat Usage ────────────────────────────────────────────────────────────
router.get('/exeats', async (req, res, next) => {
  try {
    const sid       = req.schoolId;
    const className = req.query.class || '';
    const params    = [sid];
    let   where     = 's.school_id = $1 AND s.status = \'Active\'';
    if (className) { params.push(className); where += ` AND s.class_name = $${params.length}`; }

    // Get school-wide quota limits
    const { rows: settings } = await pool.query(
      `SELECT COALESCE(max_internal, 5) AS max_internal, COALESCE(max_external, 2) AS max_external
       FROM exeat_settings WHERE school_id = $1`,
      [sid]
    );
    const quota = settings[0] ?? { max_internal: 5, max_external: 2 };

    const { rows } = await pool.query(`
      SELECT s.id, s.student_code, s.name, s.class_name, s.house,
             COUNT(e.id) FILTER (WHERE e.exeat_type = 'internal'
               AND e.status NOT IN ('cancelled','rejected'))::int AS internal_used,
             COUNT(e.id) FILTER (WHERE e.exeat_type = 'external'
               AND e.status NOT IN ('cancelled','rejected'))::int AS external_used
      FROM students s
      LEFT JOIN exeats e ON e.student_id = s.id AND e.school_id = s.school_id
      WHERE ${where}
      GROUP BY s.id
      ORDER BY s.class_name, s.name
    `, params);

    res.json({
      internal_quota: quota.max_internal,
      external_quota: quota.max_external,
      students: rows,
    });
  } catch (err) { next(err); }
});

// Update school-wide exeat quota (principal override)
router.patch('/exeat-settings', async (req, res, next) => {
  try {
    const { max_internal, max_external } = req.body;
    if (max_internal == null && max_external == null)
      return res.status(400).json({ error: 'Provide max_internal or max_external' });

    const { rows } = await pool.query(`
      INSERT INTO exeat_settings (school_id, max_internal, max_external, semester_start_date)
      VALUES ($1, COALESCE($2, 5), COALESCE($3, 2), now()::date)
      ON CONFLICT (school_id) DO UPDATE
        SET max_internal = COALESCE($2, exeat_settings.max_internal),
            max_external = COALESCE($3, exeat_settings.max_external),
            updated_at   = now()
      RETURNING max_internal, max_external
    `, [req.schoolId,
        max_internal != null ? parseInt(max_internal) : null,
        max_external != null ? parseInt(max_external) : null]);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── 6. Clearance ──────────────────────────────────────────────────────────────
router.get('/clearance', async (req, res, next) => {
  try {
    const sid       = req.schoolId;
    const className = req.query.class   || '';
    const program   = req.query.program || '';
    const status    = req.query.status  || '';   // fully_cleared | in_progress | not_started

    const params = [sid];
    const conds  = ['s.school_id = $1', "s.status = 'Active'"];
    if (className) { params.push(className); conds.push(`s.class_name = $${params.length}`); }
    if (program)   { params.push(program);   conds.push(`p.name ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT s.id, s.student_code, s.name, s.class_name,
             p.name AS program_name,
             sc.id  AS clearance_id,
             sc.is_fully_cleared,
             sc.fully_cleared_at,
             COUNT(sci.id)::int                                       AS total_offices,
             COUNT(sci.id) FILTER (WHERE sci.cleared_at IS NOT NULL)::int AS cleared_offices
      FROM students s
      LEFT JOIN programs p        ON p.id = s.program_id
      LEFT JOIN student_clearances sc ON sc.student_id = s.id AND sc.school_id = s.school_id
      LEFT JOIN student_clearance_items sci ON sci.clearance_id = sc.id
      WHERE ${conds.join(' AND ')}
      GROUP BY s.id, p.name, sc.id, sc.is_fully_cleared, sc.fully_cleared_at
      ORDER BY s.class_name, s.name
    `, params);

    const filtered = status === 'fully_cleared'
      ? rows.filter(r => r.is_fully_cleared)
      : status === 'in_progress'
        ? rows.filter(r => r.clearance_id && !r.is_fully_cleared)
        : status === 'not_started'
          ? rows.filter(r => !r.clearance_id)
          : rows;

    res.json(filtered);
  } catch (err) { next(err); }
});

router.get('/clearance/student/:id', async (req, res, next) => {
  try {
    const { rows: stu } = await pool.query(`
      SELECT s.id, s.student_code, s.name, s.class_name, p.name AS program_name
      FROM students s LEFT JOIN programs p ON p.id = s.program_id
      WHERE s.id = $1 AND s.school_id = $2
    `, [req.params.id, req.schoolId]);
    if (!stu.length) return res.status(404).json({ error: 'Student not found' });

    const { rows: sc } = await pool.query(`
      SELECT sc.id, sc.is_fully_cleared, sc.initiated_at, sc.fully_cleared_at
      FROM student_clearances sc
      WHERE sc.student_id = $1 AND sc.school_id = $2
    `, [req.params.id, req.schoolId]);

    let offices = [];
    if (sc.length) {
      const { rows } = await pool.query(`
        SELECT co.name AS office_name, co.office_type,
               sci.cleared_at, sci.cleared_by_name
        FROM student_clearance_items sci
        JOIN clearance_offices co ON co.id = sci.office_id
        WHERE sci.clearance_id = $1
        ORDER BY co.sort_order, co.name
      `, [sc[0].id]);
      offices = rows;
    }

    res.json({
      student: stu[0],
      clearance: sc[0] || null,
      offices,
    });
  } catch (err) { next(err); }
});

// ── 7. Personnel Records ──────────────────────────────────────────────────────

// Students JSON
router.get('/personnel/students', async (req, res, next) => {
  try {
    const sid     = req.schoolId;
    const params  = [sid];
    const conds   = ['s.school_id = $1'];
    if (req.query.class)   { params.push(req.query.class);   conds.push(`s.class_name = $${params.length}`); }
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`s.status = $${params.length}`); }
    if (req.query.program) { params.push(req.query.program); conds.push(`p.name ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT s.student_code, s.name, s.class_name, p.name AS program_name, s.status,
             s.gender, s.date_of_birth, s.residential_status, s.house,
             s.religion, s.religious_denomination,
             s.jhs_index_number, s.mobile_number, s.hometown, s.residential_address,
             s.ghana_card_number, s.nhia_number, s.aggregate,
             s.guardian_name, s.guardian_occupation, s.guardian_mobile,
             s.notes
      FROM students s
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE ${conds.join(' AND ')}
      ORDER BY s.class_name, s.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// Students Excel
router.get('/personnel/students/excel', async (req, res, next) => {
  try {
    const sid     = req.schoolId;
    const params  = [sid];
    const conds   = ['s.school_id = $1'];
    if (req.query.class)   { params.push(req.query.class);   conds.push(`s.class_name = $${params.length}`); }
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`s.status = $${params.length}`); }
    if (req.query.program) { params.push(req.query.program); conds.push(`p.name ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT s.student_code, s.name, s.class_name, p.name AS program_name, s.status,
             s.gender, s.date_of_birth, s.residential_status, s.house,
             s.religion, s.religious_denomination,
             s.jhs_index_number, s.mobile_number, s.hometown, s.residential_address,
             s.ghana_card_number, s.nhia_number, s.aggregate,
             s.guardian_name, s.guardian_occupation, s.guardian_mobile,
             s.notes
      FROM students s
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE ${conds.join(' AND ')}
      ORDER BY s.class_name, s.name
    `, params);

    const wb  = new ExcelJS.Workbook();
    wb.creator = 'CAS Management Portal';
    const ws  = wb.addWorksheet('Students');
    const HDR_DARK = '0F4C35';
    const cols = [
      { header: 'Student ID',           key: 'student_code',         width: 14 },
      { header: 'Name',                 key: 'name',                  width: 28 },
      { header: 'Class',                key: 'class_name',            width: 10 },
      { header: 'Program',              key: 'program_name',          width: 22 },
      { header: 'Status',               key: 'status',                width: 12 },
      { header: 'Gender',               key: 'gender',                width: 10 },
      { header: 'Date of Birth',        key: 'date_of_birth',         width: 16 },
      { header: 'Residential Status',   key: 'residential_status',    width: 18 },
      { header: 'House',                key: 'house',                 width: 14 },
      { header: 'Religion',             key: 'religion',              width: 16 },
      { header: 'Denomination',         key: 'religious_denomination',width: 20 },
      { header: 'JHS Index No.',        key: 'jhs_index_number',      width: 18 },
      { header: 'Mobile No.',           key: 'mobile_number',         width: 16 },
      { header: 'Hometown',             key: 'hometown',              width: 18 },
      { header: 'Residential Address',  key: 'residential_address',   width: 28 },
      { header: 'Ghana Card No.',       key: 'ghana_card_number',     width: 20 },
      { header: 'NHIA No.',             key: 'nhia_number',           width: 16 },
      { header: 'Aggregate',            key: 'aggregate',             width: 12 },
      { header: 'Guardian Name',        key: 'guardian_name',         width: 22 },
      { header: 'Guardian Occupation',  key: 'guardian_occupation',   width: 22 },
      { header: 'Guardian Mobile',      key: 'guardian_mobile',       width: 16 },
      { header: 'Notes',                key: 'notes',                 width: 24 },
    ];
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
    ws.views   = [{ state: 'frozen', ySplit: 1 }];

    const hdr = ws.getRow(1);
    hdr.height = 24;
    cols.forEach((c, i) => {
      const cell    = hdr.getCell(i + 1);
      cell.value    = c.header;
      cell.font     = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });

    rows.forEach((r, ri) => {
      const wr = ws.getRow(ri + 2);
      cols.forEach((c, ci) => {
        const cell    = wr.getCell(ci + 1);
        cell.value    = c.key === 'date_of_birth' && r[c.key]
          ? String(r[c.key]).slice(0, 10) : (r[c.key] ?? '');
        cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFF' : 'F0FDF4' } };
        cell.font     = { size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', indent: 1 };
      });
    });

    const fname = `students_${req.query.class || 'all'}_${req.query.status || 'all'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// Teachers JSON
router.get('/personnel/teachers', async (req, res, next) => {
  try {
    const sid    = req.schoolId;
    const params = [sid];
    const conds  = ['school_id = $1'];
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`status = $${params.length}`); }
    if (req.query.department) { params.push(`%${req.query.department}%`); conds.push(`department ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT teacher_code, name, email, phone, department, rank, status, is_admin,
             gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
             academic_qualification, professional_qualification, additional_responsibility,
             bank, bank_branch, account_number, religion, religious_denomination,
             hometown, residential_address, association, ghana_card_number,
             emergency_contact_name, emergency_contact_phone, notes
      FROM teachers WHERE ${conds.join(' AND ')}
      ORDER BY name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// Teachers Excel
router.get('/personnel/teachers/excel', async (req, res, next) => {
  try {
    const sid    = req.schoolId;
    const params = [sid];
    const conds  = ['school_id = $1'];
    if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conds.push(`status = $${params.length}`); }
    if (req.query.department) { params.push(`%${req.query.department}%`); conds.push(`department ILIKE $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT teacher_code, name, email, phone, department, rank, status, is_admin,
             gov_staff_id, gender, date_of_birth, registered_number, ntc_number, ssf_number,
             academic_qualification, professional_qualification, additional_responsibility,
             bank, bank_branch, account_number, religion, religious_denomination,
             hometown, residential_address, association, ghana_card_number,
             emergency_contact_name, emergency_contact_phone, notes
      FROM teachers WHERE ${conds.join(' AND ')}
      ORDER BY name
    `, params);

    const wb  = new ExcelJS.Workbook();
    wb.creator = 'CAS Management Portal';
    const ws  = wb.addWorksheet('Teachers');
    const HDR_DARK = '0F4C35';
    const cols = [
      { header: 'Teacher ID',              key: 'teacher_code',              width: 14 },
      { header: 'Name',                    key: 'name',                       width: 28 },
      { header: 'Email',                   key: 'email',                      width: 30 },
      { header: 'Phone',                   key: 'phone',                      width: 16 },
      { header: 'Department',              key: 'department',                 width: 24 },
      { header: 'GES Rank',               key: 'rank',                       width: 28 },
      { header: 'Status',                  key: 'status',                     width: 12 },
      { header: 'Is Admin',                key: 'is_admin',                   width: 10 },
      { header: 'Gov Staff ID',            key: 'gov_staff_id',               width: 16 },
      { header: 'Gender',                  key: 'gender',                     width: 10 },
      { header: 'Date of Birth',           key: 'date_of_birth',              width: 16 },
      { header: 'Registered No.',          key: 'registered_number',          width: 18 },
      { header: 'NTC No.',                 key: 'ntc_number',                 width: 16 },
      { header: 'SSF No.',                 key: 'ssf_number',                 width: 16 },
      { header: 'Academic Qualification',  key: 'academic_qualification',     width: 24 },
      { header: 'Professional Qual.',      key: 'professional_qualification', width: 22 },
      { header: 'Add. Responsibility',     key: 'additional_responsibility',  width: 24 },
      { header: 'Bank',                    key: 'bank',                       width: 20 },
      { header: 'Bank Branch',             key: 'bank_branch',                width: 20 },
      { header: 'Account No.',             key: 'account_number',             width: 18 },
      { header: 'Religion',                key: 'religion',                   width: 16 },
      { header: 'Denomination',            key: 'religious_denomination',     width: 20 },
      { header: 'Hometown',                key: 'hometown',                   width: 18 },
      { header: 'Residential Address',     key: 'residential_address',        width: 28 },
      { header: 'Association',             key: 'association',                width: 16 },
      { header: 'Ghana Card No.',          key: 'ghana_card_number',          width: 20 },
      { header: 'Emergency Contact',       key: 'emergency_contact_name',     width: 22 },
      { header: 'Emergency Phone',         key: 'emergency_contact_phone',    width: 20 },
      { header: 'Notes',                   key: 'notes',                      width: 24 },
    ];
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
    ws.views   = [{ state: 'frozen', ySplit: 1 }];

    const hdr = ws.getRow(1);
    hdr.height = 24;
    cols.forEach((c, i) => {
      const cell     = hdr.getCell(i + 1);
      cell.value     = c.header;
      cell.font      = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });

    rows.forEach((r, ri) => {
      const wr = ws.getRow(ri + 2);
      cols.forEach((c, ci) => {
        const cell    = wr.getCell(ci + 1);
        let   val     = r[c.key];
        if (c.key === 'date_of_birth' && val) val = String(val).slice(0, 10);
        else if (c.key === 'is_admin') val = val ? 'Yes' : 'No';
        cell.value     = val ?? '';
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFF' : 'F0FDF4' } };
        cell.font      = { size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', indent: 1 };
      });
    });

    const fname = `teachers_${req.query.status || 'all'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// ── 8. Reports (reuse existing report SQL) ────────────────────────────────────
const STUDENT_REPORTS = {
  program_distribution: {
    label: 'Program Distribution', columns: ['Program','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(p.name,'No Program') AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female,
      COUNT(*) AS total
      FROM students s LEFT JOIN programs p ON p.id=s.program_id
      WHERE s.school_id=$1 ${sc} GROUP BY p.name ORDER BY p.name NULLS LAST`,
  },
  program_residential: {
    label: 'Program Distribution by Residential Status',
    columns: ['Program','Day–Male','Day–Female','Boarding–Male','Boarding–Female','Total'],
    keys:    ['group','day_male','day_female','boarding_male','boarding_female','total'],
    sql: sc => `SELECT COALESCE(p.name,'No Program') AS "group",
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Male') AS day_male,
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Female') AS day_female,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Male') AS boarding_male,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Female') AS boarding_female,
      COUNT(*) AS total
      FROM students s LEFT JOIN programs p ON p.id=s.program_id
      WHERE s.school_id=$1 ${sc} GROUP BY p.name ORDER BY p.name NULLS LAST`,
  },
  class_distribution: {
    label: 'Class Distribution', columns: ['Class','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT s.class_name AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female, COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.class_name ORDER BY s.class_name`,
  },
  house_distribution: {
    label: 'House Distribution',
    columns: ['House','Day–Male','Day–Female','Boarding–Male','Boarding–Female','Total'],
    keys:    ['group','day_male','day_female','boarding_male','boarding_female','total'],
    sql: sc => `SELECT COALESCE(s.house,'No House') AS "group",
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Male') AS day_male,
      COUNT(*) FILTER (WHERE s.residential_status='Day' AND s.gender='Female') AS day_female,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Male') AS boarding_male,
      COUNT(*) FILTER (WHERE s.residential_status='Boarding' AND s.gender='Female') AS boarding_female,
      COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.house ORDER BY s.house NULLS LAST`,
  },
  religion_distribution: {
    label: 'Religion Distribution', columns: ['Religion','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(s.religion,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE s.gender='Male') AS male,
      COUNT(*) FILTER (WHERE s.gender='Female') AS female, COUNT(*) AS total
      FROM students s WHERE s.school_id=$1 ${sc} GROUP BY s.religion ORDER BY total DESC`,
  },
};
const TEACHER_REPORTS = {
  gender_summary: {
    label: 'Gender Summary', columns: ['Gender','Count','Percentage'], keys: ['group','count','pct'], hasPercentage: true,
    sql: sc => `SELECT COALESCE(t.gender,'Not Specified') AS "group", COUNT(*) AS count
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.gender ORDER BY t.gender NULLS LAST`,
  },
  department_distribution: {
    label: 'Department Distribution', columns: ['Department','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.department,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.department ORDER BY t.department NULLS LAST`,
  },
  rank_distribution: {
    label: 'GES Rank Distribution', columns: ['Rank','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.rank,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.rank ORDER BY total DESC`,
  },
  qualification_distribution: {
    label: 'Qualification Distribution', columns: ['Qualification','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.academic_qualification,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.academic_qualification ORDER BY total DESC`,
  },
  association_distribution: {
    label: 'Association Distribution', columns: ['Association','Male','Female','Total'], keys: ['group','male','female','total'],
    sql: sc => `SELECT COALESCE(t.association,'Not Specified') AS "group",
      COUNT(*) FILTER (WHERE t.gender='Male') AS male,
      COUNT(*) FILTER (WHERE t.gender='Female') AS female, COUNT(*) AS total
      FROM teachers t WHERE t.school_id=$1 ${sc} GROUP BY t.association ORDER BY total DESC`,
  },
};

function buildTotals(keys, rows, hasPercentage) {
  const t = { group: 'TOTAL' };
  for (const k of keys.slice(1)) {
    if (k === 'pct') { t[k] = '100%'; continue; }
    t[k] = rows.reduce((s, r) => s + (parseInt(r[k]) || 0), 0);
  }
  return t;
}
function addPct(rows, keys) {
  const grand = rows.reduce((s, r) => s + (parseInt(r[keys[1]]) || 0), 0);
  return rows.map(r => ({ ...r, pct: grand ? ((parseInt(r[keys[1]])/grand)*100).toFixed(1)+'%' : '0%' }));
}

router.get('/reports', async (req, res, next) => {
  try {
    const { scope = 'students', type, status = 'active' } = req.query;
    const catalogue = scope === 'teachers' ? TEACHER_REPORTS : STUDENT_REPORTS;
    const report    = type ? catalogue[type] : Object.values(catalogue)[0];
    if (!report) return res.status(400).json({ error: 'Unknown report type' });

    const alias = scope === 'teachers' ? 't' : 's';
    const sc    = status === 'all' ? '' : `AND ${alias}.status='Active'`;
    const { rows } = await pool.query(report.sql(sc), [req.schoolId]);
    const data   = report.hasPercentage ? addPct(rows, report.keys) : rows;
    const totals = buildTotals(report.keys, data, report.hasPercentage);
    res.json({ label: report.label, columns: report.columns, keys: report.keys, rows: data, totals });
  } catch (err) { next(err); }
});

module.exports = router;
