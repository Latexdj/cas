# CAS Academic Year / Term / Holiday Scoping -- Audit Report

> Read-only audit. No code was changed.
> Generated: 2026-09-03
> Follows: CAS System Inventory (see CAS-SYSTEM-INVENTORY.md)

---

## Section 1 -- Full Inventory of Year/Term/Holiday State

### academic_years table

Source: `db/schema.sql` lines 84-91, migrations in `backend/src/index.js`.

| Column | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK schools, NOT NULL |
| name | TEXT | NOT NULL |
| is_current | BOOLEAN | NOT NULL DEFAULT false |
| current_semester | SMALLINT | CHECK (current_semester IN (1, 2)), nullable |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| start_date | DATE | nullable, added via ALTER TABLE |
| end_date | DATE | nullable, added via ALTER TABLE |

**Two redundant partial unique indexes exist on this table:**

- `idx_one_current_year ON academic_years (school_id, is_current) WHERE is_current = true` -- created in `db/schema.sql` lines 94-95
- `academic_years_one_current ON academic_years (school_id) WHERE is_current = true` -- created in `backend/src/routes/academicYears.js` IIFE lines 24-27

Both enforce identical semantics. The second was added as a fix on 2026-09-03 without knowing the first already existed. Harmless but wasteful.

`current_semester` is a single integer (1 or 2) on the year row. It is the canonical active semester. There is no separate "current semester" flag in the `semesters` table.

### semesters table

Created at `backend/src/routes/academicYears.js` lines 11-21 and again (redundantly) at `backend/src/index.js` lines 2135-2146.

Columns: `id`, `school_id`, `academic_year_id`, `number` (SMALLINT CHECK IN (1,2)), `name`, `start_date`, `end_date`, `created_at`. UNIQUE (school_id, academic_year_id, number). Fully tenant-scoped.

See Section 5 for full analysis of usage.

### school_calendar table

Created at `backend/src/index.js` lines 231-243.

Columns: `id`, `school_id`, `date`, `name`, `type` (TEXT DEFAULT 'Holiday'), `notes`, `start_time` (TIME, nullable), `end_time` (TIME, nullable), `created_at`.

The `type` column distinguishes event kinds (e.g., 'Holiday', 'Closed Day', 'School Event'). Absence check logic uses `start_time IS NULL AND end_time IS NULL` to detect whole-day events vs. partial-day events. No `academic_year_id` -- entries apply globally to the school calendar.

### school_vacation_periods table

Created at `backend/src/index.js` lines 2077-2088.

Columns: `id`, `school_id`, `name`, `start_date`, `end_date`, `created_at`, `kind` (TEXT CHECK IN ('vacation', 'exam'), DEFAULT 'vacation').

The `kind` column was added via ALTER TABLE after initial creation. Not year-scoped -- applies globally. The `getVacationPeriod` helper in `absenceCheck.js` queries this table but ignores the `kind` column, treating both 'vacation' and 'exam' periods as full skip days.

**FINDING 1.1** | `backend/src/jobs/absenceCheck.js` lines 51-57 | WRONG-BUT-RECOVERABLE

`getVacationPeriod` returns any row regardless of `kind`. During an exam period, if a teacher skips a regular class, the absence is silently suppressed. Fix: filter by `kind = 'vacation'` only; let exam periods fall through to the regular lesson-overlap check.

### attendance table

Confirmed columns include `academic_year_id` (UUID) and `semester` (SMALLINT), plus `school_id`, `date`, `teacher_id`, `subject`, `class_names`, `periods`, `topic`, `week_number`, `location_id`, and others.

### absences table

Confirmed from CREATE TABLE at `backend/src/index.js` lines 454-471:

`id`, `school_id`, `teacher_id`, `date`, `subject`, `class_name`, `scheduled_period`, `status`, `is_auto_generated`, `reason`, `detected_at`, `periods_lost`, `created_at`, `updated_at`, `absence_group_id`.

**CONFIRMED: NO `academic_year_id` column. NO `semester` column.**

### timetable table

`academic_year_id` and `semester` added via ALTER TABLE at `backend/src/index.js` lines 1338-1339. A one-time backfill UPDATE at lines 1341-1355 stamped existing rows -- but that backfill uses bare `LIMIT 1` (no ORDER BY), the unfixed pattern described in Section 2.

### Other tables with academic_year_id or semester

