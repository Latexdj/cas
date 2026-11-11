'use strict';
// Mounted inside routes/department-budgets.js (after req.budgetActor is set),
// so these paths live under /api/department-budgets/...
const router = require('express').Router();
const pool   = require('../config/db');
const perms  = require('../services/budget-permissions');
const data   = require('../services/budget-data');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');
const { generateBudgetBookPDFBuffer } = require('../services/pdf.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpErr(status, message) {
  const e = new Error(message); e.status = status; e.expose = true; return e;
}
function sendErr(res, next, err) {
  if (err.expose) return res.status(err.status).json({ error: err.message });
  return next(err);
}
function computeAmount(quantity, unitPrice) {
  if (unitPrice == null || unitPrice === '') return null;
  return Math.round(Number(quantity) * Number(unitPrice) * 100) / 100;
}
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

async function notifyTeachers(schoolId, teachers, title, message) {
  await Promise.all(teachers.filter(Boolean).map(t => Promise.all([
    createNotification(schoolId, t.id, title, message),
    t.email ? sendTeacherEmail(t.email, title, message) : null,
  ]))).catch(err => console.error('[BudgetCompilations] notify failed:', err.message));
}
async function principals(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, name, email FROM teachers WHERE school_id = $1 AND management_role = 'principal' AND status = 'Active'`,
    [schoolId]
  );
  return rows;
}

async function resolveYear(req) {
  const id = req.query.year || req.body?.year;
  if (id) {
    if (!UUID_RE.test(id)) throw httpErr(400, 'Invalid academic year');
    const { rows } = await pool.query(`SELECT id, name FROM academic_years WHERE id = $1 AND school_id = $2`, [id, req.schoolId]);
    if (!rows.length) throw httpErr(404, 'Academic year not found');
    return rows[0];
  }
  const current = await data.getCurrentAcademicYear(req.schoolId);
  if (!current) throw httpErr(400, 'No current academic year is set. Choose an academic year.');
  const { rows } = await pool.query(`SELECT id, name FROM academic_years WHERE id = $1`, [current]);
  return rows[0];
}

function parseTrack(raw) {
  if (!perms.TRACKS.includes(raw)) throw httpErr(404, 'Unknown budget track');
  return raw;
}

async function ensureCompilation(schoolId, yearId, track) {
  await pool.query(
    `INSERT INTO budget_compilations (school_id, academic_year_id, track) VALUES ($1, $2, $3)
     ON CONFLICT (school_id, academic_year_id, track) DO NOTHING`,
    [schoolId, yearId, track]
  );
  return data.loadCompilation(schoolId, yearId, track);
}

function canSeeTrack(actor, track, compilation) {
  return actor.viewAll || perms.isReviewer(actor, track) || (actor.isAccountant && compilation?.status === 'Approved');
}

// ── Budget units (non-academic units and offices) ───────────────────────────

const UNIT_SELECT = `
  SELECT u.*, COALESCE(t.name, s.name) AS head_name,
         CASE WHEN u.head_teacher_id IS NOT NULL THEN 'teacher'
              WHEN u.head_school_staff_id IS NOT NULL THEN 'staff' END AS head_kind,
         (SELECT COUNT(*)::int FROM department_budgets b WHERE b.budget_unit_id = u.id) AS budget_count
  FROM budget_units u
  LEFT JOIN teachers t ON t.id = u.head_teacher_id
  LEFT JOIN school_staff s ON s.id = u.head_school_staff_id
`;

router.get('/units', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    if (a.isAdmin) {
      const { rows } = await pool.query(`${UNIT_SELECT} WHERE u.school_id = $1 ORDER BY u.track, u.name`, [req.schoolId]);
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `${UNIT_SELECT} WHERE u.school_id = $1 AND u.is_active AND u.id = ANY($2::uuid[]) ORDER BY u.name`,
      [req.schoolId, a.unitIds]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

async function validateUnitBody(req) {
  const { name, track, head_teacher_id, head_school_staff_id } = req.body;
  if (!name?.trim()) throw httpErr(400, 'Enter a name for the unit');
  if (!perms.TRACKS.includes(track)) throw httpErr(400, 'Choose whether the unit goes to Academics or Administration');
  if (head_teacher_id && head_school_staff_id) throw httpErr(400, 'A unit can have one head: a teacher or a staff account, not both');
  if (head_teacher_id) {
    const { rowCount } = await pool.query(`SELECT 1 FROM teachers WHERE id = $1 AND school_id = $2`, [head_teacher_id, req.schoolId]);
    if (!rowCount) throw httpErr(400, 'That teacher was not found');
  }
  if (head_school_staff_id) {
    const { rowCount } = await pool.query(`SELECT 1 FROM school_staff WHERE id = $1 AND school_id = $2`, [head_school_staff_id, req.schoolId]);
    if (!rowCount) throw httpErr(400, 'That staff account was not found');
  }
  return { name: name.trim(), track, headTeacher: head_teacher_id || null, headStaff: head_school_staff_id || null };
}

router.post('/units', async (req, res, next) => {
  try {
    if (!req.budgetActor.isAdmin) throw httpErr(403, 'Only an admin can set up budget units');
    const v = await validateUnitBody(req);
    const { rows } = await pool.query(
      `INSERT INTO budget_units (school_id, name, track, head_teacher_id, head_school_staff_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.schoolId, v.name, v.track, v.headTeacher, v.headStaff]
    );
    const { rows: unit } = await pool.query(`${UNIT_SELECT} WHERE u.id = $1`, [rows[0].id]);
    res.status(201).json(unit[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A unit with that name already exists' });
    sendErr(res, next, err);
  }
});

