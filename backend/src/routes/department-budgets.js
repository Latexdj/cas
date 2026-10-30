'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { notifyTeacherBudgetReviewed } = require('../services/notification.service');
const { generateBudgetReportPDFBuffer } = require('../services/pdf.service');

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

// A "custom" budget (an office with no departments row, e.g. Exam Office,
// Academics) has no head_teacher_id to check against, so only management can
// create or manage one. A real department's budget keeps the HOD-or-management rule.
async function canManageBudget(schoolId, user, budget) {
  if (budget.department_id) return canManageDepartment(schoolId, user, budget.department_id);
  return isManagementUser(user);
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
  SELECT b.*, COALESCE(d.name, b.custom_department_name) AS department_name,
         (b.department_id IS NULL) AS is_custom_department,
         ay.name AS academic_year_name,
         sb.name AS submitted_by_name, rb.name AS reviewed_by_name,
         (SELECT COALESCE(SUM(amount), 0) FROM department_budget_items WHERE budget_id = b.id) AS total_amount,
         (SELECT COUNT(*)::int FROM department_budget_items WHERE budget_id = b.id) AS item_count
  FROM department_budgets b
  LEFT JOIN departments d ON d.id = b.department_id
  JOIN academic_years ay ON ay.id = b.academic_year_id
  LEFT JOIN teachers sb ON sb.id = b.submitted_by
  LEFT JOIN teachers rb ON rb.id = b.reviewed_by
`;

async function loadBudget(schoolId, id) {
  const { rows } = await pool.query(`${BUDGET_SELECT} WHERE b.id = $1 AND b.school_id = $2`, [id, schoolId]);
  return rows[0] ?? null;
}

// amount is always server-computed from quantity x unit_price, never taken
// from the client directly — null (shown as "-") until a unit price is known,
// matching how the paper worksheet this mirrors leaves price blank.
function computeAmount(quantity, unitPrice) {
  if (unitPrice == null || unitPrice === '') return null;
  return Math.round(Number(quantity) * Number(unitPrice) * 100) / 100;
}

function validateItem(item) {
  if (!item.category?.trim()) return 'Every item needs a category';
  if (item.quantity == null || Number(item.quantity) <= 0) return 'Every item needs a quantity greater than 0';
  if (item.unit_price != null && item.unit_price !== '' && Number(item.unit_price) < 0) return 'Unit price cannot be negative';
  return null;
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

// GET /departments-all — every department's id/name, for the population
// calculator's "department" basis (read-only, not gated by headship — a
// count by name reveals nothing sensitive).
router.get('/departments-all', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM departments WHERE school_id = $1 ORDER BY name`, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Population-based quantity calculator ────────────────────────────────────

const POPULATION_BASES = [
  'all_students', 'class_level', 'all_teachers', 'department',
  'subjects_school', 'subjects_class', 'subjects_class_level',
  'students_offering_subject',
];
// Bases that need a class_levels row to resolve.
const CLASS_LEVEL_BASES = ['class_level', 'subjects_class_level'];

// Students, across a given set of classes, who actually sit a given subject —
// the real exam-paper-printing population. Per class: no class_subjects row
// for that subject means the class doesn't take it at all (0 contributed); a
// row with is_elective=false means the whole class takes it (a core
// subject); is_elective=true means only the student_electives enrollees in
// that class count. This mirrors the roster-narrowing rule in
// electives.service.js, but (unlike that helper) must also tell "not
// offered at all" apart from "offered to everyone", so it queries
// class_subjects directly rather than reusing that helper.
async function resolveStudentsOfferingSubject(schoolId, subjectId, classIds) {
  if (!subjectId || !Array.isArray(classIds) || !classIds.length) return 0;

  const { rows: classRows } = await pool.query(
    `SELECT id, name FROM classes WHERE id = ANY($1::uuid[]) AND school_id = $2`,
    [classIds, schoolId]
  );
  let total = 0;
  for (const cls of classRows) {
    const { rows: csRows } = await pool.query(
      `SELECT is_elective FROM class_subjects WHERE school_id = $1 AND LOWER(class_name) = LOWER($2) AND subject_id = $3`,
      [schoolId, cls.name, subjectId]
    );
    if (!csRows.length) continue; // this class doesn't offer the subject at all

    if (!csRows[0].is_elective) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM students WHERE school_id = $1 AND status = 'Active' AND LOWER(class_name) = LOWER($2)`,
        [schoolId, cls.name]
      );
      total += rows[0].n;
    } else {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM students s
         JOIN student_electives se ON se.student_id = s.id AND se.subject_id = $3
         WHERE s.school_id = $1 AND s.status = 'Active' AND LOWER(s.class_name) = LOWER($2)`,
        [schoolId, cls.name, subjectId]
      );
      total += rows[0].n;
    }
  }
  return total;
}

