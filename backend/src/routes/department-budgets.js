'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');
const { generateBudgetReportPDFBuffer } = require('../services/pdf.service');
const perms = require('../services/budget-permissions');
const {
  BUDGET_SELECT, loadBudget, loadItems, loadEvents, loadCompilation, loadSchoolBudget, logBudgetEvent, getCurrentAcademicYear,
} = require('../services/budget-data');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('department_budgets'));

// Resolve the caller once per request (who they head, which track they
// review, whether they're the Accountant). See services/budget-permissions.js.
router.use(async (req, res, next) => {
  try { req.budgetActor = await perms.resolveBudgetActor(req); next(); }
  catch (err) { next(err); }
});

function httpErr(status, message) {
  const e = new Error(message); e.status = status; e.expose = true; return e;
}
function sendErr(res, next, err) {
  if (err.expose) return res.status(err.status).json({ error: err.message });
  return next(err);
}

async function notifyTeachers(schoolId, teachers, title, message) {
  await Promise.all(teachers.filter(Boolean).map(t => Promise.all([
    createNotification(schoolId, t.id, title, message),
    t.email ? sendTeacherEmail(t.email, title, message) : null,
  ]))).catch(err => console.error('[DepartmentBudgets] notify failed:', err.message));
}

// The teacher who should hear about this budget's outcome: whoever submitted
// it, else the department/unit's current teacher head. Staff heads have no
// notification inbox; they see it on their Home dashboard instead.
async function budgetOwnerTeacher(budget) {
  const ids = [budget.submitted_by];
  const { rows } = await pool.query(
    `SELECT COALESCE(
       (SELECT head_teacher_id FROM departments WHERE id = $1),
       (SELECT head_teacher_id FROM budget_units WHERE id = $2)) AS head`,
    [budget.department_id, budget.budget_unit_id]
  );
  ids.push(rows[0]?.head);
  for (const id of ids.filter(Boolean)) {
    const { rows: t } = await pool.query(`SELECT id, name, email FROM teachers WHERE id = $1`, [id]);
    if (t[0]) return t[0];
  }
  return null;
}

// Loads a budget plus everything its permissions depend on, and refuses if
// the caller may not see it.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadBudgetContext(req, id) {
  if (!UUID_RE.test(id)) throw httpErr(404, 'Budget not found');
  const budget = await loadBudget(req.schoolId, id);
  if (!budget) throw httpErr(404, 'Budget not found');
  const [compilation, schoolBudget] = await Promise.all([
    loadCompilation(req.schoolId, budget.academic_year_id, budget.track),
    loadSchoolBudget(req.schoolId, budget.academic_year_id),
  ]);
  if (!perms.canView(req.budgetActor, budget, compilation)) throw httpErr(403, 'You do not have access to this budget');
  const permissions = perms.budgetPermissions(req.budgetActor, budget, compilation, schoolBudget);
  return { budget, compilation, schoolBudget, permissions };
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

// GET /departments-mine — departments and budget units this user may draft a
// budget for. kind tells the client which id field to send when creating.
router.get('/departments-mine', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const [{ rows: depts }, { rows: units }] = await Promise.all([
      pool.query(
        `SELECT id, name, 'department' AS kind, 'academic' AS track FROM departments
         WHERE school_id = $1 AND ($2::boolean OR id = ANY($3::uuid[])) ORDER BY name`,
        [req.schoolId, a.isAdmin, a.hodDepartmentIds]
      ),
      pool.query(
        `SELECT id, name, 'unit' AS kind, track FROM budget_units
         WHERE school_id = $1 AND is_active AND ($2::boolean OR id = ANY($3::uuid[])) ORDER BY name`,
        [req.schoolId, a.isAdmin, a.unitIds]
      ),
    ]);
    res.json([...depts, ...units]);
  } catch (err) { next(err); }
});

