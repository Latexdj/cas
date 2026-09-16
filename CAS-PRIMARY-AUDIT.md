# Audit Report: backend/src/routes/primary.js

File: `backend/src/routes/primary.js`
Length: 3061 lines
Audit date: 2026-09-03

---

## Section 1 -- File Structure and Internal Boundaries

### Route handler inventory

The file registers **90 route handlers** across these functional areas:

| Area | Handlers | Lines (approx.) |
|---|---|---|
| Terms (CRUD + set-current) | 5 | 36-114 |
| Students (CRUD + bulk ops) | 11 | 120-653 |
| Class teachers | 4 | 658-724 |
| Classes (school-defined list) | 6 | 730-841 |
| Subject catalog (CRUD) | 4 | 846-912 |
| Class-subject assignments | 2 | 915-985 |
| Subjects (direct CRUD) | 4 | 990-1044 |
| Student daily attendance | 3 | 1049-1172 |
| Scores (read + bulk upsert) | 2 | 1177-1301 |
| Score Excel templates + upload | 4 | 1333-1694 |
| Teacher attendance (admin-managed) | 3 | 1699-1765 |
| Grade scale | 2 | 1770-1808 |
| Reports / remarks | 8 | 1815-2143 |
| Dashboard stats | 1 | 2149-2183 |
| Teacher GPS clock-in / clock-out | 4 | 2200-2303 |
| Admin self-attendance management | 4 | 2308-2408 |
| Admin absence-check trigger | 1 | 2402-2408 |
| Teacher excuses (CRUD + approve/reject) | 5 | 2413-2520 |
| Assessment modes (CRUD) | 4 | 2525-2588 |
| Assessments + scores | 6 | 2703-2897 |
| Cashbook | 7 | 2902-3059 |

### Module-level helper functions

Six functions are defined at module scope (outside any handler):

| Function | Line | Purpose |
|---|---|---|
| `getGradeScale(schoolId)` | 15 | Fetches `primary_grade_scale` rows for the school |
| `assignGrade(total, scale)` | 24 | Maps numeric total to grade string |
| `recalcPositions(schoolId, termId)` | 1304 | RANK() positions per subject after a score save |
| `numToCol(n)` | 1325 | Excel column-letter helper |
| `verifySchoolGps(school, userLat, userLng)` | 2189 | Local GPS distance check against school centre |
| `recalcFromAssessments(schoolId, termId, subjectId, teacherId)` | 2594 | Full mode-weighted score rollup |

Note: `const { calculateDistance } = require('../services/geo.service')` appears at line 2187, mid-file rather than with the top-level imports. Cosmetic but inconsistent.

### Duplicated logic patterns

**Finding 1.1 -- "Resolve teacher's current class" SQL block copied five times**

The pattern below appears at lines 129, 1061, 1135 (identical) and slight variants at lines 1189 and 1845:

```sql
SELECT ct.class_name FROM primary_class_teachers ct
JOIN academic_years ay ON ay.id = ct.academic_year_id
WHERE ct.school_id = $1 AND ct.teacher_id = $2 AND ay.is_current = true
ORDER BY ay.name DESC LIMIT 1
```

Recommended fix: extract a shared `resolveTeacherClass(pool, schoolId, teacherId)` async helper.

**Finding 1.2 -- Student report data assembly duplicated with diverged column names**

`GET /reports/student` (query-param, lines 1885-1948) and `GET /reports/student/:student_id` (path-param, lines 1976-2038) both fetch student + term + scores + remarks + attendance but have silently diverged:

- Query-param variant: attendance columns named `present`, `absent`, `late`, `excused`
- Path-param variant: attendance columns named `present_days`, `absent_days`, `late_days`
- Path-param variant also computes `overallPosition`, `classSize`, and `grandTotal`; query-param variant does not

A frontend that switches between these endpoints sees unexpected shape differences.

**Finding 1.3 -- Grade scale lookup re-fetched per call site (four separate round-trips)**

