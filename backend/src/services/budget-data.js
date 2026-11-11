'use strict';
const pool = require('../config/db');

async function getCurrentAcademicYear(schoolId) {
  const { rows } = await pool.query(
    `SELECT id FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return rows[0]?.id ?? null;
}

// Totals and counts leave out lines removed at review, so every screen and
// export agrees on what is actually in the budget.
const BUDGET_SELECT = `
  SELECT b.*,
         COALESCE(d.name, u.name, b.custom_department_name) AS department_name,
         (b.department_id IS NULL AND b.budget_unit_id IS NULL) AS is_custom_department,
         CASE WHEN b.department_id IS NOT NULL THEN 'department'
              WHEN b.budget_unit_id IS NOT NULL THEN 'unit' ELSE 'custom' END AS owner_kind,
         ay.name AS academic_year_name,
         COALESCE(sb.name, sbs.name) AS submitted_by_name,
         COALESCE(rb.name, rbs.name) AS reviewed_by_name,
         (SELECT COALESCE(SUM(amount), 0) FROM department_budget_items WHERE budget_id = b.id AND removed_at IS NULL) AS total_amount,
         (SELECT COALESCE(SUM(ROUND(requested_quantity * requested_unit_price, 2)), 0) FROM department_budget_items
            WHERE budget_id = b.id AND added_stage = 'owner' AND requested_quantity IS NOT NULL) AS requested_total,
         (SELECT COUNT(*)::int FROM department_budget_items WHERE budget_id = b.id AND removed_at IS NULL) AS item_count
  FROM department_budgets b
  LEFT JOIN departments d ON d.id = b.department_id
  LEFT JOIN budget_units u ON u.id = b.budget_unit_id
  JOIN academic_years ay ON ay.id = b.academic_year_id
  LEFT JOIN teachers sb ON sb.id = b.submitted_by
  LEFT JOIN school_staff sbs ON sbs.id = b.submitted_by_staff_id
  LEFT JOIN teachers rb ON rb.id = b.reviewed_by
  LEFT JOIN school_staff rbs ON rbs.id = b.reviewed_by_staff_id
`;

async function loadBudget(schoolId, id, db = pool) {
  const { rows } = await db.query(`${BUDGET_SELECT} WHERE b.id = $1 AND b.school_id = $2`, [id, schoolId]);
  return rows[0] ?? null;
}

async function loadItems(budgetId, { includeRemoved = true } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT id, category, description, quantity, unit_price, amount, sort_order,
            requested_quantity, requested_unit_price, requested_description,
            added_stage, removed_at, removed_stage, updated_at
     FROM department_budget_items
     WHERE budget_id = $1 ${includeRemoved ? '' : 'AND removed_at IS NULL'}
     ORDER BY (removed_at IS NOT NULL), sort_order, created_at`,
    [budgetId]
  );
  return rows;
}

const COMPILATION_SELECT = `
  SELECT c.*, ay.name AS academic_year_name,
         cb.name AS compiled_by_name, hb.name AS head_reviewed_by_name
  FROM budget_compilations c
  JOIN academic_years ay ON ay.id = c.academic_year_id
  LEFT JOIN teachers cb ON cb.id = c.compiled_by
  LEFT JOIN teachers hb ON hb.id = c.head_reviewed_by
`;

async function loadCompilation(schoolId, yearId, track, db = pool) {
  const { rows } = await db.query(
    `${COMPILATION_SELECT} WHERE c.school_id = $1 AND c.academic_year_id = $2 AND c.track = $3`,
    [schoolId, yearId, track]
  );
  return rows[0] ?? null;
}

async function loadSchoolBudget(schoolId, yearId, db = pool) {
  const { rows } = await db.query(
    `SELECT s.*, ay.name AS academic_year_name,
            COALESCE(ft.name, fs.name) AS finalised_by_name
     FROM school_budgets s
     JOIN academic_years ay ON ay.id = s.academic_year_id
     LEFT JOIN teachers ft ON ft.id = s.finalised_by
     LEFT JOIN school_staff fs ON fs.id = s.finalised_by_staff_id
     WHERE s.school_id = $1 AND s.academic_year_id = $2`,
    [schoolId, yearId]
  );
  return rows[0] ?? null;
}

async function logBudgetEvent(schoolId, entityType, entityId, action, actor, note = null, db = pool) {
  await db.query(
    `INSERT INTO budget_events (school_id, entity_type, entity_id, action, note, actor_teacher_id, actor_staff_id, actor_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [schoolId, entityType, entityId, action, note, actor.teacherId, actor.staffId, actor.name || null]
  );
}

async function loadEvents(schoolId, entityType, entityId) {
  const { rows } = await pool.query(
    `SELECT id, action, note, actor_label, created_at FROM budget_events
     WHERE school_id = $1 AND entity_type = $2 AND entity_id = $3 ORDER BY created_at`,
    [schoolId, entityType, entityId]
  );
  return rows;
}

// Every budget in a track for a year, split into the ones accepted into the
// compiled budget and the ones that aren't (still drafting, under review, sent
// back). Accepted budgets come with their live lines.
async function loadTrackBudgets(schoolId, yearId, track) {
  const { rows } = await pool.query(
    `${BUDGET_SELECT} WHERE b.school_id = $1 AND b.academic_year_id = $2 AND b.track = $3
     ORDER BY COALESCE(d.name, u.name, b.custom_department_name)`,
    [schoolId, yearId, track]
  );
  const included = [];
  const pending = [];
  for (const b of rows) {
    if (b.status === 'Accepted') included.push({ ...b, items: await loadItems(b.id, { includeRemoved: false }) });
    else pending.push(b);
  }
  const total = included.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  return { included, pending, total: Math.round(total * 100) / 100 };
}

module.exports = {
  getCurrentAcademicYear, BUDGET_SELECT, loadBudget, loadItems,
  loadCompilation, loadSchoolBudget, logBudgetEvent, loadEvents, loadTrackBudgets,
};