router.put('/units/:unitId', async (req, res, next) => {
  try {
    if (!req.budgetActor.isAdmin) throw httpErr(403, 'Only an admin can change budget units');
    if (!UUID_RE.test(req.params.unitId)) throw httpErr(404, 'Unit not found');
    const v = await validateUnitBody(req);
    const { rows: current } = await pool.query(
      `SELECT track, (SELECT COUNT(*)::int FROM department_budgets WHERE budget_unit_id = u.id) AS budgets
       FROM budget_units u WHERE id = $1 AND school_id = $2`,
      [req.params.unitId, req.schoolId]
    );
    if (!current.length) throw httpErr(404, 'Unit not found');
    if (current[0].budgets > 0 && current[0].track !== v.track) {
      throw httpErr(400, 'This unit already has budgets, so it can\'t move to a different track. Create a new unit instead.');
    }
    await pool.query(
      `UPDATE budget_units SET name = $1, track = $2, head_teacher_id = $3, head_school_staff_id = $4,
              is_active = COALESCE($5, is_active), updated_at = now()
       WHERE id = $6 AND school_id = $7`,
      [v.name, v.track, v.headTeacher, v.headStaff,
       typeof req.body.is_active === 'boolean' ? req.body.is_active : null, req.params.unitId, req.schoolId]
    );
    const { rows } = await pool.query(`${UNIT_SELECT} WHERE u.id = $1`, [req.params.unitId]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A unit with that name already exists' });
    sendErr(res, next, err);
  }
});

router.delete('/units/:unitId', async (req, res, next) => {
  try {
    if (!req.budgetActor.isAdmin) throw httpErr(403, 'Only an admin can remove budget units');
    if (!UUID_RE.test(req.params.unitId)) throw httpErr(404, 'Unit not found');
    await pool.query(`DELETE FROM budget_units WHERE id = $1 AND school_id = $2`, [req.params.unitId, req.schoolId]);
    res.json({ message: 'Unit removed' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'This unit has budgets on record, so it can\'t be removed. Mark it inactive instead.' });
    }
    sendErr(res, next, err);
  }
});

// ── Track compilations (Academics, Administration) ─────────────────────────

function compilationPermissions(actor, compilation, includedCount, schoolBudget) {
  const status = compilation?.status ?? 'Compiling';
  const final = schoolBudget?.status === 'Final';
  return {
    can_submit: !final && perms.isReviewer(actor, compilation?.track) && (status === 'Compiling' || status === 'Returned') && includedCount > 0,
    can_approve: !final && actor.canApproveCompilations && status === 'Submitted',
    can_return: !final && actor.canApproveCompilations && status === 'Submitted',
  };
}