Confirmed: `assessments`, `exam_scores`, `results_import`, `report_remarks`, `form_teacher_assignments`, `plc_attendance`, `meeting_attendance`, `primary_scores`, `primary_report_remarks`, `primary_class_teachers`, `primary_cashbooks`, `lms_courses`, `fee_schedules`, `student_bills`, `roll_calls`, `invigilation_check_ins`, `primary_terms`.

### absences queries and cross-year contamination

All queries on `absences` fall into two patterns:

**Pattern A -- Date range from query parameter** (`absences.js` lines 9-41, `admin.js` lines 176-200): callers supply explicit `from`/`to` dates. Scoping is as good as the dates supplied; no year-ID filtering possible because the column does not exist.

**Pattern B -- Date range derived from `attendance` records** (`admin.js` GET `/reports/teacher-summary` lines 592-640; `principal.js` line 272; `attendance.js` line 291):

```sql
WITH dr AS (
  SELECT MIN(date) AS min_date, MAX(date) AS max_date
  FROM attendance
  WHERE school_id = $1
    AND ($2::uuid IS NULL OR academic_year_id = $2::uuid)
    AND ($3::int  IS NULL OR semester = $3::int)
),
abs AS (
  SELECT ab.teacher_id, ...
  FROM absences ab, dr
  WHERE ab.school_id = $1
    AND ab.date >= dr.min_date AND ab.date <= dr.max_date
)
```

**FINDING 1.2** | `backend/src/routes/admin.js` lines 610-620; `backend/src/routes/principal.js` ~line 272; `backend/src/routes/attendance.js` ~line 291 | WRONG-BUT-RECOVERABLE

Because `absences` has no `academic_year_id`, teacher-summary reports scope absences using min/max attendance dates for a given year/semester. If two consecutive academic years share a calendar-month boundary, an absence record from Year A that falls within Year B's min/max date range appears in Year B's summary -- and vice versa. The same absence gets double-counted in overlapping year reports.

Fix: add `academic_year_id` and `semester` columns to `absences`; populate them from `academic_years.is_current` at insert time in both `runAbsenceCheck` and `runPerLessonCheck`; filter by those columns in all report queries.

**FINDING 1.3** | `backend/src/routes/absences.js` lines 61-104 | WRONG-BUT-RECOVERABLE

The `/teacher/:teacherId` endpoint (used by the teacher app to show which absences need remedials) uses a 30-day lookback window (`ab.date >= CURRENT_DATE - INTERVAL '30 days'`), not an academic year filter. Near a year boundary, a teacher sees absences from the previous year mixed with the current year.

Fix: once `absences` has `academic_year_id`, filter by the current year's ID.

---

## Section 2 -- Every Reader of is_current

**No shared helper function exists anywhere** in `backend/src/services/` or `backend/src/utils/` for resolving the current academic year. The SQL is copy-pasted across 30+ locations in 15+ files. The one local helper is in `roll-call.js` (`getCurrentYearSem`, lines 50-56), which correctly uses `ORDER BY name DESC LIMIT 1`.

### Files CORRECTLY using `ORDER BY name DESC LIMIT 1`

| File | Lines |
|---|---|
| `backend/src/jobs/absenceCheck.js` | 118-119, 243-244 |
| `backend/src/routes/academicYears.js` | 56 |
| `backend/src/routes/admin.js` | 585, 782 |
| `backend/src/routes/attendance.js` | 47, 261 |
| `backend/src/routes/form-teacher.js` | 28 |
| `backend/src/routes/exams.js` | 677 |
| `backend/src/routes/hod.js` | 89 |
| `backend/src/routes/meetings.js` | 306, 438, 517, 871 |
| `backend/src/routes/plc.js` | 243, 441 |
| `backend/src/routes/principal.js` | 42-43, 126-127, 218 |
| `backend/src/routes/remedial.js` | 281 |
| `backend/src/routes/resumption.js` | 93 |
| `backend/src/routes/roll-call.js` | 52 (via getCurrentYearSem helper) |
| `backend/src/routes/student-attendance.js` | 45 |
| `backend/src/routes/student.js` | 533 |
| `backend/src/routes/timetable.js` | 687 |

### Files STILL using bare `LIMIT 1` without `ORDER BY`

**FINDING 2.1** | `backend/src/routes/timetable.js` lines 59, 101, 102, 128, 129, 151, 472 | WRONG-BUT-RECOVERABLE