`getGradeScale` is called independently at lines 1273, 1460, 1654, and 2647. The helper functions exist so this is not raw SQL duplication, but each call is a separate database round-trip with no per-request caching.

---

## Section 2 -- Cashbook Financial Logic

### Operations found

Seven endpoints (lines 2902-3059):

- `GET /cashbook` -- list cashbooks for a term
- `POST /cashbook` -- create a cashbook
- `GET /cashbook/:id/entries` -- list entries
- `POST /cashbook/:id/entries` -- add entry (with optional receipt upload)
- `PUT /cashbook/:id/entries/:entryId` -- edit entry
- `DELETE /cashbook/:id/entries/:entryId` -- delete entry
- `GET /cashbook/:id/summary` -- totals by entry_type

### Transaction wrapping

No cashbook write is wrapped in `BEGIN`/`COMMIT`. This is not a correctness problem because every cashbook write is a single SQL statement (INSERT, UPDATE, or DELETE) -- single statements are inherently atomic in PostgreSQL.

**Finding 2.1 -- Receipt upload failure silently lost**

`POST /cashbook/:id/entries` and `PUT /cashbook/:id/entries/:entryId` each do: INSERT/UPDATE entry -> `uploadFile()` -> UPDATE `receipt_url`. If `uploadFile` throws, the entry is committed without a `receipt_url` and the error is only logged with `console.error`. The client receives a success response. An admin cannot easily detect that a receipt was silently lost.

- Severity: wrong-but-recoverable
- Recommended fix: include `receipt_upload_failed: true` in the response when `uploadFile` fails, so the client can surface an actionable warning.

### Running balance / race condition

The `primary_cashbooks` table has `opening_balance NUMERIC(12,2)` only -- no `current_balance` column. Balance is always computed by the summary endpoint (`SUM(amount)` per entry_type). There is no read-modify-write cycle and no race condition risk.

### Term/year scoping

`primary_cashbooks` has an `academic_year_id` reference (year-level cashbook). `primary_cashbook_entries` has only `entry_date` -- no `term_id`. A single cashbook covers an entire academic year across all terms.

---

## Section 3 -- Promotions

### What happens on promotion

`POST /students/promote` (lines 177-203): single SQL `UPDATE primary_students SET class_name=$1 WHERE ... AND status='Active'`. Only `class_name` and `updated_at` change. Attendance history, scores, cashbook entries, and report remarks are untouched (preserved for historical reference).

`POST /students/graduate` (lines 206-229): sets `status='Graduated'` only.

### Transaction wrapping

Not needed and not present -- each operation is a single SQL `UPDATE`, which is inherently atomic.

**Finding 3.1 -- `from_class` silently ignored in selective promote (student_ids branch)**

Lines 186-192: when `student_ids` is supplied in the request body, the WHERE clause is:

```sql
UPDATE primary_students SET class_name=$1, updated_at=now()
WHERE id = ANY($2::uuid[]) AND school_id=$3 AND status='Active'
```

The `from_class` parameter is validated as non-null (line 181) but never used in this branch's WHERE clause. An admin can accidentally promote students in the wrong source class by supplying their UUIDs directly.

- Severity: wrong-but-recoverable (class_name can be corrected manually)
- Recommended fix: add `AND LOWER(class_name) = LOWER($4)` with `from_class` as `$4`

**Finding 3.2 -- No double-promote guard**

In the bulk (no `student_ids`) branch, calling promote twice is harmless because the second call finds no students still in `from_class`. In the selective branch, calling twice with the same IDs but a different `to_class` silently moves students again -- no idempotency guard.

### Un-promote / reversal

No undo endpoint. Reversal requires a second promote call with reversed classes or a direct DB edit.

### Guards for incomplete scores or mid-year promotion

None. Promotion can be triggered at any time with no score-completeness check, no term-closed check, and no confirmation step.

---

## Section 4 -- Teacher GPS Clock-In

### Primary GPS implementation