// GET /me — what this caller can do in the budgets module, so each portal
// shows the right tabs.
router.get('/me', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    res.json({
      name: a.name,
      is_admin: a.isAdmin,
      management_role: a.managementRole,
      is_accountant: a.isAccountant,
      view_all: a.viewAll,
      can_approve_compilations: a.canApproveCompilations,
      reviewer_tracks: [...a.reviewerTracks],
      heads_budget: a.isAdmin || a.hodDepartmentIds.length > 0 || a.unitIds.length > 0,
      can_create_custom: a.isAdmin || a.reviewerTracks.size > 0,
    });
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

// The current academic year + semester, as every other "what's actually
// happening right now" query in this codebase resolves it (e.g. timetable.js's
// coverage analysis). Semester may legitimately be null for a school that
// doesn't split terms — callers pass it through as a null-tolerant filter.
async function getCurrentYearAndSemester(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return { yearId: rows[0]?.id ?? null, semester: rows[0]?.current_semester ?? null };
}

// GET /subjects-for-classes?class_ids=a,b,c — every subject actually
// timetabled for any of the given classes THIS term. Drives the "whole exam"
// bulk calculator's subject list.
//
// Deliberately reads the timetable, not class_subjects (the Curriculum ->
// Allocations table): class_subjects has no notion of "current term" and
// just accumulates — a subject allocated for a past semester or program
// never gets automatically pruned, so it kept showing up here and inflating
// an exam-paper budget for subjects nobody is actually sitting. The
// timetable is scoped to a specific academic_year_id + semester, so it
// reflects what's genuinely being taught right now (mirrors how
// timetable.js's own coverage report treats class_subjects as "the plan"
// and the timetable as "the reality").
router.get('/subjects-for-classes', async (req, res, next) => {
  try {
    const classIds = (req.query.class_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!classIds.length) return res.json([]);
    const { yearId, semester } = await getCurrentYearAndSemester(req.schoolId);
    if (!yearId) return res.json([]);
    const { rows } = await pool.query(
      `SELECT DISTINCT s.id, s.name
       FROM timetable t
       JOIN LATERAL unnest(string_to_array(t.class_names, ',')) AS cls(class_name) ON TRUE
       JOIN classes c ON c.school_id = t.school_id AND LOWER(c.name) = LOWER(TRIM(cls.class_name))
       JOIN subjects s ON LOWER(s.name) = LOWER(TRIM(t.subject)) AND s.school_id = t.school_id
       WHERE t.school_id = $1 AND c.id = ANY($2::uuid[])
         AND t.academic_year_id = $3
         AND ($4::int IS NULL OR t.semester = $4::int)
       ORDER BY s.name`,
      [req.schoolId, classIds, yearId, semester]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Population per subject across a set of classes, in ONE query — the
// "whole exam" calculator can have dozens of subjects x dozens of classes,
// and resolving each (subject, class) pair with its own round trip (as the
// single-subject resolver above does) turns into thousands of sequential
// DB calls that blow past the frontend's request timeout well before the
// work itself is actually heavy.
//
// A (class, subject) pair counts at all only if it's on the CURRENT
// timetable — matching subjects-for-classes above, so a stale
// class_subjects allocation can't inflate a headcount for a subject nobody
// is actually sitting this term. class_subjects is then consulted only to
// narrow a pair down to its elective enrollees when it explicitly says
// is_elective = true; no row there (or is_elective = false) means the
// whole class counts, which also fixes the opposite gap — a subject
// genuinely on this term's timetable but never allocated in Curriculum ->
// Allocations no longer gets silently zeroed out.
async function resolvePopulationsForSubjects(schoolId, classIds, subjectIds, yearId, semester) {
  const { rows } = await pool.query(
    `WITH taught AS (
       SELECT DISTINCT c.id AS class_id, c.name AS class_name, s.id AS subject_id
       FROM timetable t
       JOIN LATERAL unnest(string_to_array(t.class_names, ',')) AS cls(class_name) ON TRUE
       JOIN classes c ON c.school_id = t.school_id AND LOWER(c.name) = LOWER(TRIM(cls.class_name))
       JOIN subjects s ON LOWER(s.name) = LOWER(TRIM(t.subject)) AND s.school_id = t.school_id
       WHERE t.school_id = $1 AND c.id = ANY($2::uuid[]) AND s.id = ANY($3::uuid[])
         AND t.academic_year_id = $4 AND ($5::int IS NULL OR t.semester = $5::int)
     ),
     flagged AS (
       SELECT taught.subject_id, taught.class_name,
              COALESCE(cs.is_elective, false) AS is_elective
       FROM taught
       LEFT JOIN class_subjects cs ON cs.school_id = $1 AND LOWER(cs.class_name) = LOWER(taught.class_name) AND cs.subject_id = taught.subject_id
     ),
     core AS (
       SELECT f.subject_id, COUNT(DISTINCT st.id) AS n
       FROM flagged f
       JOIN students st ON st.school_id = $1 AND LOWER(st.class_name) = LOWER(f.class_name) AND st.status = 'Active'
       WHERE f.is_elective = false
       GROUP BY f.subject_id
     ),
     elective AS (
       SELECT f.subject_id, COUNT(DISTINCT st.id) AS n
       FROM flagged f
       JOIN students st ON st.school_id = $1 AND LOWER(st.class_name) = LOWER(f.class_name) AND st.status = 'Active'
       JOIN student_electives se ON se.student_id = st.id AND se.subject_id = f.subject_id
       WHERE f.is_elective = true
       GROUP BY f.subject_id
     )
     SELECT subject_id, SUM(n)::int AS n FROM (SELECT * FROM core UNION ALL SELECT * FROM elective) combined
     GROUP BY subject_id`,
    [schoolId, classIds, subjectIds, yearId, semester]
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
    const { yearId, semester } = await getCurrentYearAndSemester(req.schoolId);
    if (!yearId) return res.status(400).json({ error: 'No current academic year configured' });
    const populations = await resolvePopulationsForSubjects(req.schoolId, class_ids, subject_ids, yearId, semester);
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
       req.budgetActor.teacherId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Compilations, school budget, budget units, tasks ────────────────────────
// Mounted before the /:id routes so '/compilations' etc. aren't read as ids.
router.use(require('./budget-compilations'));

// ── List ─────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const { department_id, academic_year_id, status, track } = req.query;
    const params = [req.schoolId];
    const conditions = ['b.school_id = $1'];

    // What a caller sees: everything (admin, principal, vice principal), the
    // tracks they review, and budgets they own. The Accountant sees accepted
    // budgets once that track's compilation is approved.
    if (!a.viewAll) {
      const scope = [];
      if (a.reviewerTracks.size) { params.push([...a.reviewerTracks]); scope.push(`b.track = ANY($${params.length}::text[])`); }
      if (a.hodDepartmentIds.length) { params.push(a.hodDepartmentIds); scope.push(`b.department_id = ANY($${params.length}::uuid[])`); }
      if (a.unitIds.length) { params.push(a.unitIds); scope.push(`b.budget_unit_id = ANY($${params.length}::uuid[])`); }
      if (a.isAccountant) {
        scope.push(`(b.status = 'Accepted' AND EXISTS (SELECT 1 FROM budget_compilations c
                     WHERE c.school_id = b.school_id AND c.academic_year_id = b.academic_year_id
                       AND c.track = b.track AND c.status = 'Approved'))`);
      }
      if (!scope.length) return res.json([]);
      conditions.push(`(${scope.join(' OR ')})`);
    }

    if (department_id) { params.push(department_id); conditions.push(`b.department_id = $${params.length}`); }
    if (academic_year_id) { params.push(academic_year_id); conditions.push(`b.academic_year_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`b.status = $${params.length}`); }
    if (track) { params.push(track); conditions.push(`b.track = $${params.length}`); }

    const { rows } = await pool.query(
      `${BUDGET_SELECT} WHERE ${conditions.join(' AND ')}
       ORDER BY ay.name DESC, b.track, COALESCE(d.name, u.name, b.custom_department_name)`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Create (Draft) ──────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const { department_id, budget_unit_id, custom_department_name, academic_year_id, items } = req.body;
    const customName = custom_department_name?.trim() || null;
    const owners = [department_id, budget_unit_id, customName].filter(Boolean);
    if (owners.length !== 1) throw httpErr(400, 'Choose exactly one department, unit or office for this budget');

    let track;
    if (department_id) {
      if (!a.isAdmin && !a.hodDepartmentIds.includes(department_id)) throw httpErr(403, 'You are not the head of this department');
      track = 'academic';
    } else if (budget_unit_id) {
      const { rows } = await pool.query(
        `SELECT track FROM budget_units WHERE id = $1 AND school_id = $2 AND is_active`, [budget_unit_id, req.schoolId]
      );
      if (!rows.length) throw httpErr(404, 'Budget unit not found');
      if (!a.isAdmin && !a.unitIds.includes(budget_unit_id)) throw httpErr(403, 'You are not the head of this unit');
      track = rows[0].track;
    } else {
      // A custom office (e.g. Exam Office) belongs to a track's reviewer.
      track = perms.TRACKS.includes(req.body.track) ? req.body.track : [...a.reviewerTracks][0];
      if (!track || !(a.isAdmin || a.reviewerTracks.has(track))) {
        throw httpErr(403, 'Only a budget reviewer or admin can create a budget for an office outside the department and unit lists');
      }
    }

    const yearId = academic_year_id || await getCurrentAcademicYear(req.schoolId);
    if (!yearId) throw httpErr(400, 'No academic year available. Choose an academic year.');

    const { rows } = await pool.query(
      `INSERT INTO department_budgets (school_id, department_id, budget_unit_id, custom_department_name, academic_year_id, track)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.schoolId, department_id || null, budget_unit_id || null, customName, yearId, track]
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
    await logBudgetEvent(req.schoolId, 'budget', budgetId, 'created', a);
    res.status(201).json(await loadBudget(req.schoolId, budgetId));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This department, unit or office already has a budget for that academic year' });
    }
    sendErr(res, next, err);
  }
});

// ── Detail ───────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const { budget, compilation, schoolBudget, permissions } = await loadBudgetContext(req, req.params.id);
    const [items, events] = await Promise.all([
      loadItems(budget.id),
      loadEvents(req.schoolId, 'budget', budget.id),
    ]);
    res.json({
      ...budget, items, events, permissions,
      compilation_status: compilation?.status ?? null,
      school_budget_status: schoolBudget?.status ?? null,
    });
  } catch (err) { sendErr(res, next, err); }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { budget } = await loadBudgetContext(req, req.params.id);
    const items = await loadItems(budget.id, { includeRemoved: false });
    const { rows: [school] } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);
    const pdfBuffer = await generateBudgetReportPDFBuffer(budget, items, school);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="budget-${budget.department_name.replace(/[^a-z0-9]+/gi, '-')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { sendErr(res, next, err); }
});