Seven occurrences across five endpoints: GET `/` (line 59), GET `/by-date` (lines 101-102), GET `/today/:teacherId` (lines 128-129), GET `/teacher/:teacherId` (line 151), POST `/class-subjects/seed` (line 472). The timetable is what the absence cron reads to decide which lessons to check -- a mismatch here means the cron (now correctly fixed) checks a different year than the timetable the teacher sees.

Fix: add `ORDER BY name DESC` before every `LIMIT 1` on this table in this file.

**FINDING 2.2** | `backend/src/routes/primary.js` lines 129, 666, 735, 1061, 1135 | WRONG-BUT-RECOVERABLE

Five occurrences: student listing, class-teacher resolution, class listing, attendance roll lookup, and score retrieval for primary schools. Same risk as Finding 2.1.

Fix: add `ORDER BY name DESC` before every `LIMIT 1` in these queries.

**FINDING 2.3** | `backend/src/routes/meetings.js` line 659 | WRONG-BUT-RECOVERABLE

The GET `/my-summary` endpoint resolves the current year with `WHERE school_id = $1 AND is_current = true LIMIT 1` (no ORDER BY). Every other occurrence in this file correctly uses `ORDER BY name DESC LIMIT 1`.

Fix: add `ORDER BY name DESC` to the query at line 658-661.

**FINDING 2.4** | `backend/src/index.js` lines 1346, 1351 | WRONG-BUT-RECOVERABLE

The one-time migration backfill that stamps `timetable` rows with `academic_year_id` and `semester` uses bare `LIMIT 1` subqueries. The backfill runs on every startup for rows where `academic_year_id IS NULL`. Any future row introduced with a null year_id would be stamped to an arbitrary year.

Fix: add `ORDER BY name DESC` to both subqueries.

**FINDING 2.5** | `backend/src/routes/exams.js` line 746; `backend/src/routes/student.js` line 59 | COSMETIC

Both use `is_current = TRUE` inside a JOIN clause instead of a subquery with LIMIT. The unique partial index now prevents more than one current year per school, so duplicate rows cannot occur. However, if no year is current, the JOIN silently supplies NULL `academic_year_id` to the invigilation check-in rather than returning an error.

Fix: replace the JOIN with an explicit subquery for clarity and consistent error handling.

**FINDING 2.6** | all files above | COSMETIC (but increases blast radius of any future fix)

The `SELECT id ... FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1` pattern appears in 30+ locations across 15 files with no shared utility. Every future fix must be applied individually.

Fix: extract a `getCurrentAcademicYear(schoolId)` helper in `backend/src/utils/` and replace all call sites.

---

## Section 3 -- Holiday/Vacation Guard Coverage

### absenceCheck.js function-by-function

**runAbsenceCheck** (daily 16:00 sweep, lines 61-204)
- Checks `school_calendar` for whole-day events (line 80, no `start_time` and no `end_time`), skips entirely.
- Calls `getVacationPeriod` (line 85), skips entirely if in vacation.
- Filters partial-day calendar events per lesson (lines 136-143).
- Guard: COMPLETE.

**runPerLessonCheck** (every 5 min, lines 208-290)
- Checks `school_calendar` (lines 219-225), skips entirely on whole-day events.
- Calls `getVacationPeriod` (line 226), skips entirely if in vacation.
- Filters partial-day calendar events per lesson (lines 255-263).
- Guard: COMPLETE. (This is the fix applied 2026-09-03.)

**runPlcAbsenceCheck** (called from daily sweep, lines 293-355)
- Checks `school_calendar` (lines 298-303) -- but any calendar entry, including partial-day events, skips the check.
- Calls `getVacationPeriod` (line 304).
- Guard: MOSTLY COMPLETE. See Finding 3.2.

**runMeetingAbsenceCheck** (called from daily sweep, lines 357-410)
- Checks `school_calendar` (lines 362-366).
- Does NOT call `getVacationPeriod`.
- Guard: INCOMPLETE. See Finding 3.1.

**runPrimaryAbsenceCheck** (called from daily sweep, lines 458-513)
- Checks `school_calendar` with `start_time IS NULL AND end_time IS NULL` (line 471).
- Calls `getVacationPeriod` (line 476).
- Guard: COMPLETE.

**FINDING 3.1** | `backend/src/jobs/absenceCheck.js` `runMeetingAbsenceCheck` function, after line 366 | WRONG-BUT-RECOVERABLE

