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

module.exports = { recordClassChange };