// ── Save lines ───────────────────────────────────────────────────────────
// Lines are updated by id so each keeps what the owner originally asked for
// (requested_*). Once a budget has been submitted, a removed line is marked
// removed rather than deleted, so the owner can see what a reviewer cut.

router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const a = req.budgetActor;
    const { budget, permissions } = await loadBudgetContext(req, req.params.id);
    const stage = permissions.editStage;
    if (!stage) throw httpErr(403, `This budget can't be edited by you at its current stage (${budget.status})`);

    const { items, updated_at } = req.body;
    if (!Array.isArray(items)) throw httpErr(400, 'items must be an array');
    if (updated_at && new Date(updated_at).getTime() !== new Date(budget.updated_at).getTime()) {
      throw httpErr(409, 'Someone else changed this budget while you were editing. Reload it and make your changes again.');
    }
    for (const item of items) {
      const err = validateItem(item);
      if (err) throw httpErr(400, err);
    }

    const existing = await loadItems(budget.id, { includeRemoved: true }, client);
    const byId = new Map(existing.map(i => [i.id, i]));
    const keep = new Set();
    const neverSubmitted = budget.status === 'Draft' && !budget.submitted_at;
    const changes = [];

    await client.query('BEGIN');
    let order = 0;
    for (const item of items) {
      const current = item.id ? byId.get(item.id) : null;
      if (current && !current.removed_at) {
        keep.add(current.id);
        // The Accountant adjusts quantity and price only.
        const category = stage === 'accountant' ? current.category : item.category.trim();
        const description = stage === 'accountant' ? current.description : (item.description?.trim() || null);
        const unitPrice = item.unit_price === '' ? null : (item.unit_price ?? null);
        if (Number(current.quantity) !== Number(item.quantity) || String(current.unit_price ?? '') !== String(unitPrice ?? '')) {
          changes.push(`${category}: ${Number(current.quantity)} × ${current.unit_price ?? '-'} to ${Number(item.quantity)} × ${unitPrice ?? '-'}`);
        }
        await client.query(
          `UPDATE department_budget_items
           SET category = $1, description = $2, quantity = $3, unit_price = $4, amount = $5, sort_order = $6, updated_at = now()
           WHERE id = $7`,
          [category, description, item.quantity, unitPrice, computeAmount(item.quantity, unitPrice), order++, current.id]
        );
      } else {
        if (stage === 'accountant') throw httpErr(400, 'Add new school-wide lines on the school budget instead of inside a department budget');
        const unitPrice = item.unit_price === '' ? null : (item.unit_price ?? null);
        await client.query(
          `INSERT INTO department_budget_items (budget_id, category, description, quantity, unit_price, amount, sort_order, added_stage)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [budget.id, item.category.trim(), item.description?.trim() || null, item.quantity, unitPrice,
           computeAmount(item.quantity, unitPrice), order++, stage]
        );
        if (stage !== 'owner') changes.push(`added ${item.category.trim()}`);
      }
    }
    for (const old of existing) {
      if (old.removed_at || keep.has(old.id)) continue;
      if (neverSubmitted) {
        await client.query(`DELETE FROM department_budget_items WHERE id = $1`, [old.id]);
      } else {
        await client.query(
          `UPDATE department_budget_items SET removed_at = now(), removed_stage = $1, updated_at = now() WHERE id = $2`,
          [stage, old.id]
        );
        if (stage !== 'owner') changes.push(`removed ${old.category}`);
      }
    }
    await client.query(`UPDATE department_budgets SET updated_at = now() WHERE id = $1`, [budget.id]);
    if (stage !== 'owner' && changes.length) {
      await logBudgetEvent(req.schoolId, 'budget', budget.id, `edited_by_${stage}`, a, changes.slice(0, 20).join('; '), client);
    }
    await client.query('COMMIT');
    res.json(await loadBudget(req.schoolId, budget.id));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendErr(res, next, err);
  } finally {
    client.release();
  }
});

// ── Owner: submit / withdraw ───────────────────────────────────────────────

router.post('/:id/submit', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const a = req.budgetActor;
    const { budget, permissions } = await loadBudgetContext(req, req.params.id);
    if (!permissions.canSubmit) throw httpErr(400, `A budget that is ${budget.status} can't be submitted by you`);
    if (!budget.item_count) throw httpErr(400, 'Add at least one line item before submitting');

    await client.query('BEGIN');
    // What the owner submits becomes "requested"; earlier review cuts are
    // cleared because the owner has now restated the whole request.
    await client.query(`DELETE FROM department_budget_items WHERE budget_id = $1 AND removed_at IS NOT NULL`, [budget.id]);
    await client.query(
      `UPDATE department_budget_items
       SET requested_quantity = quantity, requested_unit_price = unit_price, requested_description = description,
           added_stage = 'owner'
       WHERE budget_id = $1`,
      [budget.id]
    );
    await client.query(
      `UPDATE department_budgets
       SET status = 'Submitted', submitted_by = $1, submitted_by_staff_id = $2, submitted_at = now(),
           review_note = NULL, updated_at = now()
       WHERE id = $3`,
      [a.teacherId, a.staffId, budget.id]
    );
    await logBudgetEvent(req.schoolId, 'budget', budget.id, 'submitted', a, null, client);
    await client.query('COMMIT');

    const updated = await loadBudget(req.schoolId, budget.id);
    const { reviewers } = await perms.reviewersFor(req.schoolId, budget.track);
    notifyTeachers(req.schoolId, reviewers,
      `${budget.department_name} budget submitted`,
      `${budget.department_name} submitted its ${updated.academic_year_name} budget for your review.`);
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendErr(res, next, err);
  } finally {
    client.release();
  }
});

