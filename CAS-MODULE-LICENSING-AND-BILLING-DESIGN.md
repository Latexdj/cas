# CAS Module Licensing & Student-Count Billing — Design Document

**Status:** Research + design only. Nothing in this document has been implemented. For review with the project supervisor before any build work begins.

**Scope:** (1) document what "modules" currently mean in the codebase, (2) document how subscription fees are currently calculated, (3) propose a per-school à-la-carte module licensing system built on top of what already exists, (4) propose switching subscription billing from teacher-count to student-count.

---

## Part 1 — The existing module system, as it actually is today

### 1.1 Where it lives

- **Registry + defaults:** `backend/src/services/modules.service.js` (49 lines).
- **Per-school state:** `school_modules` table.
- **Read API:** `GET /api/admin/modules` in `backend/src/routes/admin.js`.
- **Consumer:** `admin-portal/components/layout/Sidebar.tsx` (admin shell only).

There is **no super admin UI today for toggling a school's modules.** Module enablement is set once, automatically, at school-creation time, and there is no screen anywhere in the super-admin portal to change it afterward. (Confirmed by the research pass: no route, no page references editing `school_modules` outside the creation-time insert and two one-off backfill statements in `index.js`.) This is the single biggest gap between "what exists" and "what the objective asks for" — the objective's core request (super admin toggles individual modules per school) has **no UI today, at all.**

### 1.2 The registry — exact keys

`MODULE_REGISTRY` in `modules.service.js` defines 15 keys, each with a label, a `core` flag, and a `defaultFor` (which school types get it enabled by default):

| key | label | core | enabled by default for |
|---|---|---|---|
| `teacher_attendance` | Teacher Attendance | **yes** | all |
| `student_attendance` | Student Attendance | no | all |
| `timetable` | Timetable | no | Primary, JHS, SHS, Technical, University, Other |
| `leave_management` | Leave & Excuses | no | all |
| `meeting_attendance` | Meeting Attendance | no | JHS, SHS, Technical, University, Other |
| `plc` | PLC Sessions | no | JHS, SHS |
| `remedial_lessons` | Remedial Lessons | no | JHS, SHS, Technical |
| `assessments` | Assessments & CA | no | Primary, JHS, SHS, Technical |
| `houses` | Houses | no | JHS, SHS |
| `exeat` | Exeat | no | SHS |
| `clearance` | Student Clearance | no | JHS, SHS, University |
| `library` | Library | no | JHS, SHS, University |
| `classroom_qr` | Classroom QR | no | all |
| `fees` | Accounts & Fees | no | Private schools only |
| `inventory` | Inventory | no | all |

`defaultModulesForType(schoolType, schoolCategory)` computes `{key, enabled}` for all 15 at school-creation time: `core` keys are always on; `defaultFor === 'all'` keys are always on; `fees` is on only if `schoolCategory === 'Private'`; everything else is on only if `schoolType` is in its `defaultFor` list. This runs once, in `backend/src/routes/schools.js`'s create-school handler, which inserts one `school_modules` row per key.

**This list does not match the objective's list.** The objective names Attendance, Assessment, Admission, Accounts, Inventory, Library, LMS, Clearance, House Management, Administration/Letter-Writing — ten coarse-grained "product modules." The real registry has 15 finer-grained keys and is **missing three of the objective's ten entirely**: **Admissions, LMS, and Administration/Discipline/Letter-Writing have no module key at all today.** They are mature, fully-built features (see 1.4) that are simply always on for every school, with no licensing concept whatsoever. Any redesign has to decide whether to license at the fine-grained level (15+ keys) or introduce a coarser product-tier grouping that maps onto the objective's ten names — this is addressed in Part 3.

### 1.3 What `school_modules` actually does today: nav-only, not access control

Schema (`backend/src/index.js`, confirmed live in production via `information_schema.columns`):

```sql
CREATE TABLE IF NOT EXISTS school_modules (
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (school_id, module_key)
);
```

Exactly three columns. No audit trail (no `created_at`/`updated_at`/who-changed-it).

**Backend enforcement is almost entirely absent.** Across every route file for every module (`inventory.js`, `library.js`, `lms.js`, `houses.js`, `discipline.js`, `admissions.js`, `clearanceAdmin.js`, `assessments.js`, `attendance.js`), there is exactly **one** module with real server-side gating: `fees`, and it's implemented twice, independently, with no shared middleware:

