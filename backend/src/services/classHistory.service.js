'use strict';
const pool = require('../config/db');

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

const comparePeriod = (a, b) => a[0] - b[0] || a[1] - b[1];

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
function resolveClassFromHistory(historyRows, currentClassName, targetPeriod, createdAtMs, existenceCutoffMs) {
  if (!historyRows || historyRows.length === 0) {
    return createdAtMs != null && existenceCutoffMs != null && createdAtMs >= existenceCutoffMs
      ? null
      : currentClassName;
  }
  let resolved = null;
  for (const row of historyRows) {
    const cmp = comparePeriod(row.period, targetPeriod);
    const alreadyTransitioned = row.source === 'backfill' ? cmp < 0 : cmp <= 0;
    if (alreadyTransitioned) resolved = row.toClass;
    else { resolved = row.fromClass; break; }
  }
  return resolved;
}

// getClassRoster(schoolId, className, academicYearId, semester)
// Returns the array of student_ids enrolled in className during that
// specific (academicYearId, semester) period — resolving each candidate's
// class at that period via class_history rather than trusting their current
// students.class_name, which only reflects who is in the class *right now*.
// See CAS-CLASS-HISTORY-DESIGN.md Section 4 for the algorithm.
async function getClassRoster(schoolId, className, academicYearId, semester) {
  const targetSemester = parseInt(semester);

  // Candidate pool: everyone currently in this class, plus anyone whose
  // class_history ever mentions this class (as either endpoint of a
  // transition) — this catches students who've since moved on, and
  // students newly in the class who came from elsewhere.
  const { rows: candidateRows } = await pool.query(
    `SELECT DISTINCT s.id, s.class_name, s.created_at
     FROM students s
     WHERE s.school_id = $1 AND s.status = 'Active'
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

  const roster = [];
  for (const candidate of candidateRows) {
    const createdAtMs = candidate.created_at ? new Date(candidate.created_at).getTime() : null;
    const resolved = resolveClassFromHistory(historyByStudent.get(candidate.id), candidate.class_name, targetPeriod, createdAtMs, existenceCutoffMs);
    if (resolved && resolved.toLowerCase() === className.toLowerCase()) roster.push(candidate.id);
  }
  return roster;
}

// resolveStudentClassAtPeriod(schoolId, studentId, currentClassName, academicYearId, semester)
// The single-student inverse of getClassRoster(): what class was THIS
// student in as of that period? Needed by call sites that derive their
// target class_name from the student's own (current) record — e.g. a
// promoted student viewing their own past results — rather than being
// handed a class_name by the caller.
async function resolveStudentClassAtPeriod(schoolId, studentId, currentClassName, academicYearId, semester) {
  const targetSemester = parseInt(semester);
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

  return resolveClassFromHistory(history, currentClassName, [targetOrdinalMs, targetSemester], createdAtMs, existenceCutoffMs);
}

module.exports = { recordClassChange, getClassRoster, resolveStudentClassAtPeriod, mapWithLimit };