router.get('/compilations', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const year = await resolveYear(req);
    const schoolBudget = await data.loadSchoolBudget(req.schoolId, year.id);
    const tracks = [];
    for (const track of perms.TRACKS) {
      const compilation = await data.loadCompilation(req.schoolId, year.id, track);
      if (!canSeeTrack(a, track, compilation) && !a.isAccountant) continue;
      const { included, pending, total } = await data.loadTrackBudgets(req.schoolId, year.id, track);
      const { reviewers, isFallback } = await perms.reviewersFor(req.schoolId, track);
      tracks.push({
        track, label: perms.TRACK_LABEL[track],
        status: compilation?.status ?? 'Compiling',
        compilation,
        included_count: included.length, pending_count: pending.length, total,
        reviewers: reviewers.map(r => r.name), reviewer_is_fallback: isFallback,
        can_open: canSeeTrack(a, track, compilation),
        permissions: compilationPermissions(a, { ...compilation, track }, included.length, schoolBudget),
      });
    }
    res.json({ year, tracks });
  } catch (err) { sendErr(res, next, err); }
});

router.get('/compilations/:track', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const track = parseTrack(req.params.track);
    const year = await resolveYear(req);
    const compilation = await data.loadCompilation(req.schoolId, year.id, track);
    if (!canSeeTrack(a, track, compilation)) throw httpErr(403, 'You do not have access to this compiled budget');
    const [{ included, pending, total }, schoolBudget, { reviewers, isFallback }] = await Promise.all([
      data.loadTrackBudgets(req.schoolId, year.id, track),
      data.loadSchoolBudget(req.schoolId, year.id),
      perms.reviewersFor(req.schoolId, track),
    ]);
    const events = compilation ? await data.loadEvents(req.schoolId, 'compilation', compilation.id) : [];
    res.json({
      year, track, label: perms.TRACK_LABEL[track],
      status: compilation?.status ?? 'Compiling',
      compilation, included, pending, total, events,
      reviewers: reviewers.map(r => r.name), reviewer_is_fallback: isFallback,
      school_budget_status: schoolBudget?.status ?? null,
      permissions: compilationPermissions(a, { ...compilation, track }, included.length, schoolBudget),
    });
  } catch (err) { sendErr(res, next, err); }
});

router.post('/compilations/:track/submit', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const track = parseTrack(req.params.track);
    const year = await resolveYear(req);
    const compilation = await ensureCompilation(req.schoolId, year.id, track);
    const [{ included }, schoolBudget] = await Promise.all([
      data.loadTrackBudgets(req.schoolId, year.id, track),
      data.loadSchoolBudget(req.schoolId, year.id),
    ]);
    const p = compilationPermissions(a, compilation, included.length, schoolBudget);
    if (!p.can_submit) {
      throw httpErr(400, included.length === 0
        ? 'Accept at least one budget before submitting the compiled budget'
        : 'Only the reviewer can submit this compiled budget, while it is being compiled or after it was returned');
    }
    const note = req.body?.note?.trim() || null;
    await pool.query(
      `UPDATE budget_compilations
       SET status = 'Submitted', compiled_by = $1, submitted_at = now(), compiler_note = $2, head_note = NULL, updated_at = now()
       WHERE id = $3`,
      [a.teacherId, note, compilation.id]
    );
    await data.logBudgetEvent(req.schoolId, 'compilation', compilation.id, 'submitted', a, note);
    const label = perms.TRACK_LABEL[track];
    notifyTeachers(req.schoolId, await principals(req.schoolId),
      `${label} budget submitted for approval`,
      `The ${label} budget for ${year.name} (${included.length} department${included.length === 1 ? '' : 's'}) is ready for your approval.`);
    res.json(await data.loadCompilation(req.schoolId, year.id, track));
  } catch (err) { sendErr(res, next, err); }
});