- `backend/src/routes/principal.js` — a local `feesModuleEnabled(schoolId)` helper, checked inline at the top of `GET /fees/summary`, returning a 403 with message "Accounts & Fees module is not enabled for this school."
- `backend/src/routes/student.js` — the identical query inlined again (not calling the helper above) inside `GET /fees`, returning a 403 with a differently-worded message.

Every other module has **zero** backend check. If a school has `inventory` (or `library`, `houses`, `clearance`, etc.) disabled in `school_modules`, every one of its API routes remains fully reachable by direct call — only the sidebar link disappears. There is no `checkModuleAccess` middleware anywhere in the codebase; the concept doesn't exist yet.

**Frontend gating is admin-shell-only and fails open.** `GET /api/admin/modules` (via `getEnabledModules(schoolId)` — see below) is consumed only by `admin-portal/components/layout/Sidebar.tsx`, which filters nav items whose `item.module` isn't in the enabled list. On any fetch error it explicitly sets `enabledModules = null` and shows everything ("fail open"), confirming this was built as a UX nicety, not a security boundary. The **principal and teacher shells do not read `school_modules` at all** — `TeacherShell.tsx` calls a completely different endpoint (`/api/responsibilities/my-modules`, see the naming-collision note below) that has nothing to do with licensing.

`getEnabledModules`:
```js
async function getEnabledModules(schoolId) {
  const { rows } = await pool.query(
    `SELECT module_key FROM school_modules WHERE school_id = $1 AND enabled = true`,
    [schoolId]
  );
  if (rows.length === 0) return ALL_MODULE_KEYS; // pre-module-system schools: treat as all-enabled
  return rows.map(r => r.module_key);
}
```

**Naming collision to resolve before building anything:** `teacher_responsibilities.module_key` is a completely unrelated existing column (values `['library', 'hod']`, describing a staff role assignment, not a licensed feature). A new/expanded module-licensing system should not add to this confusion — Part 3 proposes a naming fix.

### 1.4 Maturity check — is anything actually a stub?

No. Every one of the ten areas named in the objective is a real, fully-built feature today — routes, tables, and frontend pages all exist. There are no placeholder modules in this codebase.

| Area | Backend routes | Endpoints | Tables | Frontend pages | Has a `school_modules` key today? |
|---|---|---|---|---|---|
| Attendance | `attendance.js`, `student-attendance.js` | 15 | attendance tables | 8+ pages across admin/principal/teacher/student/primary | Yes (`teacher_attendance`, `student_attendance`) |
| Assessment | `assessments.js`, `assessment-modes.js`, `assessment-monitoring.js` | 19 | assessment/CA tables | 4 pages | Yes (`assessments`) |
| **Admission** | `admissions.js`, `admin-admissions.js` | 29 | `school_admission_settings`, `admission_placement`, `admission_applications`, `admission_prospectus` | 6 admin pages + public apply flow | **No module key at all — always on** |
| Accounts (fees) | `fees.js` | 26 | `fee_items`, `fee_schedules`, `fee_payments`, `student_bills` | 4 pages | Yes (`fees`) — **only module with real backend gating** |
| **Inventory — confirmed mature** | `inventory.js` (602 lines) | 19 | `inventory_categories`, `inventory_items`, `inventory_transactions` | 6 pages including a dedicated HOD inventory view; has its own internal role-scoped `inventoryAccess` middleware | Yes (`inventory`) |
| **Library — confirmed mature** | `library.js` + `libraryAdmin.js` | 41 | `library_settings`, `library_books`, `library_copies`, `library_loans`, `library_resources` (5 tables) | 9 pages across admin/teacher/student | Yes (`library`) |
| **LMS** | `lms.js` (1050 lines — the single largest route file in the backend) | 39 | 10 tables (courses, lessons, assignments, submissions, quizzes, quiz questions/attempts/answers, pasco questions, announcements) | student/teacher/admin course, quiz, and pasco pages | **No module key at all — always on** |
| Clearance | `clearanceAdmin.js`, `clearanceStaff.js` | 21 | `clearance_offices`, `clearance_office_staff`, `student_clearances`, `student_clearance_items` | 4 pages | Yes (`clearance`) |
| House Management | `houses.js` | 17 | `houses`, `house_rooms`, `house_room_assignments` | 2 pages | Yes (`houses`) |
| **Administration / Letter-Writing / Discipline** | `discipline.js`, `principal-discipline.js`, `general-letters.js`, `letter-chat.js`, `principal-general-letters.js` | 41 | `student_disciplinary_letters`, `letter_draft_sessions`, `letter_returns`, `general_letters` | 2 pages | **No module key at all — always on** |

