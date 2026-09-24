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
    `SELECT DISTINCT s.id, s.class_name
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

  const candidateIds = candidateRows.map(r => r.id);
  const [{ rows: historyRows }, { rows: targetYearRows }] = await Promise.all([
    pool.query(
      `SELECT ch.student_id, ch.from_class, ch.to_class, ch.semester,
              COALESCE(ay.start_date, ay.created_at) AS ordinal_date
       FROM class_history ch
       JOIN academic_years ay ON ay.id = ch.academic_year_id
       WHERE ch.student_id = ANY($1::uuid[])
       ORDER BY ch.student_id, ordinal_date, ch.semester`,
      [candidateIds]
    ),
    pool.query(`SELECT COALESCE(start_date, created_at) AS ordinal_date FROM academic_years WHERE id = $1`, [academicYearId]),
  ]);

  const targetOrdinalMs = targetYearRows[0] ? new Date(targetYearRows[0].ordinal_date).getTime() : 0;
  const targetPeriod = [targetOrdinalMs, targetSemester];
  const comparePeriod = (a, b) => a[0] - b[0] || a[1] - b[1];

  const historyByStudent = new Map();
  for (const r of historyRows) {
    if (!historyByStudent.has(r.student_id)) historyByStudent.set(r.student_id, []);
    historyByStudent.get(r.student_id).push({
      fromClass: r.from_class,
      toClass: r.to_class,
      period: [new Date(r.ordinal_date).getTime(), r.semester],
    });
  }

  const roster = [];
  for (const candidate of candidateRows) {
    const history = historyByStudent.get(candidate.id);
    let resolved;
    if (!history || history.length === 0) {
      resolved = candidate.class_name;
    } else {
      resolved = null;
      for (const row of history) {
        if (comparePeriod(row.period, targetPeriod) <= 0) resolved = row.toClass;
        else { resolved = row.fromClass; break; }
      }
    }
    if (resolved && resolved.toLowerCase() === className.toLowerCase()) roster.push(candidate.id);
  }
  return roster;
}

module.exports = { recordClassChange, getClassRoster };
