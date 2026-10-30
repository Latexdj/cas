'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { notifyTeacherBudgetReviewed } = require('../services/notification.service');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('department_budgets'));

// ── Permission helpers ──────────────────────────────────────────────────────
// Management may create/view/approve any department's budget. A HOD may only
// draft, edit and submit the budget for the department(s) they head — never
// approve their own (approval is always a management action).

function isManagementUser(user) {
  return user?.role === 'admin' || user?.role === 'super_admin' || user?.type === 'management';
}

async function getMyDepartments(schoolId, teacherId) {
  const { rows } = await pool.query(
    `SELECT id, name FROM departments WHERE school_id = $1 AND head_teacher_id = $2`,
    [schoolId, teacherId]
  );
  return rows;
}

async function canManageDepartment(schoolId, user, departmentId) {
  if (isManagementUser(user)) return true;
  const { rowCount } = await pool.query(
    `SELECT 1 FROM departments WHERE id = $1 AND school_id = $2 AND head_teacher_id = $3`,
    [departmentId, schoolId, user.id]
  );
  return rowCount > 0;
}

const EDITABLE_STATUSES = ['Draft', 'Changes Requested', 'Rejected'];

async function getCurrentAcademicYear(schoolId) {
  const { rows } = await pool.query(
    `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return rows[0]?.id ?? null;
}

const BUDGET_SELECT = `
  SELECT b.*, d.name AS department_name,
         ay.name AS academic_year_name,
         sb.name AS submitted_by_name, rb.name AS reviewed_by_name,
         (SELECT COALESCE(SUM(amount), 0) FROM department_budget_items WHERE budget_id = b.id) AS total_amount,
         (SELECT COUNT(*)::int FROM department_budget_items WHERE budget_id = b.id) AS item_count
  FROM department_budgets b
  JOIN departments d ON d.id = b.department_id
  JOIN academic_years ay ON ay.id = b.academic_year_id
  LEFT JOIN teachers sb ON sb.id = b.submitted_by
  LEFT JOIN teachers rb ON rb.id = b.reviewed_by
`;

async function loadBudget(schoolId, id) {
  const { rows } = await pool.query(`${BUDGET_SELECT} WHERE b.id = $1 AND b.school_id = $2`, [id, schoolId]);
  return rows[0] ?? null;
}

// ── Reference data ──────────────────────────────────────────────────────────

// GET /departments-mine — departments this user may draft/edit a budget for
router.get('/departments-mine', async (req, res, next) => {
  try {
    if (isManagementUser(req.user)) {
      const { rows } = await pool.query(
        `SELECT id, name FROM departments WHERE school_id = $1 ORDER BY name`,
        [req.schoolId]
      );
      return res.json(rows);
    }
    const rows = await getMyDepartments(req.schoolId, req.user.id);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── List ─────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { department_id, academic_year_id, status } = req.query;
    const params = [req.schoolId];
    const conditions = ['b.school_id = $1'];

    if (!isManagementUser(req.user)) {
      const myDepts = await getMyDepartments(req.schoolId, req.user.id);
      if (!myDepts.length) return res.json([]);
      params.push(myDepts.map(d => d.id));
      conditions.push(`b.department_id = ANY($${params.length}::uuid[])`);
    } else if (department_id) {
      params.push(department_id);
      conditions.push(`b.department_id = $${params.length}`);
    }

    if (academic_year_id) {
      params.push(academic_year_id);
      conditions.push(`b.academic_year_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }

    const { rows } = await pool.query(
      `${BUDGET_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ay.name DESC, d.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Create (Draft) ──────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const { department_id, academic_year_id, items } = req.body;
    if (!department_id) return res.status(400).json({ error: 'department_id is required' });

    const allowed = await canManageDepartment(req.schoolId, req.user, department_id);
    if (!allowed) return res.status(403).json({ error: 'You are not the head of this department' });

    const yearId = academic_year_id || await getCurrentAcademicYear(req.schoolId);
    if (!yearId) return res.status(400).json({ error: 'No academic year available — academic_year_id is required' });

    const { rows } = await pool.query(
      `INSERT INTO department_budgets (school_id, department_id, academic_year_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [req.schoolId, department_id, yearId]
    );
    const budgetId = rows[0].id;

    if (Array.isArray(items) && items.length) {
      let i = 0;
      for (const item of items) {
        if (!item.category || item.amount == null) continue;
        await pool.query(
          `INSERT INTO department_budget_items (budget_id, category, description, amount, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [budgetId, item.category.trim(), item.description?.trim() || null, item.amount, i++]
        );
      }
    }

    const budget = await loadBudget(req.schoolId, budgetId);
    res.status(201).json(budget);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This department already has a budget for that academic year' });
    }
    next(err);
  }
});

// ── Detail ───────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageDepartment(req.schoolId, req.user, budget.department_id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });

    const { rows: items } = await pool.query(
      `SELECT id, category, description, amount, sort_order FROM department_budget_items
       WHERE budget_id = $1 ORDER BY sort_order, created_at`,
      [req.params.id]
    );
    res.json({ ...budget, items });
  } catch (err) { next(err); }
});

// ── Update items (editable statuses only) ───────────────────────────────────

router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageDepartment(req.schoolId, req.user, budget.department_id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });
    if (!EDITABLE_STATUSES.includes(budget.status)) {
      return res.status(400).json({ error: `Cannot edit a budget with status "${budget.status}"` });
    }

    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
    for (const item of items) {
      if (!item.category?.trim()) return res.status(400).json({ error: 'Every item needs a category' });
      if (item.amount == null || Number(item.amount) < 0) return res.status(400).json({ error: 'Every item needs a non-negative amount' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM department_budget_items WHERE budget_id = $1`, [req.params.id]);
    let i = 0;
    for (const item of items) {
      await client.query(
        `INSERT INTO department_budget_items (budget_id, category, description, amount, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, item.category.trim(), item.description?.trim() || null, item.amount, i++]
      );
    }
    await client.query(`UPDATE department_budgets SET updated_at = now() WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');

    const updated = await loadBudget(req.schoolId, req.params.id);
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── Submit for approval ──────────────────────────────────────────────────

router.post('/:id/submit', async (req, res, next) => {
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageDepartment(req.schoolId, req.user, budget.department_id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });
    if (!EDITABLE_STATUSES.includes(budget.status)) {
      return res.status(400).json({ error: `Cannot submit a budget with status "${budget.status}"` });
    }
    if (!budget.item_count) return res.status(400).json({ error: 'Add at least one line item before submitting' });

    const { rows } = await pool.query(
      `UPDATE department_budgets
       SET status = 'Submitted', submitted_by = $1, submitted_at = now(), review_note = NULL, updated_at = now()
       WHERE id = $2 RETURNING id`,
      [req.user.id, req.params.id]
    );
    res.json(await loadBudget(req.schoolId, rows[0].id));
  } catch (err) { next(err); }
});

// ── Management review actions ────────────────────────────────────────────

async function reviewBudget(req, res, next, { nextStatus, requireNote }) {
  try {
    if (!isManagementUser(req.user)) return res.status(403).json({ error: 'Only management can review a budget' });
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    if (budget.status !== 'Submitted') return res.status(400).json({ error: 'Only a submitted budget can be reviewed' });

    const note = req.body?.note?.trim() || null;
    if (requireNote && !note) return res.status(400).json({ error: 'A note is required' });

    const { rows } = await pool.query(
      `UPDATE department_budgets
       SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3, updated_at = now()
       WHERE id = $4 RETURNING id`,
      [nextStatus, req.user.id, note, req.params.id]
    );
    const updated = await loadBudget(req.schoolId, rows[0].id);

    // Notify whoever submitted it, falling back to the department's current
    // head (e.g. if management drafted and submitted it on the HOD's behalf).
    let recipient = null;
    if (budget.submitted_by) {
      const { rows: r } = await pool.query(`SELECT id, name, email FROM teachers WHERE id = $1`, [budget.submitted_by]);
      recipient = r[0] || null;
    }
    if (!recipient) {
      const { rows: r } = await pool.query(
        `SELECT t.id, t.name, t.email FROM teachers t JOIN departments d ON d.head_teacher_id = t.id WHERE d.id = $1`,
        [budget.department_id]
      );
      recipient = r[0] || null;
    }
    if (recipient?.email) {
      notifyTeacherBudgetReviewed(req.schoolId, recipient, updated, budget.department_name)
        .catch(err => console.error('[DepartmentBudgets] notify failed:', err.message));
    }

    res.json(updated);
  } catch (err) { next(err); }
}

router.post('/:id/approve', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Approved', requireNote: false }));
router.post('/:id/request-changes', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Changes Requested', requireNote: true }));
router.post('/:id/reject', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Rejected', requireNote: true }));

// ── Delete (Draft only — a mistaken creation) ───────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageDepartment(req.schoolId, req.user, budget.department_id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });
    if (budget.status !== 'Draft') return res.status(400).json({ error: 'Only a draft budget can be deleted' });

    await pool.query(`DELETE FROM department_budgets WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Budget deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