So the real "maturity axis" isn't build-completeness — it's **licensing-awareness**. Seven of ten objective areas already have a key and a default rule (even if unenforced); three (Admission, LMS, Administration/Letters) have never been wired into the module concept and are unconditionally available to every school today, regardless of subscription.

### 1.5 Existing plan/subscription concept — yes, and it's what module licensing should hang off

`plans` table (`backend/src/index.js`, confirmed live):
```sql
CREATE TABLE IF NOT EXISTS plans (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT          NOT NULL,
  display_name   TEXT          NOT NULL,
  max_teachers   INTEGER,
  price_monthly  NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_days  INTEGER
);
```
Two seeded rows: `trial` (14 days, max_teachers 50, price 0) and `paid` (no cap, price 0, no duration). `price_monthly` is dead schema — never read anywhere outside its own seed/insert statements.

`subscriptions` table (live schema): `id, school_id, plan_id, status ('trial'|'active'|'expired'|'cancelled'), starts_at, ends_at, created_at, updated_at, teacher_limit`.

So there **is** a plan/tier concept, but it's currently one-dimensional (a teacher-count cap tied to `status`/dates) and has never been connected to `school_modules` at all — a school's plan and a school's enabled modules are two entirely independent, unrelated pieces of state today. Part 3 proposes connecting them.

### 1.6 Existing middleware conventions a new module-access check should follow

`backend/src/middleware/auth.js` has the pattern to imitate. `adminOnly` / `managementOnly` are simple synchronous role checks. The closest real analog to what's needed is `requireActiveSubscription`: async, does a cached DB lookup (5-minute in-memory `Map` keyed by `schoolId`), bypasses for `super_admin`, returns a structured `{error, message}` 403. Every feature router already chains `router.use(authenticate, requireActiveSubscription, ...)` at the top of the file — a new module-access middleware factory slots into that exact same chain, one call per router.

---

## Part 2 — The existing billing logic, as it actually is today

### 2.1 There is no pricing engine

