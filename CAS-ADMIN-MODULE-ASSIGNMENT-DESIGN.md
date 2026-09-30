# CAS Per-Admin Module Assignment — Design Document

**Status:** Research + design only. Nothing in this document has been implemented. For review with the project supervisor before any build work begins.

**Scope:** let a school's admin(s) restrict, per other admin, which of the school's already-licensed modules that specific admin can see and use — a new per-person scoping layer sitting underneath the existing per-school module-licensing layer described in `CAS-MODULE-LICENSING-AND-BILLING-DESIGN.md`.

---

## 0. Correction to the brief's pre-supplied facts

The brief that kicked off this research assumed `CAS-MODULE-LICENSING-AND-BILLING-DESIGN.md` was still largely aspirational ("Status: design only") and asked this document to state which parts it can rely on. **Re-verification against the live code shows the prior doc's entire Part 3 proposal has since shipped**, not just Phase 2 as the brief guessed:

| Prior doc's proposed piece | Status found in code |
|---|---|
| Phase 0 — register `admissions`/`lms`/`discipline` keys | **Done.** `backend/src/services/modules.service.js:3-9` — `ALL_MODULE_KEYS` has all 18 keys including these three. |
| Phase 1 — `checkModuleAccess` middleware, applied per-router | **Done, and extended.** `backend/src/middleware/moduleAccess.js` exists. It's not the exact draft from the prior doc — the shipped version adds a `licensable` flag to the registry (`modules.service.js:11-20`, 8 "foundation" keys are hard-coded as never-gateable) and an **admin-GET bypass**: `checkModuleAccess` lets any `role: 'admin'` request through on GET even if the module is disabled, only blocking writes and blocking non-admin roles entirely — an "archive/read-only" policy, which resolves prior-doc open question 1 (Part 3.7) in favor of the "archive/soft-lock" option, at least for admins. It's applied across 19+ route files (`inventory.js`, `library.js`, `lms.js`, `houses.js`, `discipline.js`, `fees.js`, `clearanceAdmin.js`/`clearanceStaff.js`, `assessments.js`, `exeat.js`, `admin-admissions.js`, `general-letters.js`, `letter-chat.js`, `memos.js`, `principal.js`, `principal-discipline.js`, `principal-general-letters.js`, `student.js`, `form-teacher.js`). |
| Phase 2 — super-admin per-school module toggle UI | **Done.** `admin-portal/app/super-admin/(shell)/schools/[id]/page.tsx` (a "Modules" section within the existing school-detail page, not a separate route — lines ~133-143, ~316, ~333) calls `GET /api/schools/:id/modules` and `PATCH /api/schools/:id/modules`, both live in `backend/src/routes/schools.js:479-558`. |
| Phase 3 — shared nav-filtering hook across all shells | **Done.** `admin-portal/hooks/useEnabledModules.ts` is consumed by `Sidebar.tsx` (admin), `PrincipalShell.tsx`, and `TeacherShell.tsx`. It fetches `GET /api/school-modules/enabled` (`backend/src/routes/schoolModules.js` — a dedicated router added after the prior doc was written, deliberately gated by `authenticate + requireActiveSubscription` only, *not* `adminOnly`, specifically so principal/teacher tokens can read it too; see the file's own header comment). Fail-open-on-error and 5-minute TTL caching both match what the prior doc proposed. |
| Phase 4 — student-count billing cap | **Also done**, incidentally: `subscriptions.student_limit` exists and is populated (`backend/src/routes/schools.js:22,49,117,212-245`; `backend/src/routes/admin.js:213-215`). Not otherwise relevant to this design. |
| Open question 5 (registry granularity vs. objective's 10 product names) | **Resolved as fine-grained.** The shipped registry kept 18 individual keys (not grouped into coarser product tiers) and added a `licensable: boolean` field per key instead — 8 keys (`teacher_attendance`, `student_attendance`, `timetable`, `leave_management`, `meeting_attendance`, `plc`, `remedial_lessons`, `classroom_qr`) are marked `licensable: false` and can never be toggled off for any school; the other 10 (`assessments`, `houses`, `exeat`, `clearance`, `library`, `fees`, `inventory`, `admissions`, `lms`, `discipline`) are `licensable: true`. |

**Practical consequence for this document:** per-admin module assignment can be built entirely on top of shipped, working infrastructure. It does not need to wait on or duplicate any part of the prior doc — `getEnabledModules(schoolId)` and the `licensable` list are exactly the per-school ceiling this feature needs to sit underneath (see §2).

---

## 1. Current state, grounded in actual code

### 1.1 The admin model — confirmed as the brief described, with one correction

- Admins live in `teachers` (`db/schema.sql:62-76`), gated by a single `is_admin BOOLEAN NOT NULL DEFAULT false` column (`schema.sql:71`, comment: `-- school-level admin`). No tiers, no primary/secondary/owner distinction anywhere in the schema — confirmed, nothing else was found.
- `PUT /api/teachers/:id` (`backend/src/routes/teachers.js:850-926`) is gated only by `adminOnly` (line 850) and accepts `is_admin` in its body (line 853, applied via `COALESCE($7, is_admin)` at line 882). **Confirmed exactly as stated**: any admin can promote or demote any other teacher at their school today, with no check that distinguishes admins from each other.
- `backend/src/routes/schools.js:348` — `SELECT id FROM teachers WHERE school_id = $1 AND is_admin = true ORDER BY created_at ASC LIMIT 1` inside `POST /:id/reset-admin-pin` (confirmed, the route starts at line 337). **Confirmed**: this is the only place in the codebase that treats "earliest-created admin" as special, and it's a narrow super-admin support action (resetting a forgotten PIN), not an enforced role. Nothing else queries admins by `created_at` order or treats one as primary.
- **Correction to the brief's framing of `management-users.js`:** the brief called this "figure out during research whether it's orthogonal" and guessed yes. **It is not orthogonal — it directly writes `is_admin`.** `backend/src/routes/management-users.js:42-47` (`POST /`, assigning a `principal`/`vice_principal` role): `UPDATE teachers SET management_role = $1, is_admin = true, ...`. `management-users.js:73-77` (`DELETE /:id`, revoking): `UPDATE teachers SET management_role = NULL, is_admin = false, ...`. So a principal/VP is, in the `teachers` table, *also* a school admin the moment they're assigned the role, and loses `is_admin` the moment it's revoked. They authenticate to the separate management portal via `/api/principal/auth/login` with `type: 'management'` in the JWT (gated by `managementOnly`, `backend/src/middleware/auth.js:105-110` — checks `req.user?.type !== 'management'`, a completely different claim from `role`), but the *same underlying teacher row* also satisfies `is_admin = true` and so is eligible to log into the admin portal as `role: 'admin'` (`adminOnly`, `auth.js:87-93`, checks `req.user?.role`). **Implication for this design:** a person can be both a management-portal principal and an admin-portal admin simultaneously off one `teachers` row; per-admin module assignment, keyed on `teacher_id` (see §2), automatically covers them too whenever they use the admin portal — no separate integration with `management-users.js` is needed, but the design must not assume "admin" and "management role" are disjoint populations.

### 1.2 Module licensing state, as it exists right now (see §0 for the fuller correction)

- Per-school enabled modules: `school_modules(school_id, module_key, enabled)` (3 columns, `CAS-MODULE-LICENSING-AND-BILLING-DESIGN.md` §1.3), read via `getEnabledModules(schoolId)` (`backend/src/services/modules.service.js:53-61`) — returns `ALL_MODULE_KEYS` (all 18) if the school predates the module system, else the enabled subset.
- Enforcement: `checkModuleAccess(moduleKey)` (`backend/src/middleware/moduleAccess.js:30-51`) — super-admin bypass, 5-minute in-process cache (`moduleCache`, keyed by `schoolId`), admin-GET-always-allowed (read-only even when disabled), 403 `module_not_enabled` otherwise.
- `licensable: false` keys (8 of them, listed in §0) can never be disabled for a school at all, which means they can never be restricted per-admin either without contradicting the school-level guarantee — see §2.3.

### 1.3 Nav filtering

- `useEnabledModules(apiClient, schoolId)` (`admin-portal/hooks/useEnabledModules.ts`) — fetches `GET /api/school-modules/enabled` once per school per session, memory + `sessionStorage` cache, 5-minute TTL, `null` = fail-open (show everything).
- Consumed identically by `Sidebar.tsx` (admin, lines ~438, ~474-476: `if (!item.module) return true; if (enabledModules === null) return true; return enabledModules.includes(item.module);`), `PrincipalShell.tsx`, `TeacherShell.tsx`.
- This filter is **school-wide only** — it has no concept of "this particular logged-in admin." Every admin at a school currently sees an identical nav.

### 1.4 Existing precedent for per-person, module-scoped capability assignment — reuse this pattern

The brief asked to check `teacher_responsibilities` / `school_staff_roles` for a reusable pattern rather than inventing a new one. **There is a directly-applicable precedent, already built and in production use:**

`backend/src/index.js:912-932`:
```sql
CREATE TABLE IF NOT EXISTS teacher_responsibilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  module_key  VARCHAR(50),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS teacher_responsibility_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id        UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  responsibility_id UUID NOT NULL REFERENCES teacher_responsibilities(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, responsibility_id)
);
```
Used today in `backend/src/routes/schoolStaff.js:162-242` for the "Library Teacher Assignments" feature: `ensureLibraryResponsibility()` (lines 165-174) lazily creates a `teacher_responsibilities` row tagged `module_key = 'library'`, and admins assign/unassign individual teachers to it via `POST/DELETE /api/school-staff/library-teachers`, which insert/delete rows in `teacher_responsibility_assignments`. This is exactly the shape needed here: a **join table keyed on `(teacher_id, module_key)`**, admin-managed, additive. §2 proposes reusing this exact join-table shape (a new table, not literally this one — see §2.1 for why) rather than inventing a different mechanism.

A second, weaker precedent is `school_staff_roles` (`backend/src/index.js:901-909`, `role IN ('clearance','library')`), but that scopes a separate `school_staff` login type (non-teacher staff accounts, e.g. a librarian with no `teachers` row at all), not admins — not reusable as-is, but confirms the same "person × capability-key join table" idiom is the house pattern generally.

---

## 2. Proposed schema (additive)

### 2.1 New table, not a reuse of `teacher_responsibility_assignments`

Reuse the *pattern* from §1.4, not the literal table, for three reasons: (a) `teacher_responsibilities.module_key` is nullable free-text with no FK/CHECK tying it to `MODULE_REGISTRY`, so it can't guarantee only real, licensable module keys are ever assigned; (b) conflating "library staff assignment" (a *functional* responsibility, shown in a teacher's profile) with "admin module visibility" (a *permissions* gate, enforced by middleware) in one table risks a future change to one meaning silently breaking the other; (c) the existing table has no `granted_by` / audit columns, which this feature needs (§3 makes "who can assign" a governance question — the audit trail is how a disputed grant gets resolved).

```sql
CREATE TABLE admin_module_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id   UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  module_key   VARCHAR(50) NOT NULL,
  granted_by   UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, module_key)
);
CREATE INDEX idx_admin_module_assignments_school ON admin_module_assignments (school_id);
```

No CHECK constraint tying `module_key` to `MODULE_REGISTRY` in SQL (the registry lives in application code, `modules.service.js`, not the DB — consistent with how `school_modules.module_key` itself has no CHECK either); the application layer validates against `MODULE_REGISTRY` before insert, same as `schools.js:536-558`'s `PATCH /:id/modules` already does implicitly by only ever writing keys it iterates from the registry.

This is purely additive — a brand-new table, zero changes to `teachers`, `school_modules`, or any existing route's query shape.

### 2.2 Default-access decision — nobody loses access the day this ships

**Proposal: absence of a row means "unrestricted" (sees everything the school has licensed), not "sees nothing."** Concretely:

- **Existing admins, at migration time:** write no backfill rows at all. The enforcement logic (§4) must treat "this admin has zero rows in `admin_module_assignments` for this school" as "no per-admin restriction is in effect — fall through to the school's full licensed set," exactly mirroring how `getEnabledModules()` already treats a school with zero `school_modules` rows as "all enabled" (`modules.service.js:58-59`, `if (rows.length === 0) return ALL_MODULE_KEYS`). This is the same non-disruptive posture as the prior design doc's backfill philosophy (§3.2 of that doc: "defaulting existing schools to enabled... revoking on migration day would be a surprise regression") — applied here at the admin level instead of the school level. No admin sees a shrunk nav the moment this feature ships; restriction is strictly opt-in, per admin, going forward.
- **Newly promoted admins (an existing teacher gets `is_admin` flipped to `true`, whether via `PUT /api/teachers/:id` or via `management-users.js`'s `POST /` which sets it as a side effect):** same rule — zero rows means unrestricted. A school that wants to start a newly promoted admin with a *narrower* set than full must explicitly assign that narrower set after promotion; the system does not guess intent at promotion time. This keeps the promotion flow (`teachers.js`, `management-users.js`) completely unchanged — neither needs to know about `admin_module_assignments` at all, which avoids coupling two otherwise-separate features together (see the correction in §1.1 about why they're not fully orthogonal in the `is_admin` sense, but they remain orthogonal in the schema-write sense: promoting someone never needs to touch this new table).
- **Practical effect:** "restricting an admin" is an *explicit, positive act* — the assigning admin opens the new UI (§5) and removes modules from someone's set for the first time, at which point rows start existing for that teacher and the "restricted" branch of enforcement activates for them specifically. Until that first edit, every admin behaves exactly as today.

---

## 3. Who is allowed to assign modules to whom — the central open question

The feature as described in the brief assumes a "the school admin" who does the assigning, distinct from admins being assigned to — but §1.1 confirmed the codebase has **no primary-admin/owner concept at all**, and the one place that treats "earliest admin" as special (`schools.js:348`) is a narrow super-admin PIN-reset convenience, not a role. Three real options, laid out plainly:

**(a) Formalize a primary-admin/owner concept now.**
Add e.g. `teachers.is_primary_admin BOOLEAN DEFAULT false`, set it on the first admin a school ever gets (at school-creation time, mirroring how `schools.js`'s create-school handler already seeds the first admin), and require `is_primary_admin = true` to open the assignment UI at all or to edit any other admin's row in `admin_module_assignments`. Cost: a new schema column, a migration to backfill exactly one `true` per existing school (using the same `created_at ASC LIMIT 1` heuristic `schools.js:348` already relies on informally — but formalizing an *informal support convenience* into an *enforced permission boundary* is itself a decision with teeth: it retroactively crowns whichever admin happens to have the oldest row, which may not match who the school actually considers "in charge" today, especially at a school where the original admin left and handed off informally). Also needs new UI/API for transferring primary-admin status (what happens if that person leaves the school?), which this document does not scope.

**(b) Any admin can assign any other admin's modules — including editing their own.**
Mirrors the status quo exactly: `is_admin` itself is already toggle-by-any-admin today (`teachers.js:850`, confirmed in §1.1), so this option adds no *new* governance looseness, only extends an existing, accepted looseness to a new dimension. Simplest to build — the assignment endpoint (§4) just needs `adminOnly`, nothing more. Risk: two admins could ping-pong each other's access, or one admin could lock every other admin out of every module (including possibly themselves, if self-editing is allowed), with no structural backstop — a governance risk, not a technical one, but a real one since (unlike `is_admin` toggling, which is at least visible as a change to a person's role) this is a finer-grained lever with less visibility.

**(c) A middle ground — any admin can assign, with narrow structural guardrails.**
Two guardrails worth considering independently (they can be adopted together, separately, or not at all):
  - *An admin cannot edit their own assignment row.* Prevents accidental or malicious self-lockout and self-escalation-avoidance debates; requires a second admin to change anyone's access, including the editor's own, which is a mild but meaningful check.
  - *An admin cannot grant another admin a module they do not themselves currently have.* Prevents privilege laundering through a third party, but only means anything once some admin somewhere has been restricted — for a school with zero restricted admins (the default state per §2.2, "unrestricted" = "has everything"), this guardrail is inert, since an unrestricted admin already effectively "has" every school-licensed module and so can grant any of them.

**Recommendation: (c), both guardrails, as a lightweight default — but flagged for supervisor sign-off, not silently decided.** Reasoning: (a) solves a real governance gap but is a bigger, separate schema/product decision (an "owner" concept has implications well beyond this feature — billing contact, who super-admin support treats as authoritative, succession when someone leaves) that shouldn't be smuggled in as a side effect of a module-assignment feature; (b) alone is simplest but adds a real new risk (mutual lockout) that (c)'s guardrails remove almost for free, with no new schema. (c) does not foreclose (a) — if the supervisor wants a primary-admin concept later, it layers on top of (c) cleanly (the primary admin would simply also be exempt from the "cannot edit own" guardrail).

---

## 4. Enforcement

### 4.1 Backend middleware

Extend `checkModuleAccess`, don't replace it — it already runs on every module-gated route (§0, §1.2) and already has exactly the shape needed (schoolId-scoped cache, admin-GET bypass, 403 shape). Add a second, narrower check layered *after* it wherever an admin-specific restriction should apply:

```js
// backend/src/middleware/moduleAccess.js — proposed addition, not yet built
const adminModuleCache = new Map(); // teacherId -> { keys: Set<string> | null, cachedAt }
// null keys = unrestricted (no rows in admin_module_assignments for this teacher) = "sees everything the school has"

async function getCachedAdminKeys(teacherId) {
  const cached = adminModuleCache.get(teacherId);
  if (cached && (Date.now() - cached.cachedAt) < MODULE_CACHE_TTL_MS) return cached.keys;
  const { rows } = await pool.query(
    `SELECT module_key FROM admin_module_assignments WHERE teacher_id = $1`, [teacherId]
  );
  const keys = rows.length === 0 ? null : new Set(rows.map(r => r.module_key));
  adminModuleCache.set(teacherId, { keys, cachedAt: Date.now() });
  return keys;
}

function checkAdminModuleAssignment(moduleKey) {
  return async function (req, res, next) {
    if (req.user?.role !== 'admin') return next(); // only narrows the admin role; super_admin, teacher, student, management unaffected
    const keys = await getCachedAdminKeys(req.user.id);
    if (keys === null) return next(); // unrestricted — see §2.2
    if (keys.has(moduleKey)) return next();
    return res.status(403).json({
      error: 'module_not_assigned',
      message: `You have not been granted access to the ${moduleKey} module. Ask another admin at your school to assign it.`,
    });
  };
}
```

Applied as a *third* link in the exact same chain style the prior doc already established (`router.use(authenticate, requireActiveSubscription, checkModuleAccess('inventory'), checkAdminModuleAssignment('inventory'))`), on the `licensable: true` module routers only (§2.3 explains why the 8 `licensable: false` routers are explicitly excluded). This depends on no unshipped work — `checkModuleAccess` and the whole chain convention are live today (§0), so this is a pure extension, not a design that waits on anything.

Cache invalidation: same in-process-`Map`-delete pattern already used by `clearModuleCache` (`moduleAccess.js:8-11`) and by `schools.js`'s `PATCH /:id/modules` handler — the new assignment-management endpoint (§5) calls `adminModuleCache.delete(teacherId)` after every write, same convention, no new infrastructure.

### 4.2 Frontend nav filtering

Extend `useEnabledModules` (or add a sibling hook, `useAssignedModules`, composed by `Sidebar.tsx` alongside it) so the admin shell filters against the **intersection** of school-enabled and admin-assigned modules, while `PrincipalShell.tsx` and `TeacherShell.tsx` are untouched (this feature only scopes the admin-portal nav — management and teacher portals have their own separate role gates already, per §1.1, and are out of scope). Concretely: a new `GET /api/admin/my-module-assignments` endpoint (mirroring `GET /api/school-modules/enabled`'s shape — a flat array of keys, or `null`/absence meaning unrestricted) that `Sidebar.tsx` fetches once per session with the same memory+`sessionStorage`+5-minute-TTL pattern `useEnabledModules.ts` already implements, then combines: `item.module` is visible only if it's in *both* `enabledModules` (school-licensed) and `assignedModules` (personally granted, or `null` = everything). Same fail-open posture on fetch error, for consistency with the rest of the nav-filtering system (§1.3) — a transient API failure should reveal nav, never hide it.

---

## 5. UI surface for the assigning admin

New page, `admin-portal/app/admin/manage-admins/page.tsx` (or, if an existing "Admins"/"Manage Staff" admin-portal page already lists `is_admin = true` teachers — not confirmed to exist under `admin-portal/app/admin` in this research pass; if one does, add a "Modules" action there instead of a new top-level page, matching how the prior doc's Phase 2 UI was added as a tab on an *existing* school-detail page rather than a new route). Per admin row: a "Manage module access" action opening a panel listing every `licensable: true` key currently enabled for the school (i.e. `getEnabledModules(schoolId) ∩ licensable keys` — never offer toggling a key the school itself doesn't have, per the ceiling rule in the brief and §2.3), each with a checkbox reflecting whether that admin currently has it (checked = has it, or everything checked-and-disabled-looking if that admin is currently unrestricted, with a separate "Restrict this admin's access" toggle to flip them from unrestricted into an explicit, editable set — since §2.2 makes "no rows" the unrestricted default, the UI needs an explicit action to *create* the first row for someone, not just a naive checkbox grid that's ambiguous about the zero-rows state). Save calls a new `PUT /api/admin/module-assignments/:teacherId` with `{ module_keys: string[] }`, replacing that admin's full row set transactionally (delete+reinsert, same idiom `schoolStaff.js:96-104` already uses for `school_staff_roles` on `PUT /api/school-staff/:id`). Enforces the guardrails from §3's recommended option (c) server-side (not just hidden in the UI): reject with 403 if `req.user.id === teacherId` (no self-edit) and reject any key in the payload that the *assigning* admin's own effective set (unrestricted, or their own `admin_module_assignments` rows) doesn't include.

---

## 6. Edge cases

- **A module is later disabled at the school level while still assigned to specific admins.** No cleanup needed and none proposed: `admin_module_assignments` rows are left untouched (they're inert — §4.1's `checkAdminModuleAssignment` only ever narrows, never widens, what `checkModuleAccess` already allows, so a school-disabled module stays blocked regardless of what's in this new table). If the school later re-enables the module, the admin's old assignment silently becomes meaningful again with zero re-entry needed — consistent with the "archive, don't destroy" philosophy the shipped `checkModuleAccess` already applies at the school level (§0).
- **An admin is demoted back to plain teacher** (`is_admin` flips to `false`, via `teachers.js:850` or `management-users.js:73-77`). Leave their `admin_module_assignments` rows in place rather than deleting them — `checkAdminModuleAssignment` already only fires for `req.user?.role === 'admin'` (§4.1), so the rows become inert the moment their role changes, exactly like the module-disabled case above; if they're re-promoted later, their prior assignment reappears automatically. This needs no code in `teachers.js` or `management-users.js` at all — another point where this feature stays fully decoupled from the promotion/demotion flows.
- **The founding/initial admin's own access.** Under the recommended option (c) (§3), the founding admin is not structurally special — they're just another admin, subject to the same "cannot edit own" and "cannot grant what you lack" guardrails, and (per §2.2) unrestricted by default like every other admin until someone explicitly restricts them. Whether the founding admin specifically should be *exempt* from ever being restricted by anyone is exactly the kind of case option (a)'s primary-admin concept would resolve cleanly (a designated owner who can never be edited by a non-owner) but option (c) cannot resolve on its own without extra schema — flagged as open question 3 below, since it's the same underlying "is there an owner" decision as §3, not a separate one.

---

## 7. Open questions for supervisor sign-off

1. **Who may assign** (§3): recommend option (c) — any admin may assign, but cannot edit their own row and cannot grant a module they don't themselves have — over (a) formalizing a primary-admin/owner concept now, or (b) unrestricted any-admin-to-any-admin. Not decided here; (a) remains available as a later, larger change layered on top of (c).
2. **Default-access posture** (§2.2): recommend "absence of a row = unrestricted" so no existing admin loses access on ship day. Confirm this is the intended interpretation of "assign ... access," not "everyone starts locked out until explicitly granted."
3. **Whether the founding/initial admin should be structurally un-restrictable by any other admin** (§6) — this is the same "is there an owner" question as #1; resolving #1 in favor of (a) resolves this one too, but resolving #1 as (c) leaves this genuinely open and in need of a separate yes/no.
4. **Scope of `licensable: false` (foundation) modules** (§2.3): confirm they should stay outside per-admin scoping entirely (every admin always sees them, matching how every school always has them) rather than becoming assignable too.
5. **Whether this feature should extend to the management portal** (principal/vice-principal, `type: 'management'` logins) at all, given §1.1's finding that a management-role person is frequently also `is_admin = true` on the same row. This document scopes the feature to the admin-portal nav and `checkAdminModuleAssignment` only fires for `role === 'admin'` requests — a principal using the *management* portal is unaffected even if their underlying teacher row has assignment rows. Confirm that's the intended boundary, since the brief's own text left this as a "confirm" item rather than a firm requirement.

## 8. Proposed phased build order

1. **Phase 0 — schema only, no behavior change:** create `admin_module_assignments` (§2.1). Zero rows written by the migration itself (§2.2's "absence = unrestricted" means there is nothing to backfill). Purely additive, zero risk, independently revertible by dropping the empty table.
2. **Phase 1 — backend enforcement:** add `checkAdminModuleAssignment` (§4.1) to `moduleAccess.js`, wire it into the `licensable: true` module routers alongside the existing `checkModuleAccess` calls. With zero rows in the table (Phase 0's state), every admin remains unrestricted — this phase ships with no visible effect until Phase 3 gives admins a way to actually create rows, which is the point: the enforcement layer can be verified safe *before* any UI can trigger a restriction.
3. **Phase 2 — read-only assignment API:** `GET /api/admin/my-module-assignments` (§4.2) and whatever endpoint lists other admins' current assignments for the management UI. Still no writes possible yet.
4. **Phase 3 — write API + guardrails:** `PUT /api/admin/module-assignments/:teacherId` (§5) with the self-edit and grant-ceiling guardrails from the supervisor-approved answer to open question 1.
5. **Phase 4 — UI:** the management panel (§5) and the nav-filtering intersection in `Sidebar.tsx` (§4.2). This is the first point any admin's nav can actually shrink — by design, the last phase, so every earlier phase is inert and safely shippable/revertible on its own.

Each phase is independently shippable and independently revertible, and none of Phases 0-3 changes any admin's observed access — only Phase 4 does, and only once a supervisor-approved assigning admin explicitly uses it.
