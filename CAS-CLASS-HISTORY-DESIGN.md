# Class History — Design Specification

**Module:** CAS Backend — Results, Assessments, Promotion
**Version:** 0.1 (Draft — For Review)
**Date:** 2026-09-24

---

## Abstract

`students.class_name` is a single mutable field with no history. At least seven query implementations across the backend independently reconstruct "who was in class X" by re-reading this field at query time and joining it against assessment/exam records that correctly retain their *historical* class name at creation time. The moment a student is promoted, that join breaks — with two distinct symptoms depending on which duplicate is asked: results become invisible (confirmed against a real student, KYEBAMBO CYNTHIA), or completion percentages become inflated (confirmed against real class `2A` data: 15 current students vs 42 historically-scored students).

This document proposes a `class_history` log table, a one-time backfill from existing assessment/exam evidence (with explicit honesty about its limits), and a single shared `getClassRoster()` function to replace every duplicated implementation.

---

## 1. Research findings (confirming prior investigation)

### 1.1 `reports.js` (7 occurrences) — confirmed, partially affected

- **Affected (3 of 7):** `buildTeacherCompletionRows()` (lines ~369–460, backing the `teacher_completion` report type). This is a near byte-identical copy of `assessment-monitoring.js`'s bug: `total_students` comes from `COUNT(*) FROM students WHERE class_name = e.class_name` (current roster), while `students_scored` comes from `assessment_scores`/`exam_scores` joined through the *assessment's own* historical `class_name`. Same inflated-completion symptom, independently implemented a third time.
- **Not affected (4 of 7):** `grade_distribution`, `class_performance`, and `subject_pass_rate` report types query `exam_scores` directly, grouping/filtering by `exam_scores.class_name` (the score row's own historical value) — they never re-derive the class from `students.class_name`. These are already correct.

### 1.2 `hod.js` (4 occurrences) — confirmed, partially affected

- **Affected (1 of 4):** `GET /api/hod/results` (line ~372) — a sixth independent "assemble class results" implementation, identical in shape to `assembleResults`/`computeStudentResult`/`student.js`/`principal.js`. Roster from current `students.class_name`, joined against historically-tagged `assessments`/`exam_scores`. Same invisible-results symptom.
- **Not affected (3 of 4):** `/overview`'s class/student counts and `/classes`' listings query `students.class_name` for a pure "who is here right now" administrative view (contacting the current form teacher, current headcount) — no join against historical assessment data. This is the correct use of a mutable "current class" field and needs no change.

### 1.3 Existing history/audit mechanisms — none usable

Checked `promotion.service.js` (`promoteClass`, used by both `/api/students/promote` and `class-levels.js`'s bulk level-promotion), `students.js`'s `PUT /:id`, and the bulk spreadsheet-import endpoint (`students.js`, ~line 380–478, which also has a `class_name` column and can silently move students between classes). **None of them write to `school_audit_logs`, `audit_logs`, or any other table.** `students.updated_at` is the only timestamp touched, and it is shared with every other field on the row — it cannot be attributed to a class change specifically, and isn't written to for the bulk-import path in a way that's distinguishable from any other edit.

**Conclusion:** there is no existing data source that can tell us *when* a specific past promotion happened, or *why*. The only usable historical signal is what's already being relied on informally: the `class_name` + `academic_year_id` + `semester` recorded directly on `assessments`, `exam_scores`, and `results_import` rows at the time they were created.

### 1.4 Three write paths need instrumentation, not one

- `promotion.service.js` → `promoteClass()` — the single shared function behind both promotion entry points. Instrumenting here alone covers both.
- `students.js` → `PUT /api/students/:id` — general profile edit; `class_name` is one of many `COALESCE`d fields and can change silently.
- `students.js` → bulk spreadsheet "update students" import — per-row `add('class_name', ...)`; some schools may use this as their actual promotion mechanism instead of the dedicated button.

---

## 2. Schema — `class_history`

```sql
CREATE TABLE class_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class       TEXT,                          -- NULL for a student's first-ever class assignment
  to_class         TEXT        NOT NULL,
  academic_year_id UUID        REFERENCES academic_years(id) ON DELETE SET NULL,
  semester         SMALLINT,                       -- 1 or 2; NULL if unknown (see backfill notes)
  reason           TEXT,                           -- free text, optional
  source           TEXT        NOT NULL CHECK (source IN ('promotion', 'manual_edit', 'bulk_import', 'backfill')),
  changed_by       UUID        REFERENCES teachers(id) ON DELETE SET NULL,  -- NULL for backfill/system
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_history_student ON class_history(student_id, changed_at);
CREATE INDEX idx_class_history_school_class ON class_history(school_id, to_class);
```

**Semantics of `academic_year_id`/`semester` on a row:** *"as of the end of this period, this student transitioned from `from_class` to `to_class`."* This is deliberately the same signal used for the backfill (Section 3) — the last period for which we have direct evidence the student was in `from_class` — so live-logged and backfilled rows are structurally consistent and the resolution logic (Section 4) doesn't need to special-case either kind.

`source` exists specifically so backfilled rows are permanently distinguishable from real-time-logged ones — this matters for anyone auditing the data later and for support conversations ("we're not 100% sure this promotion happened exactly then, it was reconstructed").

### Write paths

All three call sites insert one row per changed student, only when `to_class` actually differs from the prior value (a same-value write, e.g. re-saving a form with the class unchanged, must not create a no-op history row):

1. **`promotion.service.js` → `promoteClass()`** — insert one row per promoted student, `source = 'promotion'`, `from_class`/`to_class` from the function's own parameters, `academic_year_id`/`semester` = the school's current period at the time of the call, `changed_by` = the acting admin's id (needs to be threaded through as a new parameter — currently `promoteClass` doesn't receive the caller's identity).
2. **`students.js` → `PUT /:id`** — before the `UPDATE`, read the student's existing `class_name`; if the incoming value differs, insert one row after the update succeeds, `source = 'manual_edit'`, `changed_by = req.user.id`.
3. **Bulk import** (`students.js`) — same pattern per row inside the existing loop, `source = 'bulk_import'`.

To avoid writing the same INSERT three times, add one small shared helper (e.g. `backend/src/services/classHistory.service.js` exporting `recordClassChange(db, { schoolId, studentId, fromClass, toClass, academicYearId, semester, reason, source, changedBy })`) that all three call sites use. This mirrors the project's own established pattern (`letterApproval.service.js`) rather than inventing a new one.

---

## 3. Retroactive backfill

There is no way to recover exact timestamps or reasons for promotions that already happened — Section 1.3 confirmed no log exists anywhere. The backfill is explicitly an approximation built from the best available indirect evidence, and should be labeled as such (`source = 'backfill'`) rather than presented as equivalent to a real-time log.

### Approach

For every student whose current `class_name` does **not** match the class implied by their own historical assessment/exam/results_import records, construct one `class_history` row per distinct prior class detected:

```sql
-- For each student, find every class_name that appears on their historical
-- records but does not match their current class_name, with the latest
-- (academic_year_id, semester) that class_name was seen under.
SELECT DISTINCT ON (student_id, class_name)
  student_id, class_name, academic_year_id, semester
FROM (
  SELECT sc.student_id, a.class_name, a.academic_year_id, a.semester
  FROM assessment_scores sc JOIN assessments a ON a.id = sc.assessment_id
  UNION ALL
  SELECT student_id, class_name, academic_year_id, semester FROM exam_scores
  UNION ALL
  SELECT ri.student_id, s.class_name, ri.academic_year_id, ri.semester
    -- results_import has no class_name of its own; it's implicitly the
    -- student's class at import time, which is unrecoverable — excluded
    -- from the backfill signal entirely rather than guessed at.
) evidence
JOIN students s ON s.id = evidence.student_id
WHERE LOWER(evidence.class_name) <> LOWER(s.class_name)
ORDER BY student_id, class_name, /* latest period first */ ...
```

For each student, this produces the set of historical classes their scores are tagged with. Order them by period and insert one `class_history` row per consecutive pair (`from_class` = older class, `to_class` = newer class or the student's current class for the final transition), `source = 'backfill'`, `changed_by = NULL`, `reason = NULL`.

### Honest limitations (must be signed off on before running)

- **No exact timestamp.** `changed_at` will be set to whenever the backfill script runs, not when the real promotion happened. Anything that orders by `changed_at` instead of `(academic_year_id, semester)` will get the wrong answer for backfilled rows — this is exactly why the resolution logic (Section 4) must key off the period fields, not the timestamp.
- **No reason.** These are inferred transitions; nothing says *why* a student's class changed (could be promotion, a manual correction, a data-entry fix that happened to look like a class change, or the student genuinely repeating).
- **`results_import` is excluded from the evidence.** It has no `class_name` of its own, so a student whose *only* historical data is imported results (no live `assessment_scores`/`exam_scores`) cannot be backfilled with any confidence, and is deliberately left with no history — they fall through to the current-class fallback (Section 4), which is honest: we simply don't know, so we don't guess.
- **A student who was promoted more than once with no scores recorded in an intermediate class** will show a single inferred transition spanning multiple real ones — the intermediate class is invisible to us because no evidence was ever created for it. Rare in practice at the semester granularity this system operates at, but not impossible.
- **Multi-teacher class-name inconsistency.** If two assessments in the same real period recorded slightly different `class_name` spellings for the same class (e.g. "2A" vs "2 A"), the backfill would see two distinct "classes" where there's actually one. The existing `LOWER()`-normalization used everywhere else should be applied here too, but it won't catch every real-world spelling drift.

Given Section 1.3 confirmed no better data exists anywhere in the system, this is accepted as the best available reconstruction — not because it's fully accurate, but because the alternative (no backfill at all) leaves every already-promoted student's historical results permanently invisible, which is strictly worse.

---

## 4. Shared resolution function

```js
// getClassRoster(schoolId, className, academicYearId, semester)
// Returns student_ids enrolled in className during that specific period.
```

### Algorithm

1. **Candidate pool:** every student currently in `className` (`students.class_name = className AND status = 'Active'`), unioned with every student who has *any* `class_history` row where `from_class` or `to_class` equals `className` (case-insensitively) — this catches students who've since moved on from `className` but were in it during the target period, and students newly in `className` whose history shows they came from elsewhere.
2. **Per-candidate resolution:** for each candidate, fetch their `class_history` rows ordered chronologically by period (`academic_year_id` ordinal via `academic_years.start_date`/`semesters.start_date`, then `semester`). Walk the ordered list to find the row whose period *straddles* the target period:
   - If a row's period is ≤ target period and no later row exists, the resolved class is that row's `to_class`.
   - If a row's period is > target period, the resolved class is that row's `from_class` (they hadn't transitioned yet, as of the target period).
   - If the student has **no `class_history` rows at all**, the resolved class is simply their current `students.class_name`.
3. Include the student in the result if their resolved class equals `className`.

**This third case is the key design point for item 4 (the tracker's denominator problem):** a student who has never had a class change resolves to their current class for *any* period, past or present — identical to today's behavior. The history table only ever overrides the answer for students it actually has evidence about. A brand-new term with zero promotions yet produces byte-identical output to the current buggy queries (correctly so — there's nothing to fix until a promotion happens), and a class with no scores yet still gets a correct, non-zero roster from `getClassRoster()` because roster resolution never depends on whether `assessment_scores`/`exam_scores` rows exist. This is what directly fixes the assessment tracker: `assessment-monitoring.js`'s `total_students` subquery is replaced with a call to `getClassRoster()`, decoupling the denominator from both current-class re-derivation and from whether scoring has started.

### Call sites to migrate (all of them, not just the ones already found)

| File | Function/endpoint | Symptom before fix |
|---|---|---|
| `results.js` | `assembleResults()` | Invisible results |
| `results-service.js` | `computeStudentResult()` | Invisible results |
| `student.js` | `GET /results` | Invisible results (student's own portal) |
| `principal.js` | inline class-results block (~line 1150) | Invisible results |
| `hod.js` | `GET /api/hod/results` | Invisible results |
| `assessments.js` | per-assessment score-entry roster lookups | Wrong/empty roster when editing an old assessment |
| `assessment-monitoring.js` | main tracker query | Inflated completion % |
| `reports.js` | `buildTeacherCompletionRows()` | Inflated completion % |

Every one of these currently does `SELECT ... FROM students WHERE class_name = $X AND status = 'Active'` as its roster step. That line becomes a call to `getClassRoster()`; nothing else about each file's downstream computation needs to change.

---

## 5. Phased build order

1. **Schema + backfill first, verified in isolation.** Create `class_history`, write the shared `recordClassChange()` helper and wire it into the three live write paths (Section 2), run the backfill script (Section 3) against production, then verify directly against **KYEBAMBO CYNTHIA's real case**: confirm a `class_history` row exists showing `2A → 3A`, and confirm `getClassRoster(schoolId, '2A', thatAcademicYearId, 1)` includes her while `getClassRoster(schoolId, '3A', thatAcademicYearId, 1)` does not (and vice versa for a semester after her promotion). No call site is touched yet at this stage — this step is purely additive and carries no regression risk.
2. **Build and unit-test `getClassRoster()` against a handful of real cases** — Kyebambo Cynthia (promoted student with history), an ordinary student with no history at all (must match current behavior exactly), and a student who appears in the backfill with an inferred multi-hop transition.
3. **Migrate call sites one at a time**, starting with the two highest-value/lowest-risk targets: `assessment-monitoring.js` (fixes the tracker) and `results.js`'s `assembleResults()` (fixes the main results view, the most visible symptom). Verify each migration against Kyebambo Cynthia's case and a normal unaffected class before moving to the next file.
4. **Migrate the remaining five call sites** (`results-service.js`, `student.js`, `principal.js`, `hod.js`, `assessments.js`, `reports.js`'s `buildTeacherCompletionRows()`), each verified independently.
5. **Retire the duplicated roster queries** once every call site is confirmed migrated — this is also the point to consider whether `results-service.js`, `results.js`, and `hod.js`'s near-identical per-subject/per-student computation logic (not just the roster step) should itself be consolidated, though that's a separate, larger refactor outside this design's scope.

---

## 6. Open questions for supervisor review

1. **`changed_by` on promotion:** `promoteClass()` currently doesn't receive the acting admin's identity — should it be threaded through from `req.user.id` at both call sites (`/api/students/promote` and `class-levels.js`), or is `NULL` (with `source='promotion'` implying "an admin did this") acceptable?
2. **Reason capture:** should the promotion UI be extended to let the admin type an optional reason at promotion time (e.g. "held back," "double promotion"), or is `reason` left NULL for all live promotions until a specific need arises?
3. **Backfill scope:** should the backfill run for *all* schools in the system, or only for schools where a mismatch is actually detected (the query in Section 3 naturally does this), and should it be reviewable/dry-run first (output the proposed rows for inspection) before committing them?
4. **Period ordering data quality:** the resolution algorithm depends on `academic_years.start_date`/`semesters.start_date` being populated. Should we audit how many schools have these fields NULL before relying on them, and decide a fallback ordering (e.g. `academic_years.created_at`) now rather than discovering gaps during migration?
5. **`results_import` blind spot:** are we comfortable that students whose only historical data is imported results get no backfilled history (Section 3) and therefore always resolve via current-class fallback — i.e., their results could still be invisible post-promotion if they were promoted after an import and have no live assessment/exam scores to anchor a history entry? If this population is non-trivial, a secondary, weaker backfill signal (e.g. `results_import.academic_year_id`/`semester` plus whatever the student's class was believed to be at the time, if recoverable from anywhere) may be worth scoping separately.
6. **Consolidation beyond the roster step:** Section 5 flags that `results.js`, `results-service.js`, and `hod.js` don't just share the broken roster query — they share nearly the entire per-subject computation algorithm, hand-copied three times. Worth a follow-up design once this fix lands, or explicitly out of scope for now?