This needs to be said plainly because it reframes the whole task: **there is no dollar amount computed anywhere in this codebase today.** `plans.price_monthly` exists as a column but is never `SELECT`ed, displayed, or multiplied by anything, on backend or frontend (confirmed by a full-repo grep). What the objective calls "subscription fees ... based on number of teachers" is, in the actual code, not a fee calculation at all — it is a **hard technical cap**: a stored integer (`subscriptions.teacher_limit`) that blocks adding more teachers once reached. There is no invoice table, no charge table, no automatic payment anywhere in the platform-billing sense (`fee_payments` is the school's own *student* fee-collection feature — a different thing entirely, part of the Accounts module).

### 2.2 Where `teacher_limit` comes from and how it's enforced

- **Set manually, once, at school creation:** `backend/src/routes/schools.js`, `POST /` — `const teacherLimit = Math.max(10, parseInt(req.body.teacherLimit) || 10);`. It is a super-admin-entered number on the create-school form, not derived from anything.
- **Editable manually afterward** via `PATCH /api/schools/:id/subscription` and `PATCH /api/schools/:id/teacher-limit`, both requiring `limit >= 10`.
- **Enforced live, and it does hard-block:** `backend/src/routes/teachers.js`, both single-teacher creation (`POST /`) and bulk CSV import compare a live `SELECT COUNT(*) FROM teachers WHERE school_id=$1 AND status='Active'` against the stored `teacher_limit` and return a 403 ("Teacher limit reached") once at/over. This is the only real "feature gated by count" mechanism in the system today, and it targets teacher count specifically.
- **Never dynamically recalculated** — it's a snapshot, not a live formula. No fee/dollar amount is derived from it anywhere.

### 2.3 Other consumers of teacher count as a proxy

Only cosmetic ones: the super-admin schools list and school-detail pages show an `active_teachers / teacher_limit` ratio (a progress bar that turns red at/over the limit). No feature unlock, no fee, no tier logic anywhere else reads teacher count. So switching the underlying metric from teacher count to student count is contained — it doesn't ripple through some larger pricing system, because no such system exists yet to ripple through.

### 2.4 Is billing automated? — partially, and not in the way "automated billing" usually implies

There is no auto-invoicing and no auto-charging anywhere. There is one cron job, `backend/src/jobs/subscriptionExpiry.js`, running hourly plus once at boot. It finds `active` subscriptions whose `ends_at` has passed, marks them `expired`, and **automatically inserts a brand-new 14-day trial subscription** for that school (carrying forward the old `teacher_limit`), logging an audit entry. Critically: **this is a soft landing, not a suspension.** A lapsed paid subscription does not lock the school out — it silently grants another two weeks of full access. Separately, `requireActiveSubscription` does its own per-request check against whatever the *current* subscription row is; a school is only actually blocked (403 `subscription_expired`) once that current row (which, thanks to the job, is often itself a freshly-minted trial) is itself expired/cancelled with no follow-up row created. So today: a school's access degrades only after two independent lapses, and every part of the process — issuing a new "invoice" in the loose sense of a new period, deciding to charge, moving money — is manual; the super admin sets dates and limits by hand in the UI.

### 2.5 Student count — already cheap to query, not yet surfaced

`students` has `school_id` and `status` columns and is already queried per-school in several places (e.g. `principal.js`: `SELECT COUNT(*) FROM students WHERE school_id=$1 AND status='Active'`). But **no cross-tenant / super-admin view exposes a student count today** — `GET /api/schools` (list) and `GET /api/schools/:id` (detail) compute `active_teachers` via a subquery but have no equivalent for students; `GET /api/super-admin/stats` aggregates `total_teachers` globally but has no student figure at all. This means switching to student-count billing needs no new schema and no new indexes — just the same kind of subquery already used for `active_teachers`, added in the same two places.

---

## Part 3 — Redesign: per-school à-la-carte module licensing

### 3.1 Principle: extend, don't replace

`school_modules` and `modules.service.js` already do the two hardest, most tedious parts correctly — a working per-school table with a primary key on `(school_id, module_key)`, and a sensible school-type-aware default-provisioning function that already runs at school creation. The redesign keeps both. It does **not** introduce a second, parallel "licensing" table. What's missing is (a) three module keys for features that exist but were never registered, (b) real backend enforcement beyond `fees`, (c) a super-admin UI to actually toggle things, and (d) a caching strategy so nav-filtering doesn't refetch on every page.

### 3.2 Schema changes — additive only

**No structural change to `school_modules` itself** — its 3-column shape is sufficient for enable/disable. Two additive changes:

1. **Register the three missing keys** in `MODULE_REGISTRY` / `ALL_MODULE_KEYS`: `admissions`, `lms`, `discipline` (covering Administration/Letter-Writing, which spans `discipline.js` + `general-letters.js` + `letter-chat.js` — one licensing key covering all three route files, since the objective treats "Administration/Letter-Writing" as one product line). Backfill existing schools the same way the July `inventory` backfill already did it: `INSERT INTO school_modules (school_id, module_key, enabled) SELECT id, 'admissions', true FROM schools WHERE NOT EXISTS (...) ON CONFLICT DO NOTHING` — defaulting existing schools to **enabled**, since these features have always been available to them and revoking on migration day would be a surprise regression, not a licensing decision.

2. **Rename the concept, not the column, to resolve the collision**: keep `school_modules.module_key` as-is (renaming a live column touching 15+ query sites for a cosmetic clarity win isn't worth the risk), but document clearly in code comments that `teacher_responsibilities.module_key` is an unrelated staff-role enum. This is a documentation fix, not a migration.

No change is proposed to `plans`/`subscriptions` schema in this Part — module licensing and plan/billing are connected at the *product* level, not the *schema* level (see 3.6 and Part 4.4 for how they interact).

### 3.3 Backend: `checkModuleAccess(moduleKey)` middleware

New file `backend/src/middleware/moduleAccess.js`, following the exact shape of `requireActiveSubscription` (super-admin bypass, cache, structured 403):

```js
const moduleCache = new Map(); // schoolId -> { keys: Set<string>, expires: number }
const TTL_MS = 5 * 60 * 1000;

function checkModuleAccess(moduleKey) {
  return async function (req, res, next) {
    if (req.user?.role === 'super_admin') return next();
    if (!req.schoolId) return res.status(400).json({ error: 'School context required' });

    let entry = moduleCache.get(req.schoolId);
    if (!entry || entry.expires < Date.now()) {
      const enabled = await getEnabledModules(req.schoolId); // existing function, unchanged
      entry = { keys: new Set(enabled), expires: Date.now() + TTL_MS };
      moduleCache.set(req.schoolId, entry);
    }
    if (!entry.keys.has(moduleKey)) {
      return res.status(403).json({
        error: 'module_not_enabled',
        message: `The ${moduleKey} module is not enabled for this school.`,
      });
    }
    next();
  };
}
```

Applied per-router, alongside the existing chain, e.g. `inventory.js`: `router.use(authenticate, requireActiveSubscription, checkModuleAccess('inventory'))`. This closes the gap identified in 1.3 (today only `fees` is actually enforced) by reusing the exact convention the codebase already has for subscription checks, rather than inventing a new pattern. The two existing ad-hoc `fees`-only checks in `principal.js` and `student.js` are replaced by this same middleware for consistency, removing the duplicated logic.

Cache invalidation: when a super admin toggles a module (3.5), the route handler clears that school's entry from `moduleCache` directly (it's an in-process `Map`, same pattern `requireActiveSubscription` already uses — no new infra needed).

### 3.4 Frontend: hide, not disable, with shared caching

Today only the admin `Sidebar.tsx` reads `school_modules`, and it does so with its own local `useEffect` + `useState`, fetching fresh on every mount. To extend this to the principal and teacher shells without adding a fresh network call on every page load:

- Introduce one shared hook, `useEnabledModules()`, backed by a simple module-level cache + `localStorage` (mirroring how this codebase already solved an analogous problem with `useSessionFilter` this session): fetch `GET /api/admin/modules` once per session, cache in memory, fall back to a `sessionStorage` copy on remount so a client-side navigation doesn't refetch. TTL matches the backend cache (5 minutes) so a super-admin toggle is picked up within the same window on both sides.
- All three shells (`Sidebar.tsx`, `PrincipalShell.tsx`, `TeacherShell.tsx`) import this one hook instead of `Sidebar.tsx` doing its own thing and the other two doing nothing.
- Nav filtering itself stays "fail open" on fetch error, matching current behavior — a transient API failure should never lock a school out of its own already-licensed nav, only an explicit disable should.
- "Hide not disable" means the item is removed from the `items` array entirely (as today), not rendered-and-grayed — consistent with the existing filter implementation, just applied more broadly.

### 3.5 Super admin UI: per-school module toggle screen

New page, `admin-portal/app/super-admin/(shell)/schools/[id]/modules/page.tsx` (or a new tab on the existing school-detail page, which already shows the teacher-limit editor — a "Modules" tab alongside it is the more discoverable placement and keeps subscription-adjacent controls together). Renders one row per `MODULE_REGISTRY` entry (label, description, current on/off), a toggle per row, `PATCH /api/schools/:id/modules` accepting `{ module_key, enabled }`, writing to `school_modules` and invalidating that school's `moduleCache` entry server-side. Core modules (`teacher_attendance` per the registry's `core: true` flag) render as always-on, non-toggleable, visually distinguished — this is the UI-level expression of the core-boundary guarantee in 3.6.