async function resolvePopulationCount(schoolId, basis, classLevelId, departmentId, classId, subjectId, classIds) {
  if (basis === 'all_students') {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM students WHERE school_id = $1 AND status = 'Active'`, [schoolId]);
    return rows[0].n;
  }
  if (basis === 'class_level') {
    if (!classLevelId) return 0;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM students s
       JOIN classes c ON c.school_id = s.school_id AND LOWER(c.name) = LOWER(s.class_name)
       WHERE s.school_id = $1 AND s.status = 'Active' AND c.level_id = $2`,
      [schoolId, classLevelId]
    );
    return rows[0].n;
  }
  if (basis === 'all_teachers') {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM teachers WHERE school_id = $1 AND status = 'Active'`, [schoolId]);
    return rows[0].n;
  }
  if (basis === 'department') {
    if (!departmentId) return 0;
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT t.id)::int AS n FROM teachers t
       WHERE t.school_id = $1 AND t.status = 'Active' AND (
         EXISTS (SELECT 1 FROM department_teachers dt WHERE dt.teacher_id = t.id AND dt.department_id = $2)
         OR EXISTS (SELECT 1 FROM departments d WHERE d.id = $2 AND LOWER(d.name) = LOWER(t.department))
       )`,
      [schoolId, departmentId]
    );
    return rows[0].n;
  }
  // Subject counts come from class_subjects (what's actually allocated to a
  // class), not the raw subjects catalog — a subject nobody teaches yet
  // shouldn't inflate an "A4 per subject" style calculation.
  if (basis === 'subjects_school') {
    const { rows } = await pool.query(`SELECT COUNT(DISTINCT subject_id)::int AS n FROM class_subjects WHERE school_id = $1`, [schoolId]);
    return rows[0].n;
  }
  if (basis === 'subjects_class') {
    if (!classId) return 0;
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT cs.subject_id)::int AS n FROM class_subjects cs
       JOIN classes c ON c.school_id = cs.school_id AND LOWER(c.name) = LOWER(cs.class_name)
       WHERE cs.school_id = $1 AND c.id = $2`,
      [schoolId, classId]
    );
    return rows[0].n;
  }
  if (basis === 'subjects_class_level') {
    if (!classLevelId) return 0;
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT cs.subject_id)::int AS n FROM class_subjects cs
       JOIN classes c ON c.school_id = cs.school_id AND LOWER(c.name) = LOWER(cs.class_name)
       WHERE cs.school_id = $1 AND c.level_id = $2`,
      [schoolId, classLevelId]
    );
    return rows[0].n;
  }
  if (basis === 'students_offering_subject') {
    return resolveStudentsOfferingSubject(schoolId, subjectId, classIds);
  }
  return 0;
}

// GET /population?basis=&class_level_id=&department_id=&class_id=&subject_id=&class_ids= — live count for a basis
router.get('/population', async (req, res, next) => {
  try {
    const { basis, class_level_id, department_id, class_id, subject_id, class_ids } = req.query;
    if (!POPULATION_BASES.includes(basis)) {
      return res.status(400).json({ error: `basis must be one of: ${POPULATION_BASES.join(', ')}` });
    }
    const classIdList = class_ids ? class_ids.split(',').map(s => s.trim()).filter(Boolean) : [];
    const count = await resolvePopulationCount(req.schoolId, basis, class_level_id, department_id, class_id, subject_id, classIdList);
    res.json({
      basis, class_level_id: class_level_id || null, department_id: department_id || null,
      class_id: class_id || null, subject_id: subject_id || null, class_ids: classIdList, count,
    });
  } catch (err) { next(err); }
});

