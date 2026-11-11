'use strict';
const pool = require('../config/db');
const { getHeadedDepartments } = require('./hod.service');

// Budget approval chain:
//   department / unit budget  → track reviewer (accepts into the compiled budget)
//   track compilation         → Head (approves or returns)
//   approved compilations     → Accountant (adjusts prices, adds school lines, finalises)
//
// Everyone's rights are worked out here from who they are, never from which
// portal they came through, so the same person gets the same answer everywhere.

const TRACKS = ['academic', 'administration'];
const REVIEWER_ROLE = { academic: 'assistant_head_academic', administration: 'assistant_head_admin' };
const TRACK_LABEL = { academic: 'Academics', administration: 'Administration' };
const OWNER_EDITABLE = ['Draft', 'Changes Requested', 'Rejected'];

async function activeRoleHolders(schoolId, role) {
  const { rows } = await pool.query(
    `SELECT id, name, email FROM teachers WHERE school_id = $1 AND management_role = $2 AND status = 'Active'`,
    [schoolId, role]
  );
  return rows;
}

// Teachers who review a track: the Assistant Head for it, or the Principal
// when the school hasn't assigned one.
async function reviewersFor(schoolId, track) {
  const assistants = await activeRoleHolders(schoolId, REVIEWER_ROLE[track]);
  if (assistants.length) return { reviewers: assistants, isFallback: false };
  return { reviewers: await activeRoleHolders(schoolId, 'principal'), isFallback: true };
}

// Staff whose role is itself a non-academic unit (the nurse runs the clinic)
// draft that unit's budget on the Administration track without an admin
// having to set the unit up first. An existing unit with a matching name and
// no head is claimed; otherwise one is created. A unit someone else already
// heads is left alone, so a second nurse doesn't take over the first's.
const STAFF_ROLE_UNITS = [
  { role: 'clinic', name: 'Clinic', match: ['clinic', 'nurse', 'sick bay', 'infirmary', 'health'] },
];

async function ensureStaffUnit(schoolId, staffId, staffRoles) {
  for (const spec of STAFF_ROLE_UNITS) {
    if (!staffRoles.includes(spec.role)) continue;
    const { rows: existing } = await pool.query(
      `SELECT id, head_teacher_id, head_school_staff_id FROM budget_units
       WHERE school_id = $1 AND is_active AND track = 'administration'
         AND LOWER(name) LIKE ANY($2::text[])
       ORDER BY (head_teacher_id IS NULL AND head_school_staff_id IS NULL) DESC, created_at
       LIMIT 1`,
      [schoolId, spec.match.map(m => `%${m}%`)]
    );
    const unit = existing[0];
    if (unit) {
      if (unit.head_teacher_id || unit.head_school_staff_id) continue;
      const { rows: claimed } = await pool.query(
        `UPDATE budget_units SET head_school_staff_id = $1
         WHERE id = $2 AND head_teacher_id IS NULL AND head_school_staff_id IS NULL RETURNING id`,
        [staffId, unit.id]
      );
      if (claimed[0]) return claimed[0].id;
      continue;
    }
    const { rows: created } = await pool.query(
      `INSERT INTO budget_units (school_id, name, track, head_school_staff_id)
       VALUES ($1, $2, 'administration', $3)
       ON CONFLICT DO NOTHING RETURNING id`,
      [schoolId, spec.name, staffId]
    );
    if (created[0]) return created[0].id;
  }
  return null;
}