async function headDecision(req, res, next, { approve }) {
  try {
    const a = req.budgetActor;
    const track = parseTrack(req.params.track);
    const year = await resolveYear(req);
    const compilation = await data.loadCompilation(req.schoolId, year.id, track);
    const schoolBudget = await data.loadSchoolBudget(req.schoolId, year.id);
    const p = compilationPermissions(a, compilation, 1, schoolBudget);
    if (!(approve ? p.can_approve : p.can_return)) {
      throw httpErr(403, 'Only the Head can decide on a compiled budget, once it has been submitted');
    }
    const note = req.body?.note?.trim() || null;
    if (!approve && !note) throw httpErr(400, 'Say what needs to change before returning the budget');
    await pool.query(
      `UPDATE budget_compilations
       SET status = $1, head_reviewed_by = $2, head_reviewed_at = now(), head_note = $3, updated_at = now()
       WHERE id = $4`,
      [approve ? 'Approved' : 'Returned', a.teacherId, note, compilation.id]
    );
    await data.logBudgetEvent(req.schoolId, 'compilation', compilation.id, approve ? 'approved' : 'returned', a, note);
    const label = perms.TRACK_LABEL[track];
    const { reviewers } = await perms.reviewersFor(req.schoolId, track);
    notifyTeachers(req.schoolId, reviewers,
      `${label} budget ${approve ? 'approved' : 'returned'}`,
      approve
        ? `The Head approved the ${label} budget for ${year.name}. It now goes to the Accountant for the school budget.`
        : `The Head returned the ${label} budget for ${year.name}. Note: ${note}`);
    res.json(await data.loadCompilation(req.schoolId, year.id, track));
  } catch (err) { sendErr(res, next, err); }
}
router.post('/compilations/:track/approve', (req, res, next) => headDecision(req, res, next, { approve: true }));
router.post('/compilations/:track/return',  (req, res, next) => headDecision(req, res, next, { approve: false }));

router.get('/compilations/:track/pdf', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const track = parseTrack(req.params.track);
    const year = await resolveYear(req);
    const compilation = await data.loadCompilation(req.schoolId, year.id, track);
    if (!canSeeTrack(a, track, compilation)) throw httpErr(403, 'You do not have access to this compiled budget');
    const { included, total } = await data.loadTrackBudgets(req.schoolId, year.id, track);
    const label = perms.TRACK_LABEL[track];
    const book = {
      title: `${label.toUpperCase()} BUDGET`,
      subtitle: year.name,
      statusLine: `Status: ${compilation?.status ?? 'Compiling'}`,
      sections: [{ label: `${label} budget`, total, budgets: included.map(b => ({ name: b.department_name, total: round2(b.total_amount), items: b.items })) }],
      grandTotal: total,
      trail: [
        { label: 'Compiled and submitted by', name: compilation?.compiled_by_name, date: compilation?.submitted_at },
        ...(compilation?.status === 'Approved' ? [{ label: 'Approved by the Head', name: compilation.head_reviewed_by_name, date: compilation.head_reviewed_at }] : []),
      ],
      signatures: [`Assistant Head (${label})`, 'Headmaster'],
    };
    const { rows: [school] } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);
    const pdf = await generateBudgetBookPDFBuffer(book, school);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${label}-budget-${year.name.replace(/[^a-z0-9]+/gi, '-')}.pdf"`);
    res.send(pdf);
  } catch (err) { sendErr(res, next, err); }
});

// ── School budget (Accountant) ──────────────────────────────────────────────

async function loadSchoolItems(schoolBudgetId) {
  if (!schoolBudgetId) return [];
  const { rows } = await pool.query(
    `SELECT id, category, description, quantity, unit_price, amount, sort_order
     FROM school_budget_items WHERE school_budget_id = $1 ORDER BY sort_order, created_at`,
    [schoolBudgetId]
  );
  return rows;
}

// The live school budget: each track's accepted budgets once the Head has
// approved that track, plus the Accountant's school-wide lines.
async function buildLiveSchoolBudget(schoolId, year, schoolBudget) {
  const tracks = [];
  const blockers = [];
  for (const track of perms.TRACKS) {
    const compilation = await data.loadCompilation(schoolId, year.id, track);
    const { included, pending, total } = await data.loadTrackBudgets(schoolId, year.id, track);
    const approved = compilation?.status === 'Approved';
    const label = perms.TRACK_LABEL[track];
    if (!approved && (included.length || pending.length)) {
      blockers.push(`The ${label} budget has not been approved by the Head yet (${compilation?.status ?? 'Compiling'})`);
    }
    tracks.push({
      track, label,
      compilation_status: compilation?.status ?? 'Compiling',
      compiled_by_name: compilation?.compiled_by_name ?? null,
      submitted_at: compilation?.submitted_at ?? null,
      head_reviewed_by_name: compilation?.head_reviewed_by_name ?? null,
      head_reviewed_at: compilation?.head_reviewed_at ?? null,
      total: approved ? total : 0,
      budgets: approved ? included.map(b => ({
        id: b.id, name: b.department_name, owner_kind: b.owner_kind, total: round2(b.total_amount), items: b.items,
      })) : [],
      not_included: approved ? pending.map(b => ({ id: b.id, name: b.department_name, status: b.status })) : [],
    });
  }
  const schoolItems = await loadSchoolItems(schoolBudget?.id);
  const schoolItemsTotal = round2(schoolItems.reduce((s, i) => s + Number(i.amount || 0), 0));
  const grandTotal = round2(tracks.reduce((s, t) => s + t.total, 0) + schoolItemsTotal);
  if (!tracks.some(t => t.budgets.length) && !schoolItems.length) blockers.push('There is nothing in the school budget yet');
  return { year, tracks, school_items: schoolItems, school_items_total: schoolItemsTotal, grand_total: grandTotal, blockers };
}