`runMeetingAbsenceCheck` checks `school_calendar` but skips the `getVacationPeriod(schoolId, today)` call entirely. During a term break or vacation period, if a `meetings` row with `is_active = true` exists for that date, the function generates `meeting_absences` rows for every active teacher. This is the same class of bug as the pre-fix per-lesson gap that generated 656 false absence records.

Fix: add `if (await getVacationPeriod(schoolId, today)) return;` immediately after the `school_calendar` check at line 366, matching the pattern in every other absence-check function.

**FINDING 3.2** | `backend/src/jobs/absenceCheck.js` lines 299-303, 362-366 | COSMETIC

Both `runPlcAbsenceCheck` and `runMeetingAbsenceCheck` use `SELECT name FROM school_calendar WHERE school_id=$1 AND date=$2 LIMIT 1` -- any calendar entry causes the entire check to be skipped, including partial-day events. The other two functions distinguish whole-day events from partial-day ones. If a partial-day assembly is on the calendar and a PLC session or meeting happens later that day, those absences are incorrectly suppressed.

Fix: add `AND start_time IS NULL AND end_time IS NULL` to be consistent with `runAbsenceCheck` and `runPrimaryAbsenceCheck`.

### Other jobs and routes

`libraryNotifications.js` and `subscriptionExpiry.js`: no holiday guard is needed (deal with loans and billing, not school day presence).

No `cron.schedule` or `setInterval` calls found outside of the three known jobs.

`remedial.js` POST `/:id/mark-register` and `roll-call.js` POST: both are manual teacher-triggered actions, not auto-generation -- no holiday guard needed.

---

## Section 4 -- Year/Term Transition Flow

### Year switch endpoint

`PUT /api/academic-years/:id` in `backend/src/routes/academicYears.js` lines 91-119.

The flow is:
1. If `is_current === true`, run `UPDATE academic_years SET is_current = false WHERE school_id = $1 AND is_current = true`.
2. Run `UPDATE academic_years SET name = COALESCE($1, name), is_current = COALESCE($2, is_current), ... WHERE id = $6 AND school_id = $7 RETURNING ...`.

**FINDING 4.1** | `backend/src/routes/academicYears.js` lines 98-116 | DATA-CORRUPTING

The two-step year switch is executed as two separate `pool.query()` calls with **no transaction**. If the first succeeds (leaving zero current years) and the second fails for any reason (network blip, constraint violation, invalid values), the school is left with no current academic year. Every endpoint that expects a current year returns 404 or null results: timetable, attendance submission, absence auto-generation, the teacher app, the principal dashboard -- all effectively broken for all users until an admin manually re-sets a current year.

Fix: wrap both UPDATE queries in a `BEGIN`/`COMMIT` block using a `pool.connect()` client. The second UPDATE should also check that it affected exactly one row before committing.

**FINDING 4.2** | `backend/src/routes/academicYears.js` line 82 | COSMETIC

The error handler checks `err.constraint?.includes('current_year')` to detect a duplicate-current-year conflict. The constraint added by the IIFE is named `academic_years_one_current` (does not contain the substring 'current_year'), so this branch never fires for that constraint. Depending on which index the DB uses, the user sees "An academic year with that name already exists" instead of "Another year is already marked as current -- unset it first."

Fix: change the check to `err.constraint?.includes('current')` (matches both index names).

### What happens to dependent tables after year switch

No cascade or automatic update occurs for `attendance`, `timetable`, `assessments`, `exam_scores`, `form_teacher_assignments`, `result_submissions`, `fee_schedules`, `student_bills`, `house_room_assignments`, or `exeats`. All existing rows retain their `academic_year_id` pointing to the old year. New records receive the new year's ID. This is correct for historical data integrity.

The `absences` table has no `academic_year_id`, so no year boundary is recorded in it at all (see Finding 1.2).

### Semester transition

Updating `current_semester` is a single `UPDATE academic_years SET current_semester = ...` in the same PUT endpoint. This is atomic -- no risk of partial failure.

**FINDING 4.3** | `backend/src/routes/academicYears.js` lines 107-112 | COSMETIC

The COALESCE-based UPDATE allows sending `is_current = false` for the year that is currently the only current year, silently removing the school's active year. The unique index catches duplicate-current conflicts but not this case.

Fix: if the PATCH sets `is_current = false` for the year that is the only current year, reject with 400 ("Cannot unset the only current academic year -- set another as current first").

---

## Section 5 -- The Unused semesters Table