router.post('/:id/withdraw', async (req, res, next) => {
  try {
    const { budget, permissions } = await loadBudgetContext(req, req.params.id);
    if (!permissions.canWithdraw) throw httpErr(400, 'Only a submitted budget can be withdrawn, by its owner');
    await pool.query(`UPDATE department_budgets SET status = 'Draft', updated_at = now() WHERE id = $1`, [budget.id]);
    await logBudgetEvent(req.schoolId, 'budget', budget.id, 'withdrawn', req.budgetActor);
    res.json(await loadBudget(req.schoolId, budget.id));
  } catch (err) { sendErr(res, next, err); }
});

// ── Reviewer: accept / request changes / reject / reopen ─────────────────────

async function reviewBudget(req, res, next, { nextStatus, requireNote, action }) {
  try {
    const a = req.budgetActor;
    const { budget, permissions } = await loadBudgetContext(req, req.params.id);
    if (!permissions.canReview) {
      throw httpErr(403, perms.isReviewer(a, budget.track)
        ? `Only a submitted budget can be reviewed while the ${perms.TRACK_LABEL[budget.track]} budget is still being compiled`
        : 'Only the reviewer for this budget can review it');
    }
    const note = req.body?.note?.trim() || null;
    if (requireNote && !note) throw httpErr(400, 'A note is required');

    await pool.query(
      `UPDATE department_budgets
       SET status = $1, reviewed_by = $2, reviewed_by_staff_id = $3, reviewed_at = now(), review_note = $4, updated_at = now()
       WHERE id = $5`,
      [nextStatus, a.teacherId, a.staffId, note, budget.id]
    );
    await logBudgetEvent(req.schoolId, 'budget', budget.id, action, a, note);
    const updated = await loadBudget(req.schoolId, budget.id);

    const owner = await budgetOwnerTeacher(budget);
    const verb = { Accepted: `accepted into the ${perms.TRACK_LABEL[budget.track]} budget`, 'Changes Requested': 'sent back for changes', Rejected: 'rejected' }[nextStatus];
    notifyTeachers(req.schoolId, [owner],
      `${budget.department_name} budget ${verb.split(' ')[0]}`,
      `Your ${budget.department_name} budget for ${updated.academic_year_name} was ${verb}.${note ? ` Note: ${note}` : ''}`);
    res.json(updated);
  } catch (err) { sendErr(res, next, err); }
}