function canSeeSchoolBudget(actor) {
  return actor.viewAll || actor.isAccountant || actor.reviewerTracks.size > 0;
}

function schoolBudgetPermissions(actor, schoolBudget, blockers) {
  const final = schoolBudget?.status === 'Final';
  const canEdit = !final && (actor.isAccountant || actor.isAdmin);
  return { can_edit: canEdit, can_finalise: canEdit && blockers.length === 0, can_reopen: final && actor.isAdmin };
}

router.get('/school-budget', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    if (!canSeeSchoolBudget(a)) throw httpErr(403, 'You do not have access to the school budget');
    const year = await resolveYear(req);
    const schoolBudget = await data.loadSchoolBudget(req.schoolId, year.id);
    const events = schoolBudget ? await data.loadEvents(req.schoolId, 'school', schoolBudget.id) : [];
    if (schoolBudget?.status === 'Final' && schoolBudget.snapshot) {
      return res.json({
        ...schoolBudget.snapshot, status: 'Final', blockers: [],
        finalised_by_name: schoolBudget.finalised_by_name, finalised_at: schoolBudget.finalised_at,
        notes: schoolBudget.notes, events,
        permissions: schoolBudgetPermissions(a, schoolBudget, []),
      });
    }
    const live = await buildLiveSchoolBudget(req.schoolId, year, schoolBudget);
    res.json({
      ...live, status: schoolBudget?.status ?? 'Compiling', notes: schoolBudget?.notes ?? null, events,
      permissions: schoolBudgetPermissions(a, schoolBudget, live.blockers),
    });
  } catch (err) { sendErr(res, next, err); }
});

async function editableSchoolBudget(req) {
  const a = req.budgetActor;
  if (!(a.isAccountant || a.isAdmin)) throw httpErr(403, 'Only the Accountant can edit the school budget');
  const year = await resolveYear(req);
  await pool.query(
    `INSERT INTO school_budgets (school_id, academic_year_id) VALUES ($1, $2)
     ON CONFLICT (school_id, academic_year_id) DO NOTHING`,
    [req.schoolId, year.id]
  );
  const sb = await data.loadSchoolBudget(req.schoolId, year.id);
  if (sb.status === 'Final') throw httpErr(400, 'The school budget is final and locked');
  return { sb, year };
}

function validateSchoolItem(body) {
  if (!body.category?.trim()) throw httpErr(400, 'Every line needs an item name');
  if (!(Number(body.quantity) > 0)) throw httpErr(400, 'Quantity must be greater than 0');
  if (body.unit_price != null && body.unit_price !== '' && Number(body.unit_price) < 0) throw httpErr(400, 'Unit price cannot be negative');
}

router.post('/school-budget/items', async (req, res, next) => {
  try {
    const { sb } = await editableSchoolBudget(req);
    validateSchoolItem(req.body);
    const price = req.body.unit_price === '' ? null : (req.body.unit_price ?? null);
    const { rows } = await pool.query(
      `INSERT INTO school_budget_items (school_budget_id, category, description, quantity, unit_price, amount, sort_order, created_by, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6,
               (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM school_budget_items WHERE school_budget_id = $1), $7, $8)
       RETURNING *`,
      [sb.id, req.body.category.trim(), req.body.description?.trim() || null, req.body.quantity, price,
       computeAmount(req.body.quantity, price), req.budgetActor.teacherId, req.budgetActor.staffId]
    );
    await data.logBudgetEvent(req.schoolId, 'school', sb.id, 'line_added', req.budgetActor, rows[0].category);
    res.status(201).json(rows[0]);
  } catch (err) { sendErr(res, next, err); }
});