`verifySchoolGps(school, userLat, userLng)` is defined locally in `primary.js` at lines 2189-2197. It calls `calculateDistance` from `geo.service.js` but the check logic itself is not from any shared utility. It reads from `schools.school_latitude`, `schools.school_longitude`, and `schools.school_gps_radius`.

Default radius: `school.school_gps_radius ?? 100` -- 100 metres when the column is null.

### Secondary GPS implementation (attendance.js)

`attendance.js` imports `verifyLocation` directly from `geo.service.js`. That function reads from `locations.radius_meters` (a per-classroom row in the `locations` table) with no code-level default.

### Comparison

| Aspect | Primary (primary.js) | Secondary (attendance.js) |
|---|---|---|
| GPS centre | School-wide single point (schools table) | Per-classroom (locations table) |
| Radius source | `schools.school_gps_radius` | `locations.radius_meters` |
| Default radius | 100 m | None (column must be set) |
| Shared utility | `calculateDistance` shared; check logic is local | Full `verifyLocation` from geo.service.js |
| On GPS unconfigured | Returns 400 (blocks) | Returns 400 (blocks) |
| On outside radius | Returns 400 (blocks) | Returns 400 (blocks) |

**Finding 4.1 -- `verifySchoolGps` re-implements `verifyLocation` from geo.service.js**

Both use identical Haversine-based logic but pull from different column sources. If the GPS check ever needs to change (tolerance buffer, accuracy model), it must be updated in two places.

- Severity: cosmetic / maintenance risk
- Recommended fix: move `verifySchoolGps` into `geo.service.js` as an exported function, remove the mid-file `require` at line 2187.

**No device accuracy check (both files):** Neither file validates the GPS accuracy field reported by the device. A teacher with a 500 m accuracy fix passes or fails purely on the reported coordinates.

---

## Section 5 -- Scoring and Report Remarks

### Grade boundary implementation

Primary.js uses `primary_grade_scale` (per-school, admin-configured) through `getGradeScale` / `assignGrade`. This table is entirely separate from `grade_boundaries` used by the secondary system (`results.js`).

- No hardcoded grade thresholds in primary.js. The only hardcoded value is `'F9'` at line 30 -- a fallback sentinel returned when no scale row matches, not a threshold.
- `primary_grade_scale` uses raw `min_score`/`max_score` (absolute marks). Secondary `grade_boundaries` uses `min_pct`/`max_pct` (percentages) plus an `exam_body` column. These are intentionally different paradigms.

### Term count assumption

None. Primary.js manages terms entirely through `primary_terms` CRUD. No hardcoded count of 3 terms appears anywhere. The secondary system uses `current_semester` (1 or 2) from `academic_years`; the two systems are fully independent.

**Finding 5.1 -- `recalcFromAssessments` omits `school_id` from one term lookup**

Lines 2601-2603:

```sql
SELECT academic_year_id FROM primary_terms WHERE id = $1
```

The `school_id` filter is absent. In practice the `termId` was already validated against `school_id` at line 2854, so cross-school data is not reachable. But the omission is inconsistent with the pattern used everywhere else in the file.

- Severity: cosmetic (no exploitable path, but should be fixed for consistency)
- Recommended fix: add `AND school_id = $2` with `schoolId` as `$2`

**Finding 5.2 -- `recalcFromAssessments` runs outside the score-save transaction**

`POST /assessments/:id/scores` commits assessment scores in a transaction (lines 2876-2888), then calls `recalcFromAssessments` at line 2892 in a separate operation. If `recalcFromAssessments` fails, assessment scores are committed but `primary_scores` is stale.

- Severity: wrong-but-recoverable (a subsequent score save re-triggers the recalc; stale data is not permanent)
- Note: the same pattern is used for `recalcPositions` throughout the file; this is a consistent design choice

---

## Section 6 -- Code Health Signals

### Multi-tenancy (school_id filtering)

`router.use(authenticate, requireActiveSubscription)` applies globally at line 11. `school_id` appears ~156 times across the file. All SELECT/UPDATE/DELETE handlers consistently filter by `school_id` via `req.schoolId`.

