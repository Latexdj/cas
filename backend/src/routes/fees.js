const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { getClassRoster, resolveStudentClassAtPeriod, mapWithLimit } = require('../services/classHistory.service');
const { getCurrentYearSem } = require('../utils/school-context');

router.use(authenticate, requireActiveSubscription);

// Day-to-day bill/payment recording — open to admins and to school_staff
// accounts explicitly given the 'accounts' role (Settings > Staff Accounts).
// Fee structure config (items CUD, schedules, bulk generate), expenditure,
// and financial reports stay adminOnly below — an accounts clerk records
// transactions, they don't redefine what's chargeable or see net position.
function accountsAccess(req, res, next) {
  const role = req.user?.role;
  if (role === 'admin' || role === 'super_admin') return next();
  if (role === 'staff' && req.staffRoles?.includes('accounts')) return next();
  return res.status(403).json({ error: 'Accounts staff access only' });
}

// ── Fee Items ─────────────────────────────────────────────────────────────────

router.get('/items', accountsAccess, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, is_active, created_at
       FROM fee_items WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/items', adminOnly, async (req, res, next) => {
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

router.put('/items/:id', adminOnly, async (req, res, next) => {
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

router.delete('/items/:id', adminOnly, async (req, res, next) => {
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

router.get('/schedules', adminOnly, async (req, res, next) => {
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

router.post('/schedules', adminOnly, async (req, res, next) => {
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

router.put('/schedules/:id', adminOnly, async (req, res, next) => {
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

router.delete('/schedules/:id', adminOnly, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM fee_schedules WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// POST /api/fees/schedules/:id/generate — bulk-create bills for matching students
router.post('/schedules/:id/generate', adminOnly, async (req, res, next) => {
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
      if (schedule.academic_year_id) {
        // Targets a specific term — resolve who was actually in this class
        // during that term via class_history, not who is in it right now.
        // Otherwise a student promoted out of the targeted class between the
        // schedule's own term and whenever "Generate" is clicked would be
        // silently skipped forever (no later schedule targets their new class).
        const roster = await getClassRoster(req.schoolId, schedule.class_name, schedule.academic_year_id, schedule.semester);
        if (roster.length === 0) {
          return res.json({ message: 'No students were in that class during that term. Nothing to generate.', inserted: 0, skipped: 0 });
        }
        classClause = 'AND s.id = ANY($9::uuid[])';
        params.push(roster);
      } else {
        // "Any Year" recurring schedule — no fixed term to resolve against,
        // so it intentionally targets whoever is currently in the class.
        classClause = 'AND s.class_name = $9';
        params.push(schedule.class_name);
      }
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

router.get('/bills', accountsAccess, async (req, res, next) => {
  try {
    const { student_id, class_name, year_id, semester } = req.query;
    const conditions = ['sb.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (student_id) { conditions.push(`sb.student_id = $${i++}`); params.push(student_id); }
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

    if (!class_name) return res.json(rows);

    // A student's current class_name only reflects who they are *now* — a
    // bill created while they were in class X must still show under X even
    // after they're promoted. Resolve each bill's class as of its own
    // (academic_year_id, semester); bills predating that tracking (no
    // year/semester recorded) fall back to the student's current class.
    const filtered = await mapWithLimit(rows, 3, async (r) => {
      let resolvedClass = r.class_name;
      if (r.academic_year_id != null && r.semester != null) {
        resolvedClass = await resolveStudentClassAtPeriod(req.schoolId, r.student_id, r.class_name, r.academic_year_id, r.semester);
      }
      return resolvedClass?.toLowerCase() === class_name.toLowerCase() ? r : null;
    });
    res.json(filtered.filter(Boolean));
  } catch (err) { next(err); }
});

router.post('/bills', accountsAccess, async (req, res, next) => {
  try {
    let { student_id, fee_item_id, academic_year_id, semester, description, amount, due_date } = req.body;
    if (!student_id) return res.status(400).json({ error: 'Student is required.' });
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
    // An ad-hoc bill with no year/semester is permanently un-attributable to
    // any term — it never shows up in a term-scoped report or arrears filter.
    // Default to the school's current term when the caller doesn't specify one.
    if (!academic_year_id || !semester) {
      const current = await getCurrentYearSem(req.schoolId);
      academic_year_id = academic_year_id || current.yearId;
      semester = semester || current.sem;
    }
    const { rows } = await pool.query(
      `INSERT INTO student_bills (school_id, student_id, fee_item_id, academic_year_id, semester, description, amount, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.schoolId, student_id, fee_item_id || null, academic_year_id || null,
       semester || null, description.trim(), Number(amount), due_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/bills/:id', accountsAccess, async (req, res, next) => {
  try {
    const { rows: payments } = await pool.query(
      `SELECT 1 FROM fee_payments WHERE bill_id=$1 AND school_id=$2 LIMIT 1`,
      [req.params.id, req.schoolId]
    );
    if (payments.length > 0) {
      return res.status(400).json({ error: 'Cannot delete a bill that has payments. Void the payments first.' });
    }
    await pool.query(`DELETE FROM student_bills WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// ── Payments ──────────────────────────────────────────────────────────────────

router.get('/payments', accountsAccess, async (req, res, next) => {
  try {
    const { student_id, class_name, from, to } = req.query;
    const conditions = ['fp.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (student_id) { conditions.push(`fp.student_id = $${i++}`); params.push(student_id); }
    if (from)        { conditions.push(`fp.payment_date >= $${i++}`); params.push(from); }
    if (to)          { conditions.push(`fp.payment_date <= $${i++}`); params.push(to); }

    const { rows } = await pool.query(
      `SELECT fp.*,
              s.name AS student_name, s.student_code, s.class_name,
              fi.name AS fee_item_name,
              sb.academic_year_id AS bill_academic_year_id, sb.semester AS bill_semester
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       LEFT JOIN fee_items fi ON fi.id = fp.fee_item_id
       LEFT JOIN student_bills sb ON sb.id = fp.bill_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY fp.payment_date DESC, fp.created_at DESC
       LIMIT 200`,
      params
    );

    if (!class_name) return res.json(rows);

    // Same reasoning as GET /bills: resolve via the linked bill's own term
    // when one exists; an ad-hoc payment with no bill falls back to current class.
    const filtered = await mapWithLimit(rows, 3, async (r) => {
      let resolvedClass = r.class_name;
      if (r.bill_academic_year_id != null && r.bill_semester != null) {
        resolvedClass = await resolveStudentClassAtPeriod(req.schoolId, r.student_id, r.class_name, r.bill_academic_year_id, r.bill_semester);
      }
      return resolvedClass?.toLowerCase() === class_name.toLowerCase() ? r : null;
    });
    res.json(filtered.filter(Boolean));
  } catch (err) { next(err); }
});

router.post('/payments', accountsAccess, async (req, res, next) => {
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

router.delete('/payments/:id', accountsAccess, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM fee_payments WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Voided.' });
  } catch (err) { next(err); }
});

// ── Student Summary ───────────────────────────────────────────────────────────

router.get('/student/:id/summary', accountsAccess, async (req, res, next) => {
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

router.get('/reports/arrears', adminOnly, async (req, res, next) => {
  try {
    const { year_id, semester, class_name } = req.query;
    // A specific (year_id, semester) pins every aggregated bill in a group to
    // that one term, so the student's class *as of that term* is well-defined
    // and resolvable via class_history. Without both, arrears aggregates
    // across potentially many terms — there's no single period to resolve
    // against, so class_name there can only mean "currently in this class".
    const canResolveHistorically = !!(year_id && semester && class_name);
    const conditions = ['sb.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (year_id)    { conditions.push(`sb.academic_year_id = $${i++}`); params.push(year_id); }
    if (semester)   { conditions.push(`sb.semester = $${i++}`); params.push(Number(semester)); }
    if (class_name && !canResolveHistorically) { conditions.push(`s.class_name = $${i++}`); params.push(class_name); }

    const { rows } = await pool.query(
      `SELECT s.id AS student_id, s.name AS student_name, s.student_code, s.class_name,
              SUM(sb.amount) AS total_billed,
              COALESCE(SUM(p.paid),0) AS total_paid,
              SUM(sb.amount) - COALESCE(SUM(p.paid),0) AS outstanding
       FROM student_bills sb
       JOIN students s ON s.id = sb.student_id
       LEFT JOIN (
         SELECT bill_id, SUM(amount) AS paid FROM fee_payments WHERE school_id=$1 GROUP BY bill_id
       ) p ON p.bill_id = sb.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id, s.name, s.student_code, s.class_name
       HAVING SUM(sb.amount) - COALESCE(SUM(p.paid),0) > 0
       ORDER BY s.class_name, outstanding DESC`,
      params
    );

    if (!canResolveHistorically) return res.json(rows);

    const filtered = await mapWithLimit(rows, 3, async (r) => {
      const resolvedClass = await resolveStudentClassAtPeriod(req.schoolId, r.student_id, r.class_name, year_id, semester);
      return resolvedClass?.toLowerCase() === class_name.toLowerCase() ? r : null;
    });
    res.json(filtered.filter(Boolean));
  } catch (err) { next(err); }
});

router.get('/reports/collections', adminOnly, async (req, res, next) => {
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

// GET /api/fees/students/search?q= — fast student search for Collections tab
router.get('/students/search', accountsAccess, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    // Inactive/withdrawn students are included (not just Active) — an accounts
    // clerk still needs to find a transferred or dropped-out student to record
    // a final payment or check an outstanding balance on the way out.
    const { rows } = await pool.query(
      `SELECT id, name, student_code, class_name, status
       FROM students
       WHERE school_id = $1 AND status != 'Graduated'
         AND (name ILIKE $2 OR student_code ILIKE $2)
       ORDER BY (status = 'Active') DESC, name LIMIT 15`,
      [req.schoolId, `%${q}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/fees/classes — distinct class names that have students with bills
router.get('/classes', accountsAccess, async (req, res, next) => {
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

// GET /api/fees/stats — summary counts for dashboard header. Admin-only: it
// includes total_expenses/net_position, which is expenditure-domain data an
// accounts clerk recording bills/payments doesn't need visibility into.
router.get('/stats', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE((SELECT SUM(sb.amount) FROM student_bills sb WHERE sb.school_id=$1),0) AS total_billed,
         COALESCE((SELECT SUM(fp.amount) FROM fee_payments fp WHERE fp.school_id=$1),0) AS total_collected,
         COALESCE((SELECT SUM(se.amount) FROM school_expenses se WHERE se.school_id=$1),0) AS total_expenses,
         (SELECT COUNT(DISTINCT sb2.student_id) FROM student_bills sb2 WHERE sb2.school_id=$1)::int AS students_with_bills`,
      [req.schoolId]
    );
    const r = rows[0];
    const total_collected = Number(r.total_collected);
    const total_expenses  = Number(r.total_expenses);
    res.json({
      total_billed:        Number(r.total_billed),
      total_collected,
      outstanding:         Number(r.total_billed) - total_collected,
      total_expenses,
      net_position:        total_collected - total_expenses,
      students_with_bills: r.students_with_bills,
    });
  } catch (err) { next(err); }
});

// ── Expenditure ───────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'Salaries & Wages', 'Utilities', 'Stationery & Supplies',
  'Maintenance & Repairs', 'Transport & Fuel', 'Food & Catering',
  'Medical & Health', 'Printing & Copying', 'Sports & Activities',
  'Petty Cash', 'Other',
];

router.get('/expenses', adminOnly, async (req, res, next) => {
  try {
    const { from, to, category } = req.query;
    const conditions = ['se.school_id = $1'];
    const params = [req.schoolId];
    let i = 2;
    if (from)     { conditions.push(`se.expense_date >= $${i++}`); params.push(from); }
    if (to)       { conditions.push(`se.expense_date <= $${i++}`); params.push(to); }
    if (category) { conditions.push(`se.category = $${i++}`); params.push(category); }

    const { rows } = await pool.query(
      `SELECT * FROM school_expenses se
       WHERE ${conditions.join(' AND ')}
       ORDER BY se.expense_date DESC, se.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/expenses', adminOnly, async (req, res, next) => {
  try {
    const { category, description, amount, expense_date, payment_method, paid_to, reference, notes } = req.body;
    if (!category?.trim())    return res.status(400).json({ error: 'Category is required.' });
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
    const { rows } = await pool.query(
      `INSERT INTO school_expenses
         (school_id, category, description, amount, expense_date, payment_method, paid_to, reference, recorded_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.schoolId, category.trim(), description.trim(), Number(amount),
       expense_date || new Date().toISOString().slice(0, 10),
       payment_method || 'Cash', paid_to?.trim() || null, reference?.trim() || null,
       req.user.name || 'Admin', notes?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/expenses/:id', adminOnly, async (req, res, next) => {
  try {
    const { category, description, amount, expense_date, payment_method, paid_to, reference, notes } = req.body;
    if (!category?.trim())    return res.status(400).json({ error: 'Category is required.' });
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required.' });
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
    const { rows } = await pool.query(
      `UPDATE school_expenses
       SET category=$1, description=$2, amount=$3, expense_date=$4,
           payment_method=$5, paid_to=$6, reference=$7, notes=$8
       WHERE id=$9 AND school_id=$10 RETURNING *`,
      [category.trim(), description.trim(), Number(amount),
       expense_date || new Date().toISOString().slice(0, 10),
       payment_method || 'Cash', paid_to?.trim() || null, reference?.trim() || null,
       notes?.trim() || null, req.params.id, req.schoolId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/expenses/:id', adminOnly, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM school_expenses WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

router.get('/reports/income-vs-expenditure', adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const incomeParams  = [req.schoolId];
    const expenseParams = [req.schoolId];
    let incomeClause = 'fp.school_id = $1';
    let expenseClause = 'se.school_id = $1';
    if (from) {
      incomeParams.push(from);   incomeClause  += ` AND fp.payment_date >= $${incomeParams.length}`;
      expenseParams.push(from);  expenseClause += ` AND se.expense_date >= $${expenseParams.length}`;
    }
    if (to) {
      incomeParams.push(to);   incomeClause  += ` AND fp.payment_date <= $${incomeParams.length}`;
      expenseParams.push(to);  expenseClause += ` AND se.expense_date <= $${expenseParams.length}`;
    }

    const [incomeRes, expenseRes, byCategory] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(fp.amount),0) AS total FROM fee_payments fp WHERE ${incomeClause}`, incomeParams),
      pool.query(`SELECT COALESCE(SUM(se.amount),0) AS total FROM school_expenses se WHERE ${expenseClause}`, expenseParams),
      pool.query(
        `SELECT se.category, SUM(se.amount) AS total
         FROM school_expenses se WHERE ${expenseClause}
         GROUP BY se.category ORDER BY total DESC`,
        expenseParams
      ),
    ]);

    const income      = Number(incomeRes.rows[0].total);
    const expenditure = Number(expenseRes.rows[0].total);
    res.json({
      income,
      expenditure,
      net: income - expenditure,
      by_category: byCategory.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