### Where it is read

| Operation | File | Lines |
|---|---|---|
| CREATE TABLE (DDL) | `backend/src/routes/academicYears.js` | 11-21 |
| CREATE TABLE (DDL) | `backend/src/index.js` | 2135-2146 |
| POST (insert) | `backend/src/routes/academicYears.js` | 149 |
| PUT (update) | `backend/src/routes/academicYears.js` | 178 |
| DELETE | `backend/src/routes/academicYears.js` | 199 |
| GET (list) | `backend/src/routes/academicYears.js` | 135-146 |
| UI CRUD panel | `admin-portal/app/(dashboard)/academic-years/page.tsx` | 221-370 |

### Is it read by any business logic?

**No.** A full search for `FROM semesters` and for the string `semesters` across `backend/src/` confirms that:
- No route queries `semesters` to determine start/end dates for the current semester.
- No route validates that an attendance or assessment record falls within the correct semester window.
- The active semester is entirely governed by `academic_years.current_semester` (an integer), not by this table.

### Conclusion

**The `semesters` table is a half-built feature.** The plumbing exists (table, CRUD API, admin UI panel), but no downstream code ever queries it. Data entered by admins is stored but never used. The intended purpose appears to be enabling "is today within this semester?" guards and semester-specific date validation. Until that logic is wired up, the table adds UI confusion without behavioral effect.

**FINDING 5.1** | `backend/src/routes/academicYears.js` lines 135-208; `admin-portal/app/(dashboard)/academic-years/page.tsx` lines 230-370 | COSMETIC

Admins can enter semester start/end dates but those dates are never consulted by the system. Absence generation, attendance submission, timetable filtering, and reporting all ignore this table entirely.

Fix option A: wire up `semesters.start_date`/`end_date` as the authoritative semester boundary, replacing the date-range-from-attendance pattern used in reports.
Fix option B: remove the table and UI panel to avoid false expectations.

---

## Section 6 -- Verification of Existing Fixes

### Fix 1 -- CREATE UNIQUE INDEX academic_years_one_current

**CONFIRMED PRESENT** at `backend/src/routes/academicYears.js` lines 24-27:

