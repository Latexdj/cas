'use strict';
const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription, adminOnly } = require('../middleware/auth');
const { uploadDocument } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription, adminOnly);

// ── Helper ────────────────────────────────────────────────────────────────────
async function syncBookCounts(bookId) {
  await pool.query(
    `UPDATE library_books
     SET total_copies     = (SELECT COUNT(*) FROM library_copies WHERE book_id = $1),
         available_copies = (SELECT COUNT(*) FROM library_copies WHERE book_id = $1 AND is_available = true)
     WHERE id = $1`,
    [bookId]
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM library_settings WHERE school_id = $1`, [req.schoolId]
    );
    res.json(rows[0] ?? { loan_period_days: 14, fine_per_day: 0.50, max_loans_per_student: 3 });
  } catch (err) { next(err); }
});

router.put('/settings', async (req, res, next) => {
  try {
    const { loan_period_days = 14, fine_per_day = 0.50, max_loans_per_student = 3 } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO library_settings (school_id, loan_period_days, fine_per_day, max_loans_per_student)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (school_id) DO UPDATE
         SET loan_period_days      = EXCLUDED.loan_period_days,
             fine_per_day          = EXCLUDED.fine_per_day,
             max_loans_per_student = EXCLUDED.max_loans_per_student
       RETURNING *`,
      [req.schoolId, loan_period_days, fine_per_day, max_loans_per_student]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Books ─────────────────────────────────────────────────────────────────────

router.get('/books', async (req, res, next) => {
  try {
    const { search, subject, category } = req.query;
    const conditions = ['school_id = $1'];
    const params = [req.schoolId];
    let p = 2;
    if (search) {
      conditions.push(`(LOWER(title) LIKE $${p} OR LOWER(author) LIKE $${p})`);
      params.push(`%${search.toLowerCase()}%`);
      p++;
    }
    if (subject)  { conditions.push(`LOWER(subject) = LOWER($${p})`); params.push(subject); p++; }
    if (category) { conditions.push(`category = $${p}`);              params.push(category); p++; }
    const { rows } = await pool.query(
      `SELECT * FROM library_books WHERE ${conditions.join(' AND ')} ORDER BY title`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/books', async (req, res, next) => {
  try {
    const { title, author, isbn, subject, category = 'general', level, cover_url } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO library_books (school_id, title, author, isbn, subject, category, level, cover_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.schoolId, title.trim(), author?.trim() || null, isbn?.trim() || null,
       subject?.trim() || null, category, level?.trim() || null, cover_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/books/:id', async (req, res, next) => {
  try {
    const { title, author, isbn, subject, category, level, cover_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE library_books
       SET title     = COALESCE($1, title),
           author    = COALESCE($2, author),
           isbn      = COALESCE($3, isbn),
           subject   = COALESCE($4, subject),
           category  = COALESCE($5, category),
           level     = COALESCE($6, level),
           cover_url = COALESCE($7, cover_url)
       WHERE id = $8 AND school_id = $9
       RETURNING *`,
      [title?.trim() || null, author?.trim() || null, isbn?.trim() || null,
       subject?.trim() || null, category || null, level?.trim() || null, cover_url || null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Book not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/books/:id', async (req, res, next) => {
  try {
    const { rows: loanRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM library_loans WHERE book_id = $1 AND status = 'active'`,
      [req.params.id]
    );
    if (loanRows[0].cnt > 0) return res.status(409).json({ error: 'Cannot delete a book with active loans' });
    const { rows } = await pool.query(
      `DELETE FROM library_books WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Book not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Copies ────────────────────────────────────────────────────────────────────

router.get('/books/:id/copies', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT lc.*,
              ll.id AS loan_id, ll.due_date, ll.issued_at,
              s.name AS borrower_name, s.student_code AS borrower_code
       FROM library_copies lc
       LEFT JOIN library_loans ll ON ll.copy_id = lc.id AND ll.status = 'active'
       LEFT JOIN students s ON s.id = ll.student_id
       WHERE lc.book_id = $1 AND lc.school_id = $2
       ORDER BY lc.copy_number`,
      [req.params.id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/books/:id/copies', async (req, res, next) => {
  try {
    const { copy_number, condition = 'Good' } = req.body;
    if (!copy_number?.trim()) return res.status(400).json({ error: 'copy_number is required' });
    const { rows: bookRows } = await pool.query(
      `SELECT id FROM library_books WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!bookRows.length) return res.status(404).json({ error: 'Book not found' });
    const { rows } = await pool.query(
      `INSERT INTO library_copies (school_id, book_id, copy_number, condition)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.schoolId, req.params.id, copy_number.trim(), condition]
    );
    await syncBookCounts(req.params.id);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Copy number already exists for this book' });
    next(err);
  }
});

router.put('/books/:id/copies/:copyId', async (req, res, next) => {
  try {
    const { condition } = req.body;
    const { rows } = await pool.query(
      `UPDATE library_copies SET condition = COALESCE($1, condition)
       WHERE id = $2 AND book_id = $3 AND school_id = $4 RETURNING *`,
      [condition || null, req.params.copyId, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Copy not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/books/:id/copies/:copyId', async (req, res, next) => {
  try {
    const { rows: loanRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM library_loans WHERE copy_id = $1 AND status = 'active'`,
      [req.params.copyId]
    );
    if (loanRows[0].cnt > 0) return res.status(409).json({ error: 'Cannot delete a copy with an active loan' });
    const { rows } = await pool.query(
      `DELETE FROM library_copies WHERE id = $1 AND book_id = $2 AND school_id = $3 RETURNING id`,
      [req.params.copyId, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Copy not found' });
    await syncBookCounts(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Library Staff ─────────────────────────────────────────────────────────────

router.get('/staff', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, is_active, created_at FROM library_staff
       WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/staff', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'name, email and password are required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await pool.query(
      `INSERT INTO library_staff (school_id, name, email, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id, name, email, is_active, created_at`,
      [req.schoolId, name.trim(), email.trim().toLowerCase(), hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A staff account with this email already exists' });
    next(err);
  }
});

router.put('/staff/:id', async (req, res, next) => {
  try {
    const { name, email, password, is_active } = req.body;
    let hash;
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      hash = await bcrypt.hash(String(password), 12);
    }
    const { rows } = await pool.query(
      `UPDATE library_staff
       SET name          = COALESCE($1, name),
           email         = COALESCE($2, email),
           password_hash = COALESCE($3, password_hash),
           is_active     = COALESCE($4, is_active)
       WHERE id = $5 AND school_id = $6
       RETURNING id, name, email, is_active, created_at`,
      [name?.trim() || null, email?.trim().toLowerCase() || null,
       hash || null, is_active ?? null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    next(err);
  }
});

router.delete('/staff/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM library_staff WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Staff not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Loans (admin overview) ────────────────────────────────────────────────────

router.get('/loans', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const conditions = ['ll.school_id = $1'];
    const params = [req.schoolId];
    let p = 2;
    if (status) { conditions.push(`ll.status = $${p}`); params.push(status); p++; }
    if (search) {
      conditions.push(`(LOWER(s.name) LIKE $${p} OR LOWER(s.student_code) LIKE $${p})`);
      params.push(`%${search.toLowerCase()}%`);
      p++;
    }
    const { rows } = await pool.query(
      `SELECT ll.id, ll.status, ll.issued_at, ll.due_date, ll.returned_at,
              ll.fine_amount, ll.fine_paid, ll.notes,
              lb.title AS book_title, lb.author,
              lc.copy_number,
              s.name AS student_name, s.student_code, s.class_name,
              lst.name AS issued_by,
              (ll.due_date < CURRENT_DATE AND ll.status = 'active')::boolean AS is_overdue
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       JOIN library_copies lc ON lc.id = ll.copy_id
       JOIN students s ON s.id = ll.student_id
       LEFT JOIN library_staff lst ON lst.id = ll.issued_by_staff_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ll.issued_at DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/loans/overdue', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ll.id, ll.issued_at, ll.due_date,
              (CURRENT_DATE - ll.due_date)::int AS days_overdue,
              ll.fine_amount, ll.fine_paid,
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
    const conditions = ['lr.school_id = $1'];
    const params = [req.schoolId];
    let p = 2;
    if (resource_type) { conditions.push(`lr.resource_type = $${p}`); params.push(resource_type); p++; }
    if (subject)       { conditions.push(`LOWER(lr.subject) = LOWER($${p})`); params.push(subject); p++; }
    const { rows } = await pool.query(
      `SELECT lr.*, lst.name AS uploaded_by_name
       FROM library_resources lr
       LEFT JOIN library_staff lst ON lst.id = lr.uploaded_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY lr.created_at DESC`,
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
    let url, filename;
    try {
      ({ url, filename } = await uploadDocument(file_data, file_name, 'library-resources'));
    } catch (uploadErr) {
      return res.status(422).json({ error: uploadErr.message });
    }
    const { rows } = await pool.query(
      `INSERT INTO library_resources
         (school_id, title, subject, resource_type, academic_year, level, file_url, file_name, file_size_kb)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.schoolId, title.trim(), subject?.trim() || null, resource_type,
       academic_year?.trim() || null, level?.trim() || null,
       url, filename, file_size_kb || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/resources/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM library_resources WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Resource not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Dashboard Stats ───────────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const [booksRow, loansRow, overdueRow, resourcesRow] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_books,
                COALESCE(SUM(total_copies),0)::int AS total_copies,
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
        `SELECT COUNT(*)::int AS total_resources FROM library_resources WHERE school_id = $1`,
        [req.schoolId]
      ),
    ]);
    res.json({
      ...booksRow.rows[0],
      ...loansRow.rows[0],
      ...overdueRow.rows[0],
      ...resourcesRow.rows[0],
    });
  } catch (err) { next(err); }
});

module.exports = { router, syncBookCounts };