router.put('/school-budget/items/:itemId', async (req, res, next) => {
  try {
    const { sb } = await editableSchoolBudget(req);
    if (!UUID_RE.test(req.params.itemId)) throw httpErr(404, 'Line not found');
    validateSchoolItem(req.body);
    const price = req.body.unit_price === '' ? null : (req.body.unit_price ?? null);
    const { rows } = await pool.query(
      `UPDATE school_budget_items SET category = $1, description = $2, quantity = $3, unit_price = $4, amount = $5
       WHERE id = $6 AND school_budget_id = $7 RETURNING *`,
      [req.body.category.trim(), req.body.description?.trim() || null, req.body.quantity, price,
       computeAmount(req.body.quantity, price), req.params.itemId, sb.id]
    );
    if (!rows.length) throw httpErr(404, 'Line not found');
    res.json(rows[0]);
  } catch (err) { sendErr(res, next, err); }
});

router.delete('/school-budget/items/:itemId', async (req, res, next) => {
  try {
    const { sb } = await editableSchoolBudget(req);
    if (!UUID_RE.test(req.params.itemId)) throw httpErr(404, 'Line not found');
    const { rows } = await pool.query(
      `DELETE FROM school_budget_items WHERE id = $1 AND school_budget_id = $2 RETURNING category`,
      [req.params.itemId, sb.id]
    );
    if (!rows.length) throw httpErr(404, 'Line not found');
    await data.logBudgetEvent(req.schoolId, 'school', sb.id, 'line_removed', req.budgetActor, rows[0].category);
    res.json({ message: 'Line removed' });
  } catch (err) { sendErr(res, next, err); }
});

router.post('/school-budget/finalise', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const { sb, year } = await editableSchoolBudget(req);
    const live = await buildLiveSchoolBudget(req.schoolId, year, sb);
    if (live.blockers.length) throw httpErr(400, live.blockers.join('. '));
    const notes = req.body?.notes?.trim() || null;
    const snapshot = { ...live, blockers: undefined, finalised_by_name: a.name, finalised_at: new Date().toISOString() };
    await pool.query(
      `UPDATE school_budgets
       SET status = 'Final', snapshot = $1, notes = $2, finalised_by = $3, finalised_by_staff_id = $4,
           finalised_at = now(), updated_at = now()
       WHERE id = $5`,
      [JSON.stringify(snapshot), notes, a.teacherId, a.staffId, sb.id]
    );
    await data.logBudgetEvent(req.schoolId, 'school', sb.id, 'finalised', a, notes);
    notifyTeachers(req.schoolId, await principals(req.schoolId),
      `School budget for ${year.name} is final`,
      `${a.name || 'The Accountant'} finalised the school budget for ${year.name}: GH₵ ${live.grand_total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}.`);
    res.json({ message: 'School budget finalised', grand_total: live.grand_total });
  } catch (err) { sendErr(res, next, err); }
});

router.post('/school-budget/reopen', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    if (!a.isAdmin) throw httpErr(403, 'Only an admin can reopen a final school budget');
    const year = await resolveYear(req);
    const sb = await data.loadSchoolBudget(req.schoolId, year.id);
    if (sb?.status !== 'Final') throw httpErr(400, 'The school budget is not final');
    await pool.query(
      `UPDATE school_budgets SET status = 'Compiling', snapshot = NULL, finalised_at = NULL, updated_at = now() WHERE id = $1`,
      [sb.id]
    );
    await data.logBudgetEvent(req.schoolId, 'school', sb.id, 'reopened', a, req.body?.note?.trim() || null);
    res.json({ message: 'School budget reopened' });
  } catch (err) { sendErr(res, next, err); }
});

