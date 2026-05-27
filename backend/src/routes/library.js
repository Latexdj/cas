'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { uploadDocument } = require('../services/storage.service');
const { syncBookCounts } = require('./libraryAdmin');

router.use(authenticate, requireActiveSubscription);

async function libraryStaffOnly(req, res, next) {
  try {
    const role = req.user?.role;
    if (role === 'admin') return next();
    if (role === 'staff' && req.staffRoles?.includes('library')) return next();
    if (role === 'teacher') {
      const { rows } = await pool.query(
        `SELECT 1 FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key = 'library'`,
        [req.user.id, req.schoolId]
      );
      if (rows.length) { req.isLibraryTeacher = true; return next(); }
    }
    return res.status(403).json({ error: 'Library staff access only' });
  } catch (err) { next(err); }
}
router.use(libraryStaffOnly);

// ── Helper ────────────────────────────────────────────────────────────────────
async function getSettings(schoolId) {
  const { rows } = await pool.query(
    `SELECT loan_period_days, fine_per_day, max_loans_per_student
     FROM library_settings WHERE school_id = $1`,
    [schoolId]
  );
  return rows[0] ?? { loan_period_days: 14, fine_per_day: 0.50, max_loans_per_student: 3 };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res, next) => {
  try {
    const [booksRow, loansRow, overdueRow, returnsRow] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_books,
                COALESCE(SUM(available_copies),0)::int AS available_copies
         FROM library_books WHERE school_id = $1`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS active_loans FROM library_loans WHERE school_id = $1 AND status = 'active'`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS overdue_loans FROM library_loans
         WHERE school_id = $1 AND status = 'active' AND due_date < CURRENT_DATE`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS returned_today FROM library_loans
         WHERE school_id = $1 AND status = 'returned' AND returned_at::date = CURRENT_DATE`,
        [req.schoolId]
      ),
    ]);
    res.json({
      ...booksRow.rows[0],
      ...loansRow.rows[0],
      ...overdueRow.rows[0],
      ...returnsRow.rows[0],
    });
  } catch (err) { next(err); }
});

// ── Book Catalog ──────────────────────────────────────────────────────────────