```js
await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_current
  ON academic_years (school_id) WHERE is_current = true
`);
```

**Root-cause addressed? Yes, but redundant.** The index prevents more than one `is_current = true` row per school at the DB level. However, `db/schema.sql` already had `idx_one_current_year` with identical semantics (lines 94-95). Two indexes enforcing the same constraint exist simultaneously. Both work; the redundancy wastes one index slot and maintenance overhead.

### Fix 2 -- ORDER BY name DESC applied to all is_current readers?

**INCOMPLETE.** The fix was applied to the absenceCheck job and most route files, but three files still use bare `LIMIT 1`:

| File | Lines not fixed | Endpoints affected |
|---|---|---|
| `backend/src/routes/timetable.js` | 59, 101, 102, 128, 129, 151, 472 | GET `/`, GET `/by-date`, GET `/today/:id`, GET `/teacher/:id`, POST `/class-subjects/seed` |
| `backend/src/routes/primary.js` | 129, 666, 735, 1061, 1135 | Student listing, class-teacher resolution, class list, attendance roll, score retrieval |
| `backend/src/routes/meetings.js` | 659 | GET `/my-summary` |

The `timetable.js` gap is particularly significant: the absence cron reads the timetable to decide which lessons to check, so a year mismatch in the timetable feed directly undermines the cron fix.

### Fix 3 -- Vacation period guard in runPerLessonCheck

**CONFIRMED PRESENT** at `backend/src/jobs/absenceCheck.js` line 226:

```js
if (await getVacationPeriod(schoolId, today)) return;
```

This is identical to the guard in `runAbsenceCheck` (line 85) and uses the same shared function (lines 50-57). Pattern is consistent between both cron functions.

**The guard is missing from `runMeetingAbsenceCheck`** (Finding 3.1) -- the same class of omission that caused the original 656 false absence records.

---

## Prioritized Fix List

### P0 -- DATA-CORRUPTING

**1. [Finding 4.1] Year-switch is not atomic**
File: `backend/src/routes/academicYears.js` lines 98-116
A failed `PUT` that sets `is_current = true` can leave the school with zero current years, breaking attendance, timetable, absence detection, and every dashboard for all users.
Fix: wrap both UPDATE queries in a single database transaction using `pool.connect()` + `BEGIN`/`COMMIT`.

---

### P1 -- WRONG-BUT-RECOVERABLE, high frequency

**2. [Findings 1.2, 1.3] absences table missing academic_year_id and semester**
Files: `backend/src/index.js` (CREATE TABLE lines 454-471), `backend/src/jobs/absenceCheck.js` (inserts), `backend/src/routes/admin.js`, `backend/src/routes/principal.js`, `backend/src/routes/attendance.js`, `backend/src/routes/absences.js`
Without these columns, cross-year contamination in all absence reports is structurally unavoidable. This is the highest-effort fix but has the widest correctness impact.
Fix: add `academic_year_id UUID` and `semester SMALLINT` to `absences` via ALTER TABLE; backfill from `attendance` date ranges; populate at insert time in both cron functions; filter by those columns in all report queries.

**3. [Finding 2.1] timetable.js -- 7 bare LIMIT 1 occurrences**
File: `backend/src/routes/timetable.js` lines 59, 101, 102, 128, 129, 151, 472
Timetable feeds the absence cron. A year mismatch here means the cron checks the wrong set of lessons.
Fix: add `ORDER BY name DESC` to each subquery.

**4. [Finding 3.1] runMeetingAbsenceCheck missing vacation guard**
File: `backend/src/jobs/absenceCheck.js` after line 366
Same bug class as the original per-lesson cron gap. Generates false meeting absences during vacations.
Fix: add `if (await getVacationPeriod(schoolId, today)) return;` after the school_calendar check.

**5. [Finding 2.2] primary.js -- 5 bare LIMIT 1 occurrences**
File: `backend/src/routes/primary.js` lines 129, 666, 735, 1061, 1135
Class-teacher resolution and score retrieval for primary schools may use wrong year.
Fix: add `ORDER BY name DESC` to each subquery.

**6. [Finding 2.3] meetings.js line 659 -- bare LIMIT 1**
File: `backend/src/routes/meetings.js` line 659
Teacher meeting summary may show wrong year data.
Fix: add `ORDER BY name DESC`.

---

### P2 -- WRONG-BUT-RECOVERABLE, lower frequency

**7. [Finding 1.1] getVacationPeriod ignores kind column**
File: `backend/src/jobs/absenceCheck.js` lines 51-57
Exam periods suppress all lesson absences.
Fix: filter by `kind = 'vacation'` only in the WHERE clause.

**8. [Finding 3.2] PLC and meeting calendar checks include partial-day events**
File: `backend/src/jobs/absenceCheck.js` lines 299-303, 362-366
An afternoon PLC session is skipped because a morning assembly is on the calendar.
Fix: add `AND start_time IS NULL AND end_time IS NULL` to match the other functions.

**9. [Finding 2.4] Timetable migration backfill -- bare LIMIT 1**
File: `backend/src/index.js` lines 1346, 1351
Runs on every startup for rows where `academic_year_id IS NULL`. Any new null-year row would be stamped to an arbitrary year.
Fix: add `ORDER BY name DESC` to both subqueries.

---

### P3 -- COSMETIC

**10. [Finding 4.2] Wrong error message for duplicate-current-year conflict**
File: `backend/src/routes/academicYears.js` line 82
`err.constraint?.includes('current_year')` fails for constraint named `academic_years_one_current`.
Fix: change to `err.constraint?.includes('current')`.

**11. [Finding 5.1] semesters table and UI panel are dead weight**
Files: `backend/src/routes/academicYears.js` lines 135-208; `admin-portal/app/(dashboard)/academic-years/page.tsx` lines 230-370
Admins enter data the system ignores.
Fix: wire up semester date boundaries in business logic or remove the table and panel.

**12. [Findings 2.5, 2.6] JOIN-based is_current reads; no shared getCurrentAcademicYear helper**
Files: `backend/src/routes/exams.js` line 746; `backend/src/routes/student.js` line 59; all 15+ route files
No shared utility means every future fix must touch 30+ locations individually.
Fix: extract `getCurrentAcademicYear(schoolId)` into `backend/src/utils/academicYear.js` and replace all inline copies.

**13. Two redundant partial unique indexes on academic_years**
Files: `db/schema.sql` line 94; `backend/src/routes/academicYears.js` line 25
`idx_one_current_year` and `academic_years_one_current` are identical. Wastes one index slot.
Fix: drop the IIFE-created one (`academic_years_one_current`) since the schema already defines `idx_one_current_year`.
