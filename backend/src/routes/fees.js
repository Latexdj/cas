const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

// ── Fee Items ─────────────────────────────────────────────────────────────────

router.get('/items', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, is_active, created_at
       FROM fee_items WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/items', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
    const { rows } = await pool.query(
      `INSERT INTO fee_items (school_id, name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.schoolId, name.trim(), description?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/items/:id', async (req, res, next) => {
  try {
    const { name, description, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
    const { rows } = await pool.query(
      `UPDATE fee_items SET name=$1, description=$2, is_active=$3
       WHERE id=$4 AND school_id=$5 RETURNING *`,
      [name.trim(), description?.trim() || null, is_active !== false, req.params.id, req.schoolId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const { rows: bills } = await pool.query(
      `SELECT 1 FROM student_bills WHERE fee_item_id=$1 AND school_id=$2 LIMIT 1`,
      [req.params.id, req.schoolId]
    );
    if (bills.length > 0) {
      return res.status(400).json({ error: 'Cannot delete: this fee item has bills linked to it. Deactivate it instead.' });
    }
    await pool.query(`DELETE FROM fee_items WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// ── Fee Schedules ─────────────────────────────────────────────────────────────

router.get('/schedules', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT fs.*, fi.name AS fee_item_name, ay.name AS academic_year_name
       FROM fee_schedules fs
       LEFT JOIN fee_items fi ON fi.id = fs.fee_item_id
       LEFT JOIN academic_years ay ON ay.id = fs.academic_year_id
       WHERE fs.school_id = $1
       ORDER BY fs.created_at DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/schedules', async (req, res, next) => {
  try {
    const { fee_item_id, academic_year_id, semester, class_name, amount, due_date } = req.body;
    if (!fee_item_id) return res.status(400).json({ error: 'Fee item is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
    const { rows } = await pool.query(
      `INSERT INTO fee_schedules (school_id, fee_item_id, academic_year_id, semester, class_name, amount, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.schoolId, fee_item_id, academic_year_id || null, semester || null,
       class_name?.trim() || null, Number(amount), due_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/schedules/:id', async (req, res, next) => {
  try {
    const { fee_item_id, academic_year_id, semester, class_name, amount, due_date } = req.body;
    if (!fee_item_id) return res.status(400).json({ error: 'Fee item is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
    const { rows } = await pool.query(
      `UPDATE fee_schedules SET fee_item_id=$1, academic_year_id=$2, semester=$3,
         class_name=$4, amount=$5, due_date=$6
       WHERE id=$7 AND school_id=$8 RETURNING *`,
      [fee_item_id, academic_year_id || null, semester || null,
       class_name?.trim() || null, Number(amount), due_date || null, req.params.id, req.schoolId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/schedules/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM fee_schedules WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// POST /api/fees/schedules/:id/generate — bulk-create bills for matching students
router.post('/schedules/:id/generate', async (req, res, next) => {
  try {
    const { rows: [schedule] } = await pool.query(
      `SELECT fs.*, fi.name AS fee_item_name, ay.name AS academic_year_name
       FROM fee_schedules fs
       LEFT JOIN fee_items fi ON fi.id = fs.fee_item_id
       LEFT JOIN academic_years ay ON ay.id = fs.academic_year_id
       WHERE fs.id=$1 AND fs.school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });

    const parts = [schedule.fee_item_name];
    if (schedule.academic_year_name) parts.push(schedule.academic_year_name);
    if (schedule.semester) parts.push(`Term ${schedule.semester}`);
    const description = parts.join(' — ');

    // Single bulk INSERT — avoids N+1 timeouts on large student populations
    const params = [
      req.schoolId,              // $1
      schedule.fee_item_id,      // $2
      schedule.id,               // $3
      schedule.academic_year_id, // $4
      schedule.semester,         // $5
      description,               // $6
      schedule.amount,           // $7
      schedule.due_date,         // $8
    ];
    let classClause = '';
    if (schedule.class_name) {
      classClause = 'AND s.class_name = $9';
      params.push(schedule.class_name);
    }

    const { rowCount } = await pool.query(
      `INSERT INTO student_bills
         (school_id, student_id, fee_item_id, fee_schedule_id, academic_year_id, semester, description, amount, due_date)
       SELECT $1, s.id, $2, $3, $4, $5, $6, $7, $8
       FROM students s
       WHERE s.school_id = $1 AND s.status = 'Active' ${classClause}
         AND NOT EXISTS (
           SELECT 1 FROM student_bills sb WHERE sb.student_id = s.id AND sb.fee_schedule_id = $3
         )`,
      params
    );

    if (rowCount === 0) {
      return res.json({ message: 'All matching students already have a bill for this schedule. Nothing to generate.', inserted: 0, skipped: 0 });
    }
    res.json({ message: `Generated ${rowCount} bill(s).`, inserted: rowCount, skipped: 0 });
  } catch (err) { next(err); }
});

// ── Student Bills ─────────────────────────────────────────────────────────────

router.get('/bills', async (req, res, next) => {
  try {
    const { student_id, class_name, year_id, semester } = req.query;
    const conditions = ['sb.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (student_id) { conditions.push(`sb.student_id = $${i++}`); params.push(student_id); }
    if (class_name)  { conditions.push(`s.class_name = $${i++}`); params.push(class_name); }
    if (year_id)     { conditions.push(`sb.academic_year_id = $${i++}`); params.push(year_id); }
    if (semester)    { conditions.push(`sb.semester = $${i++}`); params.push(Number(semester)); }

    const { rows } = await pool.query(
      `SELECT sb.*,
              s.name AS student_name, s.student_code, s.class_name,
              fi.name AS fee_item_name,
              COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.bill_id = sb.id),0) AS amount_paid
       FROM student_bills sb
       JOIN students s ON s.id = sb.student_id
       LEFT JOIN fee_items fi ON fi.id = sb.fee_item_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sb.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/bills', async (req, res, next) => {
  try {
    const { student_id, fee_item_id, academic_year_id, semester, description, amount, due_date } = req.body;
    if (!student_id) return res.status(400).json({ error: 'Student is required.' });
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
    const { rows } = await pool.query(
      `INSERT INTO student_bills (school_id, student_id, fee_item_id, academic_year_id, semester, description, amount, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.schoolId, student_id, fee_item_id || null, academic_year_id || null,
       semester || null, description.trim(), Number(amount), due_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/bills/:id', async (req, res, next) => {
  try {
    const { rows: payments } = await pool.query(
      `SELECT 1 FROM fee_payments WHERE bill_id=$1 LIMIT 1`, [req.params.id]
    );
    if (payments.length > 0) {
      return res.status(400).json({ error: 'Cannot delete a bill that has payments. Void the payments first.' });
    }
    await pool.query(`DELETE FROM student_bills WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// ── Payments ──────────────────────────────────────────────────────────────────

router.get('/payments', async (req, res, next) => {
  try {
    const { student_id, class_name, from, to } = req.query;
    const conditions = ['fp.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (student_id) { conditions.push(`fp.student_id = $${i++}`); params.push(student_id); }
    if (class_name)  { conditions.push(`s.class_name = $${i++}`); params.push(class_name); }
    if (from)        { conditions.push(`fp.payment_date >= $${i++}`); params.push(from); }
    if (to)          { conditions.push(`fp.payment_date <= $${i++}`); params.push(to); }

    const { rows } = await pool.query(
      `SELECT fp.*,
              s.name AS student_name, s.student_code, s.class_name,
              fi.name AS fee_item_name
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       LEFT JOIN fee_items fi ON fi.id = fp.fee_item_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY fp.payment_date DESC, fp.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/payments', async (req, res, next) => {
  try {
    const { student_id, bill_id, fee_item_id, amount, payment_date, payment_method, reference, notes } = req.body;
    if (!student_id) return res.status(400).json({ error: 'Student is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });

    const dateStr = (payment_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const receipt_no = `RCP-${dateStr}-${rand}`;

    const { rows } = await pool.query(
      `INSERT INTO fee_payments
         (school_id, student_id, bill_id, fee_item_id, amount, payment_date, payment_method,
          reference, notes, recorded_by, receipt_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.schoolId, student_id, bill_id || null, fee_item_id || null, Number(amount),
       payment_date || new Date().toISOString().slice(0, 10),
       payment_method || 'Cash', reference?.trim() || null, notes?.trim() || null,
       req.user.name || 'Admin', receipt_no]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/payments/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM fee_payments WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Voided.' });
  } catch (err) { next(err); }
});

// ── Student Summary ───────────────────────────────────────────────────────────

router.get('/student/:id/summary', async (req, res, next) => {
  try {
    const { rows: studentRows } = await pool.query(
      `SELECT id, name, student_code, class_name FROM students WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!studentRows[0]) return res.status(404).json({ error: 'Student not found.' });

    const { rows: bills } = await pool.query(
      `SELECT sb.*,
              fi.name AS fee_item_name,
              COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.bill_id = sb.id),0) AS amount_paid
       FROM student_bills sb
       LEFT JOIN fee_items fi ON fi.id = sb.fee_item_id
       WHERE sb.student_id=$1 AND sb.school_id=$2
       ORDER BY sb.created_at DESC`,
      [req.params.id, req.schoolId]
    );

    const { rows: payments } = await pool.query(
      `SELECT fp.*, fi.name AS fee_item_name
       FROM fee_payments fp
       LEFT JOIN fee_items fi ON fi.id = fp.fee_item_id
       WHERE fp.student_id=$1 AND fp.school_id=$2
       ORDER BY fp.payment_date DESC, fp.created_at DESC`,
      [req.params.id, req.schoolId]
    );

    const total_billed = bills.reduce((s, b) => s + Number(b.amount), 0);
    const total_paid   = payments.reduce((s, p) => s + Number(p.amount), 0);
    const outstanding  = total_billed - total_paid;

    res.json({ student: studentRows[0], bills, payments, total_billed, total_paid, outstanding });
  } catch (err) { next(err); }
});

// ── Reports ───────────────────────────────────────────────────────────────────

router.get('/reports/arrears', async (req, res, next) => {
  try {
    const { year_id, semester, class_name } = req.query;
    const conditions = ['sb.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (year_id)    { conditions.push(`sb.academic_year_id = $${i++}`); params.push(year_id); }
    if (semester)   { conditions.push(`sb.semester = $${i++}`); params.push(Number(semester)); }
    if (class_name) { conditions.push(`s.class_name = $${i++}`); params.push(class_name); }

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.name AS student_name, s.student_code, s.class_name,
              SUM(sb.amount) AS total_billed,
              COALESCE(SUM(p.paid),0) AS total_paid,
              SUM(sb.amount) - COALESCE(SUM(p.paid),0) AS outstanding
       FROM student_bills sb
       JOIN students s ON s.id = sb.student_id
       LEFT JOIN (
         SELECT bill_id, SUM(amount) AS paid FROM fee_payments GROUP BY bill_id
       ) p ON p.bill_id = sb.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id, s.name, s.student_code, s.class_name
       HAVING SUM(sb.amount) - COALESCE(SUM(p.paid),0) > 0
       ORDER BY s.class_name, outstanding DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/reports/collections', async (req, res, next) => {
  try {
    const { from, to, class_name } = req.query;
    const conditions = ['fp.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (from)       { conditions.push(`fp.payment_date >= $${i++}`); params.push(from); }
    if (to)         { conditions.push(`fp.payment_date <= $${i++}`); params.push(to); }
    if (class_name) { conditions.push(`s.class_name = $${i++}`); params.push(class_name); }

    const { rows } = await pool.query(
      `SELECT fp.payment_date, fp.payment_method,
              SUM(fp.amount) AS total, COUNT(*)::int AS count
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY fp.payment_date, fp.payment_method
       ORDER BY fp.payment_date DESC`,
      params
    );
    const grand_total = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json({ rows, grand_total });
  } catch (err) { next(err); }
});

// GET /api/fees/classes — distinct class names that have students with bills
router.get('/classes', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT s.class_name
       FROM students s WHERE s.school_id=$1 AND s.status='Active' AND s.class_name IS NOT NULL
       ORDER BY s.class_name`,
      [req.schoolId]
    );
    res.json(rows.map(r => r.class_name));
  } catch (err) { next(err); }
});

// GET /api/fees/stats — summary counts for dashboard header
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(sb.amount),0) AS total_billed,
         COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.school_id=$1),0) AS total_collected,
         COUNT(DISTINCT sb.student_id)::int AS students_with_bills
       FROM student_bills sb
       WHERE sb.school_id=$1`,
      [req.schoolId]
    );
    const r = rows[0];
    res.json({
      total_billed:    Number(r.total_billed),
      total_collected: Number(r.total_collected),
      outstanding:     Number(r.total_billed) - Number(r.total_collected),
      students_with_bills: r.students_with_bills,
    });
  } catch (err) { next(err); }
});

module.exports = router;