router.get('/school-budget/pdf', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    if (!canSeeSchoolBudget(a)) throw httpErr(403, 'You do not have access to the school budget');
    const year = await resolveYear(req);
    const sb = await data.loadSchoolBudget(req.schoolId, year.id);
    const isFinal = sb?.status === 'Final' && sb.snapshot;
    const b = isFinal ? sb.snapshot : await buildLiveSchoolBudget(req.schoolId, year, sb);
    const book = {
      title: 'SCHOOL BUDGET',
      subtitle: year.name,
      statusLine: isFinal ? 'Final' : 'Draft, not yet final',
      sections: b.tracks.map(t => ({ label: `${t.label} budget`, total: t.total, budgets: t.budgets })),
      schoolItems: b.school_items, schoolItemsTotal: b.school_items_total,
      grandTotal: b.grand_total,
      trail: [
        ...b.tracks.flatMap(t => [
          { label: `${t.label}: compiled by`, name: t.compiled_by_name, date: t.submitted_at },
          { label: `${t.label}: approved by the Head`, name: t.head_reviewed_by_name, date: t.compilation_status === 'Approved' ? t.head_reviewed_at : null },
        ]),
        ...(isFinal ? [{ label: 'Finalised by the Accountant', name: sb.finalised_by_name, date: sb.finalised_at }] : []),
      ],
      signatures: ['Accountant', 'Headmaster'],
    };
    const { rows: [school] } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);
    const pdf = await generateBudgetBookPDFBuffer(book, school);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="school-budget-${year.name.replace(/[^a-z0-9]+/gi, '-')}.pdf"`);
    res.send(pdf);
  } catch (err) { sendErr(res, next, err); }
});

// ── What's waiting on me ────────────────────────────────────────────────────

router.get('/my-tasks', async (req, res, next) => {
  try {
    const a = req.budgetActor;
    const yearId = await data.getCurrentAcademicYear(req.schoolId);
    if (!yearId) return res.json([]);
    const tasks = [];

    const owned = [];
    if (a.hodDepartmentIds.length) owned.push(`b.department_id = ANY('{${a.hodDepartmentIds.join(',')}}'::uuid[])`);
    if (a.unitIds.length) owned.push(`b.budget_unit_id = ANY('{${a.unitIds.join(',')}}'::uuid[])`);
    if (owned.length) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE b.status IN ('Changes Requested','Rejected'))::int AS sent_back
         FROM department_budgets b WHERE b.school_id = $1 AND b.academic_year_id = $2 AND (${owned.join(' OR ')})`,
        [req.schoolId, yearId]
      );
      if (rows[0].sent_back) tasks.push({ key: 'sent_back', label: 'Budgets sent back to you', count: rows[0].sent_back, target: { view: 'budgets' } });
    }

    for (const track of a.reviewerTracks) {
      const label = perms.TRACK_LABEL[track];
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM department_budgets
         WHERE school_id = $1 AND academic_year_id = $2 AND track = $3 AND status = 'Submitted'`,
        [req.schoolId, yearId, track]
      );
      if (rows[0].n) tasks.push({ key: `review_${track}`, label: `${label} budgets to review`, count: rows[0].n, target: { view: 'budgets', track } });
      const comp = await data.loadCompilation(req.schoolId, yearId, track);
      if (comp?.status === 'Returned') tasks.push({ key: `returned_${track}`, label: `${label} budget returned by the Head`, count: 1, target: { view: 'compilation', track } });
    }

    if (a.canApproveCompilations) {
      const { rows } = await pool.query(
        `SELECT track FROM budget_compilations WHERE school_id = $1 AND academic_year_id = $2 AND status = 'Submitted'`,
        [req.schoolId, yearId]
      );
      for (const r of rows) {
        tasks.push({ key: `approve_${r.track}`, label: `${perms.TRACK_LABEL[r.track]} budget awaiting your approval`, count: 1, target: { view: 'compilation', track: r.track } });
      }
    }

    if (a.isAccountant) {
      const [{ rows }, sb] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS n FROM budget_compilations WHERE school_id = $1 AND academic_year_id = $2 AND status = 'Approved'`,
          [req.schoolId, yearId]
        ),
        data.loadSchoolBudget(req.schoolId, yearId),
      ]);
      if (rows[0].n && sb?.status !== 'Final') {
        tasks.push({ key: 'school_budget', label: `Approved budgets ready for the school budget`, count: rows[0].n, target: { view: 'school' } });
      }
    }
    res.json(tasks);
  } catch (err) { next(err); }
});

module.exports = router;
