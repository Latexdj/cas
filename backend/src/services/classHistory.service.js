'use strict';
const pool = require('../config/db');
const { getElectiveEnrollmentFilter } = require('./electives.service');

// Records one class_name transition. Called from every write path that can
// change students.class_name (promotion, manual edit, bulk import) — see
// CAS-CLASS-HISTORY-DESIGN.md Section 2. Callers must only invoke this when
// toClass actually differs from the student's prior class_name; this
// function does not check that itself, since callers already have (or can
// cheaply get) the old value from their own UPDATE.
//
// academicYearId/semester represent "as of the end of this period, this
// student transitioned from fromClass to toClass" — the same signal used by
// the backfill script, so live-logged and backfilled rows stay consistent.
async function recordClassChange(db, { schoolId, studentId, fromClass, toClass, academicYearId, semester, reason, source, changedBy }) {
  const conn = db || pool;
  await conn.query(
    `INSERT INTO class_history
       (school_id, student_id, from_class, to_class, academic_year_id, semester, reason, source, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [schoolId, studentId, fromClass || null, toClass, academicYearId || null, semester || null, reason || null, source, changedBy || null]
  );
}

// mapWithLimit(items, limit, fn): like Promise.all(items.map(fn)) but caps
// concurrency. Callers that resolve a roster per distinct class (assessment
// tracker, reports, exam-scores admin views) can have dozens of distinct
// (class, year, semester) combos in one request; an unbounded Promise.all
// fan-out — each getClassRoster() call opening its own query — can exceed a
// pooled connection limit well before it exceeds anything CPU-bound. Two
// distinct limits were hit in practice: Supabase's session-mode pooler
// rejecting outright past 15 concurrent clients, and this app's own local
// pg Pool (config/db.js, max: 10) queuing checkouts past its cap until they
// time out under concurrent requests. Callers should keep `limit` low (2-3)
// relative to that pool size — it bounds one call's own fan-out, not how
// many *other* requests are running against the same shared pool at once.
async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getPeriodOrdinalMs(academicYearId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(start_date, created_at) AS ordinal_date FROM academic_years WHERE id = $1`,
    [academicYearId]
  );
  return rows[0] ? new Date(rows[0].ordinal_date).getTime() : 0;
}