async function resolveBudgetActor(req) {
  const u = req.user || {};
  const schoolId = req.schoolId;
  const actor = {
    teacherId: null, staffId: null, name: '',
    isAdmin: false, managementRole: null, isPrincipal: false,
    isAccountant: false, viewAll: false,
    hodDepartmentIds: [], unitIds: [],
    reviewerTracks: new Set(), canApproveCompilations: false,
  };

  if (u.role === 'staff') {
    actor.staffId = u.id;
    actor.isAccountant = (req.staffRoles || []).includes('accountant');
    const [{ rows: me }, { rows: units }] = await Promise.all([
      pool.query(`SELECT name FROM school_staff WHERE id = $1`, [u.id]),
      pool.query(`SELECT id FROM budget_units WHERE school_id = $1 AND head_school_staff_id = $2 AND is_active`, [schoolId, u.id]),
    ]);
    actor.name = me[0]?.name ?? '';
    actor.unitIds = units.map(r => r.id);
    if (!actor.unitIds.length) {
      const unitId = await ensureStaffUnit(schoolId, u.id, req.staffRoles || []);
      if (unitId) actor.unitIds = [unitId];
    }
    return actor;
  }

  actor.teacherId = u.id;
  actor.isAdmin = u.role === 'admin' || u.role === 'super_admin';
  if (u.type === 'management') actor.managementRole = u.role;
  actor.isPrincipal = actor.managementRole === 'principal';
  actor.viewAll = actor.isAdmin || actor.isPrincipal || actor.managementRole === 'vice_principal';
  actor.canApproveCompilations = actor.isAdmin || actor.isPrincipal;

  const [{ rows: me }, depts, { rows: units }] = await Promise.all([
    pool.query(`SELECT name FROM teachers WHERE id = $1`, [u.id]),
    getHeadedDepartments(schoolId, u.id),
    pool.query(`SELECT id FROM budget_units WHERE school_id = $1 AND head_teacher_id = $2 AND is_active`, [schoolId, u.id]),
  ]);
  actor.name = me[0]?.name ?? u.name ?? '';
  actor.hodDepartmentIds = depts.map(r => r.id);
  actor.unitIds = units.map(r => r.id);

  for (const track of TRACKS) {
    if (actor.isAdmin || actor.managementRole === REVIEWER_ROLE[track]) {
      actor.reviewerTracks.add(track);
    } else if (actor.isPrincipal) {
      const { isFallback } = await reviewersFor(schoolId, track);
      if (isFallback) actor.reviewerTracks.add(track);
    }
  }
  return actor;
}

// The person who drafts and submits this budget.
function isOwner(actor, budget) {
  if (actor.isAdmin) return true;
  if (budget.department_id) return actor.hodDepartmentIds.includes(budget.department_id);
  if (budget.budget_unit_id) return actor.unitIds.includes(budget.budget_unit_id);
  // A legacy custom-office budget has no head; the track's reviewer owns it.
  return actor.reviewerTracks.has(budget.track);
}

function isReviewer(actor, track) {
  return actor.reviewerTracks.has(track);
}

function canView(actor, budget, compilation) {
  if (actor.viewAll || isOwner(actor, budget) || isReviewer(actor, budget.track)) return true;
  return actor.isAccountant && budget.status === 'Accepted' && compilation?.status === 'Approved';
}

// Who may change this budget's lines right now, and as which stage.
// Returns 'owner' | 'reviewer' | 'accountant' | null.
function lineEditStage(actor, budget, compilation, schoolBudget) {
  if (schoolBudget?.status === 'Final') return null;
  if (OWNER_EDITABLE.includes(budget.status)) return isOwner(actor, budget) ? 'owner' : null;
  if (budget.status === 'Submitted') return isReviewer(actor, budget.track) ? 'reviewer' : null;
  if (budget.status === 'Accepted') {
    const cs = compilation?.status ?? 'Compiling';
    if (cs === 'Compiling' || cs === 'Returned') return isReviewer(actor, budget.track) ? 'reviewer' : null;
    if (cs === 'Approved') return (actor.isAccountant || actor.isAdmin) ? 'accountant' : null;
  }
  return null;
}

function compilationOpen(compilation) {
  return !compilation || compilation.status === 'Compiling' || compilation.status === 'Returned';
}

function budgetPermissions(actor, budget, compilation, schoolBudget) {
  const final = schoolBudget?.status === 'Final';
  const reviewer = isReviewer(actor, budget.track);
  return {
    editStage: lineEditStage(actor, budget, compilation, schoolBudget),
    canSubmit: !final && isOwner(actor, budget) && OWNER_EDITABLE.includes(budget.status),
    canWithdraw: !final && isOwner(actor, budget) && budget.status === 'Submitted',
    canReview: !final && reviewer && budget.status === 'Submitted' && compilationOpen(compilation),
    canReopen: !final && reviewer && budget.status === 'Accepted' && compilationOpen(compilation),
    canDelete: isOwner(actor, budget) && budget.status === 'Draft' && !budget.submitted_at,
  };
}

function actorLabel(actor) {
  return actor.name || (actor.staffId ? 'Staff' : 'Teacher');
}

module.exports = {
  TRACKS, REVIEWER_ROLE, TRACK_LABEL, OWNER_EDITABLE,
  resolveBudgetActor, reviewersFor, isOwner, isReviewer, canView,
  lineEditStage, compilationOpen, budgetPermissions, actorLabel,
};