router.post('/:id/accept', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Accepted', requireNote: false, action: 'accepted' }));
// Older clients still call /approve.
router.post('/:id/approve', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Accepted', requireNote: false, action: 'accepted' }));
router.post('/:id/request-changes', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Changes Requested', requireNote: true, action: 'changes_requested' }));
router.post('/:id/reject', (req, res, next) => reviewBudget(req, res, next, { nextStatus: 'Rejected', requireNote: true, action: 'rejected' }));

router.post('/:id/reopen', async (req, res, next) => {
  try {
    const { budget, permissions } = await loadBudgetContext(req, req.params.id);
    if (!permissions.canReopen) throw httpErr(400, 'Only an accepted budget can be reopened, while its compiled budget is still being compiled');
    await pool.query(`UPDATE department_budgets SET status = 'Submitted', updated_at = now() WHERE id = $1`, [budget.id]);
    await logBudgetEvent(req.schoolId, 'budget', budget.id, 'reopened', req.budgetActor, req.body?.note?.trim() || null);
    res.json(await loadBudget(req.schoolId, budget.id));
  } catch (err) { sendErr(res, next, err); }
});

// ── Delete (never-submitted drafts only) ─────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const { budget, permissions } = await loadBudgetContext(req, req.params.id);
    if (!permissions.canDelete) throw httpErr(400, 'Only a draft that has never been submitted can be deleted');
    await pool.query(`DELETE FROM department_budgets WHERE id = $1 AND school_id = $2`, [budget.id, req.schoolId]);
    res.json({ message: 'Budget deleted' });
  } catch (err) { sendErr(res, next, err); }
});

module.exports = router;