// The exclusive cutoff for "could this student plausibly have existed during
// targetYear": the start of the chronologically NEXT academic year at this
// school, if one exists. Comparing a no-history candidate's created_at
// against the target year's own start (rather than the next year's) is too
// strict — real admissions trickle in for days/weeks after a year's nominal
// start_date, and would be wrongly excluded even from their own, current
// year's roster. If targetYear is the school's latest/ongoing year, there's
// no cutoff: any created_at up to now is valid.
async function getNextYearOrdinalMs(schoolId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(next.start_date, next.created_at) AS ordinal_date
     FROM academic_years next, academic_years target
     WHERE target.id = $2
       AND next.school_id = $1
       AND COALESCE(next.start_date, next.created_at) > COALESCE(target.start_date, target.created_at)
     ORDER BY ordinal_date ASC
     LIMIT 1`,
    [schoolId, academicYearId]
  );
  return rows[0] ? new Date(rows[0].ordinal_date).getTime() : null;
}

// getStudentEnrollmentYears(schoolId, studentId)
// Returns the academic_years rows this student could plausibly have data in —
// for scoping a student-facing "Academic Year" filter down to years they
// actually attended, instead of every year the school has ever run. A year
// qualifies if EITHER:
//  (a) the student was already created by the start of the chronologically
//      NEXT year — the same existence test getClassRoster's no-history
//      fallback uses (see getNextYearOrdinalMs above) — and the year has
//      itself started (so an as-yet-unreached future year, which by
//      definition has no "next year" cutoff, isn't wrongly included forever);
//  (b) the student has an actual row in that year regardless of the above —
//      created_at is only an approximation (a bulk import can post-date a
//      student's real enrollment; see the same caveat on resolveClassFromHistory
//      above), so a year with real recorded data must never be hidden just
//      because the date heuristic alone would have excluded it.
//
// Confirmed as a real gap: a currently-enrolled (Active, Form 1 -> Form 3)
// student's class_history is only backfilled as far back as their most
// recent promotion, so for an even-older year the date heuristic in (a) can
// fail too (a bulk migration's created_at postdates that old year's own
// "next year" cutoff) with nothing in (b) to catch it either, if the only
// evidence for that year is imported historical results — results_import
// wasn't in the (b) list at all. A student could see 2025/2026 (their most
// recent class_history transition lands there) but never 2024/2025, despite
// real imported results existing for it. assessment_scores closes the same
// kind of gap for live-entered CA scores, which weren't covered by
// exam_scores alone.
async function getStudentEnrollmentYears(schoolId, studentId) {
  const { rows } = await pool.query(
    `SELECT ay.id, ay.name, ay.is_current, ay.current_semester
     FROM academic_years ay
     JOIN students s ON s.id = $2 AND s.school_id = $1
     WHERE ay.school_id = $1
       AND (
         (
           COALESCE(ay.start_date, ay.created_at) <= now()
           AND s.created_at < COALESCE(
             (SELECT COALESCE(next.start_date, next.created_at)
              FROM academic_years next
              WHERE next.school_id = $1
                AND COALESCE(next.start_date, next.created_at) > COALESCE(ay.start_date, ay.created_at)
              ORDER BY COALESCE(next.start_date, next.created_at) ASC
              LIMIT 1),
             'infinity'::timestamptz
           )
         )
         OR EXISTS (SELECT 1 FROM exam_scores es WHERE es.student_id = s.id AND es.academic_year_id = ay.id)
         OR EXISTS (SELECT 1 FROM results_import ri WHERE ri.student_id = s.id AND ri.academic_year_id = ay.id)
         OR EXISTS (
           SELECT 1 FROM assessment_scores asc1
           JOIN assessments a ON a.id = asc1.assessment_id
           WHERE asc1.student_id = s.id AND a.academic_year_id = ay.id
         )
         OR EXISTS (SELECT 1 FROM student_bills sb WHERE sb.student_id = s.id AND sb.academic_year_id = ay.id)
         OR EXISTS (SELECT 1 FROM class_history ch WHERE ch.student_id = s.id AND ch.academic_year_id = ay.id)
         OR EXISTS (
           SELECT 1 FROM student_attendance_records r
           JOIN student_attendance_sessions ses ON ses.id = r.session_id
           WHERE r.student_id = s.id AND ses.academic_year_id = ay.id
         )
       )
     ORDER BY ay.name DESC`,
    [schoolId, studentId]
  );
  return rows;
}

const comparePeriod = (a, b) => a[0] - b[0] || a[1] - b[1];

// Which of these students have real, recorded evidence of existing during
// academicYearId — an exam score, a CA score, or an imported result row. The
// one legitimate exception to trusting created_at (see resolveClassFromHistory's
// doc comment on notYetExisted): a bulk migration can post-date a student's
// created_at well past their real enrollment, but it can't fake evidence
// rows for a year they were never in. Used as the escape hatch for
// includeInactive callers only — see getClassRoster/resolveStudentClassAtPeriod.
async function studentsWithEvidence(schoolId, studentIds, academicYearId) {
  if (!studentIds.length) return new Set();
  const { rows } = await pool.query(
    `SELECT DISTINCT student_id FROM (
       SELECT student_id FROM exam_scores
       WHERE school_id = $1 AND academic_year_id = $2 AND student_id = ANY($3::uuid[])
       UNION ALL
       SELECT asc1.student_id FROM assessment_scores asc1
       JOIN assessments a ON a.id = asc1.assessment_id
       WHERE a.school_id = $1 AND a.academic_year_id = $2 AND asc1.student_id = ANY($3::uuid[])
       UNION ALL
       SELECT student_id FROM results_import
       WHERE school_id = $1 AND academic_year_id = $2 AND student_id = ANY($3::uuid[])
     ) evidence`,
    [schoolId, academicYearId, studentIds]
  );
  return new Set(rows.map(r => r.student_id));
}

// Walks one student's chronologically-ordered class_history rows to find
// their class as of targetPeriod — the shared core of both getClassRoster()
// (many candidates, one target class) and resolveStudentClassAtPeriod() (one
// student, any class). See CAS-CLASS-HISTORY-DESIGN.md Section 4.
//
// The boundary (row.period == targetPeriod exactly) is source-dependent, not
// a single fixed rule, because 'promotion'/'manual_edit'/'bulk_import' rows
// and 'backfill' rows anchor their period to opposite ends of the
// transition: a live row's period is the *new* period as of the change
// (getCurrentYearSem at the moment of the call — often a fresh term with no
// scores yet, which must resolve to the new class immediately), while a
// backfill row's period is the *last period with direct evidence in the old
// class* (Section 3 — there's no real "transition moment" to anchor to, so
// it's approximated from the newest surviving proof of the old class).
// Treating both as inclusive would make a backfilled student's own
// evidence-bearing period resolve to their *new* class, hiding the very
// scores that period's evidence came from — confirmed against Kyebambo
// Cynthia, who has real assessment/exam data in 2A for the exact period her
// backfilled row anchors to.
// createdAtMs/existenceCutoffMs guard the no-history fallback: a student
// with no class_history hasn't necessarily "always" been in their current
// class — they may simply not have existed yet during targetYear (a fresh
// admission for a new academic year, added to the system days before this
// call). Confirmed via a real regression: every class in the school showed
// inflated historical rosters and correspondingly wrong completion
// percentages, because this year's brand-new intake — no class_history,
// current class_name matching whatever label they were assigned — was being
// silently counted as part of EVERY past year's roster for that same class
// name. existenceCutoffMs is the start of the chronologically NEXT academic
// year (see getNextYearOrdinalMs) — not targetPeriod's own start, which
// would wrongly exclude a student admitted days after their own year's
// nominal start_date. created_at is the only universally-populated proxy
// for "existed in the system by this point"; it's an approximation (a bulk
// data migration could set it later than a student's real enrollment), but
// a large, systematic error is worse than this smaller one.
//
// This guard is now ALWAYS applied — there is no caller-supplied escape
// hatch to disable it. There used to be one (a `trustCreatedAt` flag that
// results.js/student.js/results-service.js passed false for, to assemble
// historical results VIEWS rather than live trackers), because applying
// this guard at face value once broke a real school's entire pre-migration
// history: an imported 2024/2025 dataset became unreachable for ~500
// students, active and graduated alike, because their student records were
// all created in a single May 2026 migration, well after the 2025/2026
// cutoff this check compares against. But blanket-disabling the guard for
// every includeInactive caller reintroduced the ORIGINAL bug it was added to
// fix, just scoped to results-viewing endpoints instead of live trackers: a
// since-reused class label (next year's brand-new Form 1 intake landing in
// the same "1A"/"1B"/etc. names as last year's cohort) meant those brand-new
// students — created well after last year ended, no class_history yet —
// got silently counted into LAST year's roster for that class, showing up
// to teachers as "students with no results entered" who were never actually
// theirs. Confirmed live: St. Augustine's 2025/2026 Sem 2 roster for class
// "1A" included 18 of this year's new intake this way, "1B" included 41.
//
// The actual fix for the migration incident is evidence, not a blanket
// disable: getClassRoster()/resolveStudentClassAtPeriod() call
// studentsWithEvidence() to re-include a student this guard excludes, but
// ONLY if they have a real exam score, CA score, or imported result row for
// that specific academic year — something a bulk migration's bad
// created_at can't fake, and something this year's brand-new intake never
// has for a year that predates their existence. A 'backfill' class_history
// row is exempted from this guard entirely, regardless — it exists
// precisely to encode reconstructed historical truth independent of when it
// was entered, so it must never be second-guessed by this heuristic.
function resolveClassFromHistory(historyRows, currentClassName, targetPeriod, createdAtMs, existenceCutoffMs) {
  // A student who didn't exist yet as of targetPeriod cannot have been in
  // any class during it, full stop — confirmed via a real regression: a
  // newly admitted student (created well into the new academic year) who
  // then got one manual class correction shortly after admission still has
  // their very first post-admission class_name recorded as that history
  // row's fromClass, which an unguarded walk treats as valid for any period
  // strictly before that row — including periods before the student
  // existed. St. Augustine's 2025/2026 Sem 2 roster for 1D/1E/1B was
  // showing dozens of 2026/2027 Form 1 intake who'd simply had their
  // initial class corrected once, weeks after being created.
  const notYetExisted = () =>
    createdAtMs != null && existenceCutoffMs != null && createdAtMs >= existenceCutoffMs;

  // Returns { className, confirmed }. confirmed is false only for the one
  // case this function cannot actually know the answer to: targetPeriod
  // precedes the EARLIEST class_history row we have for this student, so
  // row.fromClass is pure extrapolation from the nearest evidence we DO
  // have, not a real record of that earlier period. Reported as a real
  // incident: printing a Form-3 student's Form-1 (2024/2025) results showed
  // their Form-2 (2025/2026) class "2A" instead — class_history only goes
  // back to their 2A->3A promotion (the earliest live evidence found by the
  // backfill script, which can't use results_import as evidence since that
  // table has no class_name column at all), so there was nothing earlier to
  // walk to. Every other branch (a row within/after the known history, or
  // the very last toClass for a current-ish period) reflects a real
  // recorded transition and stays confirmed.
  if (!historyRows || historyRows.length === 0) {
    return { className: notYetExisted() ? null : currentClassName, confirmed: true };
  }
  for (let i = 0; i < historyRows.length; i++) {
    const row = historyRows[i];
    const cmp = comparePeriod(row.period, targetPeriod);
    const alreadyTransitioned = row.source === 'backfill' ? cmp < 0 : cmp <= 0;
    if (!alreadyTransitioned) {
      if (row.source !== 'backfill' && notYetExisted()) return { className: null, confirmed: true };
      // A backfill row's own anchor period (cmp === 0, exact match) IS the
      // real evidence point itself — "the last period with direct evidence
      // in the old class" (see the big comment above) — so resolving
      // exactly there is confirmed even as the first/only row. Anything
      // strictly before that anchor (cmp > 0) is extrapolation beyond it.
      const confirmed = i > 0 || (row.source === 'backfill' && cmp === 0);
      return { className: row.fromClass, confirmed };
    }
  }
  // Every row is already-transitioned as of targetPeriod — resolve to the
  // most recent known class (historyRows is chronologically sorted by both
  // callers), the same answer the no-history branch gives for a current
  // period.
  return { className: historyRows[historyRows.length - 1].toClass, confirmed: true };
}

// getClassRoster(schoolId, className, academicYearId, semester, options)
// Returns the array of student_ids enrolled in className during that
// specific (academicYearId, semester) period — resolving each candidate's
// class at that period via class_history rather than trusting their current
// students.class_name, which only reflects who is in the class *right now*.
// See CAS-CLASS-HISTORY-DESIGN.md Section 4 for the algorithm.
//
// options.includeInactive (default false): whether to include students whose
// CURRENT status isn't 'Active' (graduated/withdrawn/inactive). The default
// excludes them — right for live, ongoing-work views (the assessment
// tracker, result-submissions readiness) where nobody is ever going to enter
// a graduated student's scores. It's wrong for anything reviewing *past*
// results: a since-graduated cohort's own final-year results become
// unreachable otherwise, even though the data is sitting right there in
// results_import — confirmed as a real incident where 228 of 519 students
// behind an imported 2024/2025 dataset had since graduated (another 32 gone
// inactive), making every one of them invisible to the results-viewing
// endpoints in results.js despite the import itself having succeeded.
async function getClassRoster(schoolId, className, academicYearId, semester, options = {}) {
  const targetSemester = parseInt(semester);
  const { includeInactive = false, subject = null } = options;

  // Candidate pool: everyone currently in this class, plus anyone whose
  // class_history ever mentions this class (as either endpoint of a
  // transition) — this catches students who've since moved on, and
  // students newly in the class who came from elsewhere.
  const { rows: candidateRows } = await pool.query(
    `SELECT DISTINCT s.id, s.class_name, s.created_at
     FROM students s
     WHERE s.school_id = $1 ${includeInactive ? '' : "AND s.status = 'Active'"}
       AND (
         LOWER(s.class_name) = LOWER($2)
         OR EXISTS (
           SELECT 1 FROM class_history ch
           WHERE ch.student_id = s.id AND ch.school_id = $1
             AND (LOWER(ch.from_class) = LOWER($2) OR LOWER(ch.to_class) = LOWER($2))
         )
       )`,
    [schoolId, className]
  );
  if (candidateRows.length === 0) return [];

  // Sequential, not Promise.all: each getClassRoster() call can be one of
  // many fired concurrently by a fan-out caller (mapWithLimit), and this
  // codebase's local pg Pool is small (max: 10) — halving each call's
  // simultaneous connection draw matters more here than the small latency
  // cost of not overlapping these two queries.
  const candidateIds = candidateRows.map(r => r.id);
  const { rows: historyRows } = await pool.query(
    `SELECT ch.student_id, ch.from_class, ch.to_class, ch.semester, ch.source,
            COALESCE(ay.start_date, ay.created_at) AS ordinal_date
     FROM class_history ch
     JOIN academic_years ay ON ay.id = ch.academic_year_id
     WHERE ch.student_id = ANY($1::uuid[])
     ORDER BY ch.student_id, ordinal_date, ch.semester`,
    [candidateIds]
  );
  const targetOrdinalMs = await getPeriodOrdinalMs(academicYearId);
  const existenceCutoffMs = await getNextYearOrdinalMs(schoolId, academicYearId);

  const targetPeriod = [targetOrdinalMs, targetSemester];

  const historyByStudent = new Map();
  for (const r of historyRows) {
    if (!historyByStudent.has(r.student_id)) historyByStudent.set(r.student_id, []);
    historyByStudent.get(r.student_id).push({
      fromClass: r.from_class,
      toClass: r.to_class,
      source: r.source,
      period: [new Date(r.ordinal_date).getTime(), r.semester],
    });
  }

  // Roster membership only needs the best-available class name, confirmed
  // or not — an extrapolated guess is still the right signal for "who to
  // include," it's only unsafe to print as a confident label (see
  // resolveStudentClassAtPeriod, which callers use for that).
  const roster = [];
  const excludedByExistenceGuard = [];
  for (const candidate of candidateRows) {
    const createdAtMs = candidate.created_at ? new Date(candidate.created_at).getTime() : null;
    const { className: resolved } = resolveClassFromHistory(
      historyByStudent.get(candidate.id), candidate.class_name, targetPeriod, createdAtMs, existenceCutoffMs
    );
    if (resolved && resolved.toLowerCase() === className.toLowerCase()) {
      roster.push(candidate.id);
    } else if (resolved === null && includeInactive) {
      excludedByExistenceGuard.push(candidate);
    }
  }

  // includeInactive callers are reviewing past results, not tracking live
  // work, so they get one further pass: a candidate the existence guard
  // excluded is still included if they have real recorded evidence for this
  // exact academic year — see studentsWithEvidence's doc comment for why
  // this, and not a blanket bypass, is what the old bulk-migration incident
  // actually needed.
  if (excludedByExistenceGuard.length) {
    const evidenceIds = await studentsWithEvidence(
      schoolId, excludedByExistenceGuard.map(c => c.id), academicYearId
    );
    for (const candidate of excludedByExistenceGuard) {
      if (evidenceIds.has(candidate.id) && candidate.class_name.toLowerCase() === className.toLowerCase()) {
        roster.push(candidate.id);
      }
    }
  }

  if (subject) {
    const enrolled = await getElectiveEnrollmentFilter(schoolId, className, subject);
    if (enrolled) return roster.filter(id => enrolled.has(id));
  }
  return roster;
}

// resolveStudentClassAtPeriod(schoolId, studentId, currentClassName, academicYearId, semester, options)
// The single-student inverse of getClassRoster(): what class was THIS
// student in as of that period? Needed by call sites that derive their
// target class_name from the student's own (current) record — e.g. a
// promoted student viewing their own past results — rather than being
// handed a class_name by the caller. options.includeInactive — see
// getClassRoster's doc comment; same meaning, same default.
// Returns { className, confirmed } — see resolveClassFromHistory's doc
// comment for what confirmed:false means and when it happens. A caller
// that only needs the string for roster matching (fees.js, student.js's
// own-results lookup) can destructure just { className }; a caller that
// DISPLAYS the class name to a human (results-service.js, used by
// ai-remarks.js's generated report-card text) must check confirmed first.
async function resolveStudentClassAtPeriod(schoolId, studentId, currentClassName, academicYearId, semester, options = {}) {
  const targetSemester = parseInt(semester);
  const { includeInactive = false } = options;
  const { rows: historyRows } = await pool.query(
    `SELECT ch.from_class, ch.to_class, ch.semester, ch.source,
            COALESCE(ay.start_date, ay.created_at) AS ordinal_date
     FROM class_history ch
     JOIN academic_years ay ON ay.id = ch.academic_year_id
     WHERE ch.student_id = $1 AND ch.school_id = $2
     ORDER BY ordinal_date, ch.semester`,
    [studentId, schoolId]
  );
  const { rows: studentRows } = await pool.query(`SELECT created_at FROM students WHERE id = $1`, [studentId]);
  const targetOrdinalMs = await getPeriodOrdinalMs(academicYearId);
  const existenceCutoffMs = await getNextYearOrdinalMs(schoolId, academicYearId);
  const createdAtMs = studentRows[0]?.created_at ? new Date(studentRows[0].created_at).getTime() : null;

  const history = historyRows.map(r => ({
    fromClass: r.from_class,
    toClass: r.to_class,
    source: r.source,
    period: [new Date(r.ordinal_date).getTime(), r.semester],
  }));

  const resolved = resolveClassFromHistory(history, currentClassName, [targetOrdinalMs, targetSemester], createdAtMs, existenceCutoffMs);
  if (resolved.className !== null || !includeInactive) return resolved;

  // Same evidence-based escape hatch as getClassRoster — see
  // studentsWithEvidence's doc comment. Not confirmed: this is a guess
  // (their current class name) backed only by evidence that they existed
  // that year, not by any record of what class they were actually in.
  const evidenceIds = await studentsWithEvidence(schoolId, [studentId], academicYearId);
  if (evidenceIds.has(studentId)) {
    return { className: currentClassName, confirmed: false };
  }
  return resolved;
}

module.exports = {
  recordClassChange, getClassRoster, resolveStudentClassAtPeriod, mapWithLimit, getStudentEnrollmentYears,
  // Exported for direct unit testing — pure function, no DB access of its
  // own, and the core logic worth pinning down with tests in isolation.
  resolveClassFromHistory,
};