### 3.6 Core-boundary guarantee

Student records, academic years, and teacher management are **not** in `MODULE_REGISTRY` at all today — they're not gated, have never been gated, and this design does not add them. That's the guarantee: the module system only ever gates the 15 (soon 18) registry keys; anything not in the registry is structurally incapable of being gated by `checkModuleAccess`, because the middleware only checks membership in `getEnabledModules()`'s result for a named key that a route explicitly opts into. There's no global "lock the school out" switch.

The dependency risk the objective calls out — Assessment depending on academic-year data — is a **read** dependency (Assessment routes read `academic_years`/`academic_terms` tables, which have no module key and are never gated), not a permission dependency, so disabling `assessments` doesn't touch academic-year access for any other module. This should be spot-checked module-by-module during implementation (Part 3 build phase), not assumed from this document alone, since `assessment-monitoring.js` and others also join across `timetable`, which today defaults on for most school types but is itself a gateable key — if a school ever disabled `timetable`, would `assessments` degrade? This is a real open question worth resolving during implementation, flagged in the open-questions list below as a **dependency-graph check**, not because it needs supervisor judgment, but because it needs an engineer to actually trace it before shipping.

### 3.7 Flagged for supervisor: data handling on module revocation

Not decided here. Three options exist along a spectrum:
- **Hard delete** — simplest, but destroys history a school might expect back if they re-subscribe to a module later (e.g. re-enabling Library after a lapsed payment shouldn't erase the catalog).
- **Archive/soft-lock (read-only)** — the module's existing data stays queryable by the school's own admin (so nothing looks "lost"), but write routes 403 via `checkModuleAccess`; re-enabling instantly restores full function with zero data loss. This matches how `requireActiveSubscription` already behaves for a whole school (data isn't deleted on subscription lapse, access is just blocked) — reusing that mental model at the per-module level is the most consistent option with the rest of the system's existing behavior.
- **Full lockout including reads** — data exists in the DB but is fully inaccessible, including to the school's own admin, until re-enabled.

**This document does not choose one.** It needs supervisor sign-off because it's a data-retention/business policy decision, not a technical one — the middleware in 3.3 can implement any of the three equally easily (option 2 needs no extra code at all; option 1 needs a scheduled purge job; option 3 needs no extra code either, just a stricter check).

---

## Part 4 — Redesign: student-count-based billing

### 4.1 What's actually changing

Because Part 2 established there is no real pricing formula today (`price_monthly` is dead), this isn't "migrate a formula from teachers to students" — it's building the first real one, using students instead of teachers as the unit. Concretely: rename/repurpose `subscriptions.teacher_limit`'s role as the enforced cap to a new `subscriptions.student_limit`, and move the live-count enforcement in `teachers.js` (blocking new teacher creation past a cap) to an equivalent check in `students.js` (blocking new student creation/activation past a cap). Teacher creation becomes uncapped — this is a deliberate, visible behavior change for every existing school and should be called out explicitly to the supervisor as a consequence, not just a mechanism swap.

### 4.2 Data source: live query, not a snapshot

Recommendation: **live-query at enforcement time and at billing-review time, not a periodic snapshot.** Reasoning: Part 2.5 already showed `SELECT COUNT(*) FROM students WHERE school_id=$1 AND status='Active'` is cheap (it's already run per-school in several places with no performance concern raised), and the current teacher-count enforcement is also live, not snapshotted — a snapshot would be a new, unnecessary mechanism inconsistent with how the system already treats teacher count. A snapshot only becomes worth the added complexity (cadence, drift handling) once actual dollar invoicing exists and a school needs a stable, disputable number for a specific billing period — that's a real future need, but it doesn't exist yet (there's no invoice at all today, per 2.1), so building snapshot infrastructure now would be solving a problem the platform doesn't have yet. If/when real invoicing is built, the natural extension is a monthly snapshot taken by the existing `subscriptionExpiry.js` cron (it already runs hourly and already touches every school's subscription row) rather than a new job.

**Mid-cycle enrollment change:** since it's live-queried, this is a non-issue for enforcement (the cap check always reflects reality). It only becomes a question once real billing exists — addressed as an open question below, since it depends on a business decision (bill the peak count for the period? the count as of billing date? average?) this document shouldn't preempt.

### 4.3 Transition plan for existing teacher-count-billed schools

Because there is no live dollar amount tied to `teacher_limit` today (2.1), there is no "price" to recompute — only the enforcement cap changes meaning. Proposed sequence:
1. Add `student_limit` to `subscriptions` (nullable at first), defaulting new schools to a sensible baseline (e.g. seeded from the plan, mirroring how `teacher_limit` is seeded today).
2. For existing schools, backfill `student_limit` generously above their current live student count (e.g. current count rounded up to the next tier boundary) so no school is immediately blocked from activating new students the moment this ships — this is the same non-disruptive posture the original `inventory` backfill took (default to enabled/uncapped-enough, never retroactively punish existing schools for a policy that didn't exist when they signed up).
3. Leave `teacher_limit` enforcement in place but non-decreasing (stop shrinking it, stop treating it as the primary constraint) for one transition period, then remove the teacher cap check from `teachers.js` once `student_limit` enforcement in `students.js` has been live and verified.
4. Notify schools before the cap logic actually changes behavior for them — not before the code ships, but before any school would actually hit a new limit it wasn't expecting. Whether "notify" means an in-app banner, an email, or a manual super-admin outreach is a business decision, flagged below.

### 4.4 How module licensing and billing interact

**Proposed: two independent axes — a base fee (or cap) by student count, plus modules are a separate on/off licensing decision with no per-module fee multiplier, at least initially.** Reasoning: introducing a per-module price on top of a student-count base fee compounds two brand-new pricing concepts at once (this document already establishes neither exists today), which multiplies the surface area for billing bugs and support disputes right out of the gate. A student-count base tier (mirroring the cap-based approach the system already understands, just recentered on students) is a smaller, safer first step; module licensing in Part 3 is fundamentally an *access* feature (a super admin deciding what a school's staff can see and touch), not necessarily a *revenue* feature on day one. If usage data later shows demand for premium add-on modules (e.g. LMS as a paid upsell), that can be layered on as a second, explicit pricing dimension once the first (student-count base) has shipped and stabilized — proposing both simultaneously here would be designing for a hypothetical the supervisor hasn't asked for yet. This is a recommendation, not a foreclosed decision — flagged below for explicit sign-off since it's a monetization strategy call, not a technical one.

---

## Open questions requiring supervisor sign-off

1. **Module revocation data handling** (Part 3.7): hard delete vs. archive/read-only-lock vs. full lockout when a module is disabled for a school. Recommendation given: archive/read-only-lock, for consistency with existing subscription-lapse behavior — but not decided.
2. **Core-boundary dependency graph** (Part 3.6): confirm, module-by-module during implementation, that no gateable module (e.g. `assessments`) silently breaks if a *different* gateable module it happens to join against (e.g. `timetable`) is disabled. Needs an engineering pass, not just this document's reasoning.
3. **Billing-transition handling** (Part 4.3): what counts as fair notice to a school before the student-count cap can actually block them, and through what channel (in-app banner / email / manual outreach) — a business/comms decision, not a technical one.
4. **Module/billing interaction model** (Part 4.4): confirm the recommended "two independent axes, no per-module fee yet" approach, versus building per-module pricing in from the start.
5. (New, surfaced by research, not in the original four): **Which ten "modules" the objective names should map onto which of the system's real 15+ registry keys** — e.g. should "Attendance" as a licensable product unit mean both `teacher_attendance` (currently `core`, i.e. never gateable) and `student_attendance` together, sold/toggled as one unit? The registry is finer-grained than the objective's product list; someone needs to decide whether the super-admin toggle screen (3.5) exposes all 15+ keys individually, or groups them into the ten coarser product names for a simpler UI, with the finer keys toggled together behind the scenes.

## Proposed phased build order

1. **Phase 0 — no behavior change:** add the three missing registry keys (`admissions`, `lms`, `discipline`) defaulted to enabled for all existing schools; fix the `module_key` naming-collision documentation. Pure additive migration, zero risk.
2. **Phase 1 — close the enforcement gap:** build `checkModuleAccess` middleware, apply it to every module's router, replace the two duplicated ad-hoc `fees` checks with it. This alone makes the *existing* toggle mechanism (currently nav-only) actually mean something server-side, before any new UI is built.
3. **Phase 2 — super admin UI:** build the per-school module toggle screen (3.5). This is the first point at which a super admin can actually change a school's modules after creation — today they cannot, at all.
4. **Phase 3 — frontend nav parity:** shared `useEnabledModules()` hook; wire principal and teacher shells to it (today only admin filters nav).
5. **Phase 4 — student-count cap:** add `student_limit`, backfill existing schools generously, enforce in `students.js`, run in parallel with the existing teacher cap for a transition window, then retire the teacher cap.
6. **Phase 5 (later, only if pursued):** real invoicing/pricing engine, snapshot-based billing periods, per-module pricing — none of which exist today and none of which this document recommends building yet.

Each phase is independently shippable and independently revertible; none of Phase 1-4 requires resolving open question 5, though it should ideally be answered before Phase 2's UI is built, since it determines whether that screen shows 15+ toggles or 10.