// GET /subjects-for-classes?class_ids=a,b,c — every subject actually
// allocated (via class_subjects) to any of the given classes. Drives the
// "whole exam" bulk calculator's subject list, so it only ever shows
// subjects that are really offered there instead of the full school catalog.
router.get('/subjects-for-classes', async (req, res, next) => {
  try {
    const classIds = (req.query.class_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!classIds.length) return res.json([]);
    const { rows } = await pool.query(
      `SELECT DISTINCT s.id, s.name FROM class_subjects cs
       JOIN classes c ON c.school_id = cs.school_id AND LOWER(c.name) = LOWER(cs.class_name)
       JOIN subjects s ON s.id = cs.subject_id
       WHERE cs.school_id = $1 AND c.id = ANY($2::uuid[])
       ORDER BY s.name`,
      [req.schoolId, classIds]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Population per subject across a set of classes, in ONE query — the
// "whole exam" calculator can have dozens of subjects x dozens of classes,
// and resolving each (subject, class) pair with its own round trip (as the
// single-subject resolver above does) turns into thousands of sequential
// DB calls that blow past the frontend's request timeout well before the
// work itself is actually heavy. Same elective rule, just computed
// server-side in two aggregated branches instead of a nested loop:
// is_elective=false -> every active student in that class; is_elective=true
// -> only the student_electives enrollees. A class with no class_subjects
// row for a subject contributes nothing, same as before.
async function resolvePopulationsForSubjects(schoolId, classIds, subjectIds) {
  const { rows } = await pool.query(
    `SELECT subject_id, SUM(n)::int AS n FROM (
       SELECT cs.subject_id, COUNT(DISTINCT st.id) AS n
       FROM class_subjects cs
       JOIN classes c ON c.school_id = cs.school_id AND LOWER(c.name) = LOWER(cs.class_name)
       JOIN students st ON st.school_id = cs.school_id AND LOWER(st.class_name) = LOWER(cs.class_name) AND st.status = 'Active'
       WHERE cs.school_id = $1 AND c.id = ANY($2::uuid[]) AND cs.subject_id = ANY($3::uuid[]) AND cs.is_elective = false
       GROUP BY cs.subject_id
       UNION ALL
       SELECT cs.subject_id, COUNT(DISTINCT st.id) AS n
       FROM class_subjects cs
       JOIN classes c ON c.school_id = cs.school_id AND LOWER(c.name) = LOWER(cs.class_name)
       JOIN students st ON st.school_id = cs.school_id AND LOWER(st.class_name) = LOWER(cs.class_name) AND st.status = 'Active'
       JOIN student_electives se ON se.student_id = st.id AND se.subject_id = cs.subject_id
       WHERE cs.school_id = $1 AND c.id = ANY($2::uuid[]) AND cs.subject_id = ANY($3::uuid[]) AND cs.is_elective = true
       GROUP BY cs.subject_id
     ) combined
     GROUP BY subject_id`,
    [schoolId, classIds, subjectIds]
  );
  const populations = {};
  for (const id of subjectIds) populations[id] = 0;
  for (const row of rows) populations[row.subject_id] = row.n;
  return populations;
}

// POST /population-bulk — population per subject in one round trip, for the
// "whole exam" calculator (one subject's paper at a time would mean one
// request per subject).
router.post('/population-bulk', async (req, res, next) => {
  try {
    const { class_ids, subject_ids } = req.body;
    if (!Array.isArray(class_ids) || !class_ids.length) return res.status(400).json({ error: 'class_ids must be a non-empty array' });
    if (!Array.isArray(subject_ids) || !subject_ids.length) return res.status(400).json({ error: 'subject_ids must be a non-empty array' });
    const populations = await resolvePopulationsForSubjects(req.schoolId, class_ids, subject_ids);
    res.json({ populations });
  } catch (err) { next(err); }
});

const FORMULA_SELECT = `
  SELECT f.*, cl.name AS class_level_name, d.name AS department_name, cls.name AS class_name, sub.name AS subject_name,
         (SELECT COALESCE(array_agg(c.name ORDER BY c.name), '{}') FROM classes c WHERE c.id = ANY(f.class_ids)) AS class_names
  FROM budget_item_formulas f
  LEFT JOIN class_levels cl ON cl.id = f.class_level_id
  LEFT JOIN departments d ON d.id = f.department_id
  LEFT JOIN classes cls ON cls.id = f.class_id
  LEFT JOIN subjects sub ON sub.id = f.subject_id
`;

// GET /formulas?item_name=... — the saved formula for that item name (or null)
router.get('/formulas', async (req, res, next) => {
  try {
    const { item_name } = req.query;
    if (item_name) {
      const { rows } = await pool.query(
        `${FORMULA_SELECT} WHERE f.school_id = $1 AND LOWER(f.item_name) = LOWER($2)`,
        [req.schoolId, item_name.trim()]
      );
      return res.json(rows[0] ?? null);
    }
    const { rows } = await pool.query(`${FORMULA_SELECT} WHERE f.school_id = $1 ORDER BY f.item_name`, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /formulas — upsert the reusable formula for an item name (by school + lower(item_name))
router.put('/formulas', async (req, res, next) => {
  try {
    const {
      item_name, population_basis, class_level_id, department_id, class_id, subject_id, class_ids,
      ratio, buffer_pct, calc_mode = 'ratio', pages_per_paper, double_sided, sheets_per_unit,
    } = req.body;
    if (!item_name?.trim()) return res.status(400).json({ error: 'item_name is required' });
    if (!POPULATION_BASES.includes(population_basis)) {
      return res.status(400).json({ error: `population_basis must be one of: ${POPULATION_BASES.join(', ')}` });
    }
    if (!['ratio', 'print_job'].includes(calc_mode)) return res.status(400).json({ error: `calc_mode must be 'ratio' or 'print_job'` });
    if (CLASS_LEVEL_BASES.includes(population_basis) && !class_level_id) return res.status(400).json({ error: 'class_level_id is required for that basis' });
    if (population_basis === 'department' && !department_id) return res.status(400).json({ error: 'department_id is required for that basis' });
    if (population_basis === 'subjects_class' && !class_id) return res.status(400).json({ error: 'class_id is required for that basis' });
    if (population_basis === 'students_offering_subject') {
      if (!subject_id) return res.status(400).json({ error: 'subject_id is required for that basis' });
      if (!Array.isArray(class_ids) || !class_ids.length) return res.status(400).json({ error: 'class_ids must be a non-empty array for that basis' });
    }
    if (calc_mode === 'print_job' && !(Number(pages_per_paper) > 0)) {
      return res.status(400).json({ error: 'pages_per_paper must be greater than 0 for print_job mode' });
    }
    if (!(Number(ratio) > 0)) return res.status(400).json({ error: 'ratio must be greater than 0' });

    const { rows } = await pool.query(
      `INSERT INTO budget_item_formulas
         (school_id, item_name, population_basis, class_level_id, department_id, class_id, subject_id, class_ids,
          ratio, buffer_pct, calc_mode, pages_per_paper, double_sided, sheets_per_unit, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (school_id, LOWER(item_name)) DO UPDATE SET
         population_basis = EXCLUDED.population_basis,
         class_level_id   = EXCLUDED.class_level_id,
         department_id    = EXCLUDED.department_id,
         class_id          = EXCLUDED.class_id,
         subject_id        = EXCLUDED.subject_id,
         class_ids         = EXCLUDED.class_ids,
         ratio             = EXCLUDED.ratio,
         buffer_pct        = EXCLUDED.buffer_pct,
         calc_mode         = EXCLUDED.calc_mode,
         pages_per_paper   = EXCLUDED.pages_per_paper,
         double_sided      = EXCLUDED.double_sided,
         sheets_per_unit   = EXCLUDED.sheets_per_unit,
         updated_at        = now()
       RETURNING *`,
      [req.schoolId, item_name.trim(), population_basis,
       CLASS_LEVEL_BASES.includes(population_basis) ? class_level_id : null,
       population_basis === 'department' ? department_id : null,
       population_basis === 'subjects_class' ? class_id : null,
       population_basis === 'students_offering_subject' ? subject_id : null,
       population_basis === 'students_offering_subject' ? class_ids : null,
       ratio, buffer_pct || 0, calc_mode,
       calc_mode === 'print_job' ? pages_per_paper : null,
       double_sided ?? true,
       calc_mode === 'print_job' ? (sheets_per_unit || null) : null,
       req.user.id]
    );
    res.json(rows[0]);
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
      `${BUDGET_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ay.name DESC, COALESCE(d.name, b.custom_department_name)`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Create (Draft) ──────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const { department_id, custom_department_name, academic_year_id, items } = req.body;
    const customName = custom_department_name?.trim() || null;
    if (!department_id && !customName) return res.status(400).json({ error: 'department_id or custom_department_name is required' });
    if (department_id && customName) return res.status(400).json({ error: 'Provide either department_id or custom_department_name, not both' });

    if (department_id) {
      const allowed = await canManageDepartment(req.schoolId, req.user, department_id);
      if (!allowed) return res.status(403).json({ error: 'You are not the head of this department' });
    } else if (!isManagementUser(req.user)) {
      return res.status(403).json({ error: 'Only management can create a budget for an office outside the department list' });
    }

    const yearId = academic_year_id || await getCurrentAcademicYear(req.schoolId);
    if (!yearId) return res.status(400).json({ error: 'No academic year available — academic_year_id is required' });

    const { rows } = await pool.query(
      `INSERT INTO department_budgets (school_id, department_id, custom_department_name, academic_year_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.schoolId, department_id || null, customName, yearId]
    );
    const budgetId = rows[0].id;

    if (Array.isArray(items) && items.length) {
      let i = 0;
      for (const item of items) {
        if (validateItem(item)) continue;
        await pool.query(
          `INSERT INTO department_budget_items (budget_id, category, description, quantity, unit_price, amount, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [budgetId, item.category.trim(), item.description?.trim() || null, item.quantity,
           item.unit_price ?? null, computeAmount(item.quantity, item.unit_price), i++]
        );
      }
    }

    const budget = await loadBudget(req.schoolId, budgetId);
    res.status(201).json(budget);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This department or office already has a budget for that academic year' });
    }
    next(err);
  }
});

// ── Detail ───────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageBudget(req.schoolId, req.user, budget);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });

    const { rows: items } = await pool.query(
      `SELECT id, category, description, quantity, unit_price, amount, sort_order FROM department_budget_items
       WHERE budget_id = $1 ORDER BY sort_order, created_at`,
      [req.params.id]
    );
    res.json({ ...budget, items });
  } catch (err) { next(err); }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageBudget(req.schoolId, req.user, budget);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });

    const { rows: items } = await pool.query(
      `SELECT id, category, description, quantity, unit_price, amount, sort_order FROM department_budget_items
       WHERE budget_id = $1 ORDER BY sort_order, created_at`,
      [req.params.id]
    );
    const { rows: [school] } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);

    const pdfBuffer = await generateBudgetReportPDFBuffer(budget, items, school);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="budget-${budget.department_name.replace(/[^a-z0-9]+/gi, '-')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// ── Update items (editable statuses only) ───────────────────────────────────

router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const budget = await loadBudget(req.schoolId, req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const allowed = await canManageBudget(req.schoolId, req.user, budget);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });
    if (!EDITABLE_STATUSES.includes(budget.status)) {
      return res.status(400).json({ error: `Cannot edit a budget with status "${budget.status}"` });
    }

    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
    for (const item of items) {
      const err = validateItem(item);
      if (err) return res.status(400).json({ error: err });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM department_budget_items WHERE budget_id = $1`, [req.params.id]);
    let i = 0;
    for (const item of items) {
      await client.query(
        `INSERT INTO department_budget_items (budget_id, category, description, quantity, unit_price, amount, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, item.category.trim(), item.description?.trim() || null, item.quantity,
         item.unit_price ?? null, computeAmount(item.quantity, item.unit_price), i++]
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
    const allowed = await canManageBudget(req.schoolId, req.user, budget);
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
    const allowed = await canManageBudget(req.schoolId, req.user, budget);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this budget' });
    if (budget.status !== 'Draft') return res.status(400).json({ error: 'Only a draft budget can be deleted' });

    await pool.query(`DELETE FROM department_budgets WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Budget deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