The one gap is Finding 5.1 (`recalcFromAssessments` term lookup, line 2601).

### Authentication / role guards

All routes require authentication (global middleware). `adminOnly` is applied correctly to all admin-scoped writes.

**Finding 6.1 -- `GET /attendance/summary` has no class-scope guard for teachers**

Lines 1086-1118: any authenticated user can supply any `class_name` as a query parameter and retrieve attendance statistics for that class. The `term_id` is validated against `school_id`, but `class_name` is taken directly from the query string with no teacher-class ownership check.

- Severity: wrong-but-recoverable (intra-school information disclosure; not cross-school)
- Recommended fix: add `adminOnly`, or for teachers resolve their assigned class and override the supplied `class_name`

**Finding 6.2 -- `GET /reports/student` (both variants) have no class-scope guard**

Lines 1885 and 1976: any authenticated teacher can fetch the full report (scores, remarks, affective ratings) for any student in the same school, not just students in their own class.

- Severity: wrong-but-recoverable (intra-school information disclosure)
- Recommended fix: verify the requesting teacher is assigned to the student's class for the term's academic year, or is admin

### Duplicate / dead routes

**Finding 6.3 -- `GET /reports` at line 1951 is a dead legacy alias**

Commented as "legacy alias kept for backwards compat." Returns similar data to `GET /reports/overview?class_name=...` but with a different column set. No removal milestone is set, and neither route is deprecated in any documented way.

- Severity: cosmetic / maintenance burden

**Finding 6.4 -- `GET /reports/student` vs `GET /reports/student/:student_id` have diverged shapes**

As noted in Finding 1.2, the two student report endpoints return different attendance column names and the query-param variant is missing `overallPosition`, `classSize`, and `grandTotal`. A frontend that switches between them sees unexpected field differences.

- Severity: wrong-but-recoverable (data is correct; shape differs)

### Confirmed prior fix (commit c2f2bcf)

All five previously bare `LIMIT 1` current-year lookups now carry `ORDER BY ay.name DESC LIMIT 1`:

- Line 129 (`GET /students` teacher-class lookup)
- Line 667 (`GET /my-class`)
- Line 735 (`GET /classes` academic-year fallback)
- Line 1061 (`GET /attendance` teacher-class lookup)
- Line 1135 (`POST /attendance` teacher-class lookup)

**Finding 6.5 -- One remaining bare `LIMIT 1` without `ORDER BY` in `GET /dashboard-stats`**

Lines 2160-2165:

```sql
SELECT t.id, t.name FROM primary_terms t
JOIN academic_years ay ON ay.id = t.academic_year_id
WHERE t.school_id = $1 AND t.is_current = true AND ay.is_current = true
LIMIT 1
```

If more than one term row has `is_current = true` within the current academic year, the result is non-deterministic. This query was not modified by c2f2bcf.

- Severity: wrong-but-recoverable (dashboard shows wrong term name in an unlikely race state; not data-corrupting)
- Recommended fix: add `ORDER BY ay.name DESC, t.term_number DESC` before `LIMIT 1`

---

## Prioritized Fix List

### DATA-CORRUPTING

None identified. The cashbook has no running-balance column (no partial-update corruption). Promotions use single-statement SQL (atomic). Grade recalc failures leave stale but re-computable data.

### WRONG-BUT-RECOVERABLE (fix in order of impact)

**P1 -- Finding 3.1: `from_class` silently ignored in selective promote**
File: `primary.js` lines 186-192
Add `AND LOWER(class_name) = LOWER($4)` to the WHERE clause in the `student_ids` branch. Pass `from_class` as `$4`.

**P2 -- Finding 2.1: Receipt upload failure silently lost**
File: `primary.js` lines ~2977-2985 and ~3008-3016
Add `receipt_upload_failed: true` to the response when `uploadFile` throws so the client can surface an actionable warning.

**P3 -- Finding 6.2: Full student report readable by any teacher in the school**
File: `primary.js` lines 1885 and 1976
Add a teacher-class check: verify the requesting teacher is assigned to the student's class for the term's academic year, or is admin.