router.get('/books', async (req, res, next) => {
  try {
    const { search, subject, available_only } = req.query;
    const conditions = ['school_id = $1'];
    const params = [req.schoolId];
    let p = 2;
    if (search) {
      conditions.push(`(LOWER(title) LIKE $${p} OR LOWER(author) LIKE $${p})`);
      params.push(`%${search.toLowerCase()}%`);
      p++;
    }
    if (subject)              { conditions.push(`LOWER(subject) = LOWER($${p})`); params.push(subject); p++; }
    if (available_only === 'true') { conditions.push('available_copies > 0'); }
    const { rows } = await pool.query(
      `SELECT * FROM library_books WHERE ${conditions.join(' AND ')} ORDER BY title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Student Lookup ────────────────────────────────────────────────────────────

router.get('/student/:code', async (req, res, next) => {
  try {
    const { rows: sRows } = await pool.query(
      `SELECT id, name, student_code, class_name, picture_url FROM students
       WHERE school_id = $1 AND UPPER(student_code) = UPPER($2) AND status = 'Active'`,
      [req.schoolId, req.params.code]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
    const student = sRows[0];

    const { rows: loans } = await pool.query(
      `SELECT ll.id, ll.status, ll.issued_at, ll.due_date, ll.returned_at,
              ll.fine_amount, ll.fine_paid,
              lb.title AS book_title, lb.author,
              lc.copy_number,
              (ll.due_date < CURRENT_DATE AND ll.status = 'active')::boolean AS is_overdue
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       JOIN library_copies lc ON lc.id = ll.copy_id
       WHERE ll.student_id = $1 AND ll.school_id = $2
       ORDER BY ll.issued_at DESC
       LIMIT 20`,
      [student.id, req.schoolId]
    );
    res.json({ student, loans });
  } catch (err) { next(err); }
});

// ── Issue Loan ────────────────────────────────────────────────────────────────

router.post('/loans/issue', async (req, res, next) => {
  try {
    const { student_id, copy_id, notes } = req.body;
    if (!student_id || !copy_id) return res.status(400).json({ error: 'student_id and copy_id are required' });

    const settings = await getSettings(req.schoolId);

    const { rows: sRows } = await pool.query(
      `SELECT id, name FROM students WHERE id = $1 AND school_id = $2 AND status = 'Active'`,
      [student_id, req.schoolId]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Student not found' });

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM library_loans WHERE student_id = $1 AND status = 'active'`,
      [student_id]
    );
    if (countRows[0].cnt >= settings.max_loans_per_student) {
      return res.status(409).json({ error: `Student already has ${settings.max_loans_per_student} active loan(s)` });
    }

    const { rows: cRows } = await pool.query(
      `SELECT id, book_id, is_available FROM library_copies WHERE id = $1 AND school_id = $2`,
      [copy_id, req.schoolId]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Copy not found' });
    if (!cRows[0].is_available) return res.status(409).json({ error: 'This copy is not available' });

    const bookId = cRows[0].book_id;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + settings.loan_period_days);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const role = req.user.role;
    const issuedBySchoolStaffId = role === 'staff'                                                  ? req.user.id : null;
    const issuedByTeacherId     = (role === 'teacher' || role === 'admin' || req.isLibraryTeacher) ? req.user.id : null;

    await pool.query(`UPDATE library_copies SET is_available = false WHERE id = $1`, [copy_id]);
    const { rows } = await pool.query(
      `INSERT INTO library_loans
         (school_id, copy_id, book_id, student_id,
          issued_by_school_staff_id, issued_by_teacher_id,
          due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.schoolId, copy_id, bookId, student_id,
       issuedBySchoolStaffId, issuedByTeacherId,
       dueDateStr, notes?.trim() || null]
    );
    await syncBookCounts(bookId);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── Return Loan ───────────────────────────────────────────────────────────────

router.post('/loans/:id/return', async (req, res, next) => {
  try {
    const { notes, fine_paid } = req.body;

    const { rows: loanRows } = await pool.query(
      `SELECT ll.*, lc.book_id FROM library_loans ll
       JOIN library_copies lc ON lc.id = ll.copy_id
       WHERE ll.id = $1 AND ll.school_id = $2 AND ll.status = 'active'`,
      [req.params.id, req.schoolId]
    );
    if (!loanRows.length) return res.status(404).json({ error: 'Active loan not found' });
    const loan = loanRows[0];

    const settings = await getSettings(req.schoolId);
    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(loan.due_date).getTime()) / 86400000));
    const fineAmount  = daysOverdue > 0
      ? parseFloat((daysOverdue * parseFloat(settings.fine_per_day)).toFixed(2))
      : 0;

    await pool.query(
      `UPDATE library_loans
       SET status = 'returned', returned_at = NOW(),
           fine_amount = $1, fine_paid = $2,
           notes = COALESCE($3, notes)
       WHERE id = $4`,
      [fineAmount, fine_paid === true || fine_paid === 'true', notes?.trim() || null, loan.id]
    );
    await pool.query(`UPDATE library_copies SET is_available = true WHERE id = $1`, [loan.copy_id]);
    await syncBookCounts(loan.book_id);
    res.json({ ok: true, fine_amount: fineAmount, days_overdue: daysOverdue });
  } catch (err) { next(err); }
});

// ── Mark Fine Paid ────────────────────────────────────────────────────────────

router.post('/loans/:id/fine-paid', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE library_loans SET fine_paid = true
       WHERE id = $1 AND school_id = $2 AND fine_amount > 0
       RETURNING id, fine_amount, fine_paid`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Loan not found or no outstanding fine' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Active Loans ──────────────────────────────────────────────────────────────

router.get('/loans/active', async (req, res, next) => {
  try {
    const { search } = req.query;
    const conditions = [`ll.school_id = $1`, `ll.status = 'active'`];
    const params = [req.schoolId];
    let p = 2;
    if (search) {
      conditions.push(`(LOWER(s.name) LIKE $${p} OR LOWER(s.student_code) LIKE $${p})`);
      params.push(`%${search.toLowerCase()}%`);
      p++;
    }
    const { rows } = await pool.query(
      `SELECT ll.id, ll.issued_at, ll.due_date,
              (ll.due_date < CURRENT_DATE)::boolean AS is_overdue,
              lb.title AS book_title, lc.copy_number,
              s.name AS student_name, s.student_code, s.class_name
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       JOIN library_copies lc ON lc.id = ll.copy_id
       JOIN students s ON s.id = ll.student_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ll.due_date ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Overdue Loans ─────────────────────────────────────────────────────────────

router.get('/loans/overdue', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ll.id, ll.issued_at, ll.due_date,
              (CURRENT_DATE - ll.due_date)::int AS days_overdue,
              lb.title AS book_title, lc.copy_number,
              s.name AS student_name, s.student_code, s.class_name
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       JOIN library_copies lc ON lc.id = ll.copy_id
       JOIN students s ON s.id = ll.student_id
       WHERE ll.school_id = $1 AND ll.status = 'active' AND ll.due_date < CURRENT_DATE
       ORDER BY ll.due_date ASC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Resources ─────────────────────────────────────────────────────────────────

router.get('/resources', async (req, res, next) => {
  try {
    const { resource_type, subject } = req.query;
    const conditions = ['school_id = $1'];
    const params = [req.schoolId];
    let p = 2;
    if (resource_type) { conditions.push(`resource_type = $${p}`); params.push(resource_type); p++; }
    if (subject)       { conditions.push(`LOWER(subject) = LOWER($${p})`); params.push(subject); p++; }
    const { rows } = await pool.query(
      `SELECT id, title, subject, resource_type, academic_year, level,
              file_url, file_name, file_size_kb, download_count, created_at
       FROM library_resources WHERE ${conditions.join(' AND ')}
       ORDER BY resource_type, subject, title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/resources', async (req, res, next) => {
  try {
    const { title, subject, resource_type = 'other', academic_year, level, file_data, file_name, file_size_kb } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    if (!file_data || !file_name) return res.status(400).json({ error: 'file_data and file_name are required' });
    const role = req.user.role;
    const uploadedBySchoolStaff = role === 'staff' ? req.user.id : null;
    const { url, filename } = await uploadDocument(file_data, file_name, 'library-resources');
    const { rows } = await pool.query(
      `INSERT INTO library_resources
         (school_id, title, subject, resource_type, academic_year, level, file_url, file_name,
          file_size_kb, uploaded_by_school_staff_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.schoolId, title.trim(), subject?.trim() || null, resource_type,
       academic_year?.trim() || null, level?.trim() || null,
       url, filename, file_size_kb || null, uploadedBySchoolStaff]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