**P4 -- Finding 6.1: `GET /attendance/summary` has no teacher class-scope guard**
File: `primary.js` lines 1086-1118
Add `adminOnly`, or resolve the teacher's assigned class and ignore the supplied `class_name` for non-admin callers.

**P5 -- Finding 6.5: Bare `LIMIT 1` without `ORDER BY` in `dashboard-stats`**
File: `primary.js` line 2164
Add `ORDER BY ay.name DESC, t.term_number DESC` before `LIMIT 1`.

**P6 -- Finding 5.2: `recalcFromAssessments` runs outside the score-save transaction**
File: `primary.js` line 2892
Accept the current design (it is consistent with `recalcPositions` throughout the file) or wrap both score-save and recalc in a single transaction.

### COSMETIC / MAINTENANCE

**P7 -- Finding 4.1: `verifySchoolGps` duplicates `verifyLocation` logic**
File: `primary.js` lines 2187-2197
Move to `geo.service.js` as an exported function. Remove the mid-file `require` at line 2187.

**P8 -- Finding 5.1: Missing `school_id` in term lookup inside `recalcFromAssessments`**
File: `primary.js` line 2601
Add `AND school_id = $2`.

**P9 -- Finding 1.2: Duplicated student report assembly with diverged column names**
File: `primary.js` lines 1885-1948 vs 1976-2038
Extract a shared `buildStudentReport(studentId, termId, schoolId)` async helper. Eliminate the divergence in attendance column names and computed fields.

**P10 -- Finding 6.3: Dead `GET /reports` legacy alias**
File: `primary.js` lines 1951-1973
Set a removal milestone. Ensure all active clients use `GET /reports/overview`.

**P11 -- Finding 1.1: "Resolve teacher's current class" SQL block copied five times**
File: `primary.js` lines 129, 1061, 1135, 1189, 1845
Extract a shared `resolveTeacherClass(pool, schoolId, teacherId)` async helper.

---

## Assessment: Is Splitting This File Worth the Effort?

### What the split would produce

Six sub-modules:

| Sub-module | Handlers | Lines extracted (approx.) |
|---|---|---|
| `primary-students.js` | Students CRUD, bulk ops, promote, graduate, upload | ~500 |
| `primary-classes.js` | Classes, class-teachers, subjects, subject catalog, class-subjects | ~450 |
| `primary-scores.js` | Scores, assessment modes, assessments, score templates | ~750 |
| `primary-attendance.js` | Student daily attendance, teacher attendance, GPS clock-in/out, excuses | ~500 |
| `primary-reports.js` | Reports, remarks, grade scale | ~400 |
| `primary-cashbook.js` | Cashbook + entries + summary | ~160 |

Shared helpers (`getGradeScale`, `assignGrade`, `recalcPositions`, `recalcFromAssessments`) would move to `primary-helpers.js`.

### Risk / effort estimate

Effort: medium-high. The shared helpers are called across what would become multiple sub-modules and must be extracted first. The mid-file `require` of `geo.service` must also move. Expect 3-4 hours of careful extraction plus full regression testing across all 90 endpoints.

Risk: low-to-medium if done incrementally. The main risk is route registration order: `/students/classes` and `/students/upload` must be registered before `/students/:id` to avoid the wildcard capturing them. This constraint must be reproduced in the sub-modules.

### Recommendation: Yes, split it -- but fix P1-P5 first

The file is genuinely hard to navigate at 3061 lines. A reviewer auditing the cashbook section must scroll past 2900 lines of unrelated code. The split would have no user-visible impact and would reduce future regression risk substantially. The sub-modules map cleanly to team ownership: a teacher-facing team owns `attendance` and `reports`, an admin team owns `classes`, `students`, and `cashbook`.

Suggested sequencing:
1. Extract helpers and apply P1-P5 correctness fixes as one PR.
2. Split the file into sub-modules as a second PR once tests confirm the helpers are stable.
3. Attempting both in one PR is the main risk to avoid.
