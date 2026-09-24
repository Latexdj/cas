'use strict';
const { recordClassChange } = require('./classHistory.service');
const { getCurrentYearSem } = require('../utils/school-context');

// Promotes active students from one class to another. Pass studentIds to
// promote only that subset (repeaters are simply the ones left out); omit
// it to promote every active student currently in fromClass.
// db may be the pool or a transaction client — callers that need several
// promotions to succeed or fail together (e.g. a whole-level promotion)
// should pass a client that's already inside BEGIN/COMMIT.
//
// Logs one class_history row per student actually moved (see
// CAS-CLASS-HISTORY-DESIGN.md). The old class_name is captured atomically
// via the same UPDATE (not a separate SELECT beforehand) so it can't drift
// under concurrent writes.
async function promoteClass(db, { schoolId, fromClass, toClass, studentIds, reason, changedBy }) {
  const { yearId: academicYearId, sem: semester } = await getCurrentYearSem(schoolId);

  let updatedRows;
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const { rows } = await db.query(
      `WITH old AS (
         SELECT id, class_name FROM students
         WHERE id = ANY($1::uuid[]) AND school_id = $2 AND status = 'Active'
         FOR UPDATE
       )
       UPDATE students SET class_name = $3, updated_at = now()
       FROM old WHERE students.id = old.id
       RETURNING students.id, old.class_name AS from_class`,
      [studentIds, schoolId, toClass]
    );
    updatedRows = rows;
  } else {
    const { rows } = await db.query(
      `WITH old AS (
         SELECT id, class_name FROM students
         WHERE school_id = $1 AND class_name = $2 AND status = 'Active'
         FOR UPDATE
       )
       UPDATE students SET class_name = $3, updated_at = now()
       FROM old WHERE students.id = old.id
       RETURNING students.id, old.class_name AS from_class`,
      [schoolId, fromClass, toClass]
    );
    updatedRows = rows;
  }

  for (const row of updatedRows) {
    if (row.from_class === toClass) continue; // no-op guard
    await recordClassChange(db, {
      schoolId, studentId: row.id, fromClass: row.from_class, toClass,
      academicYearId, semester, reason, source: 'promotion', changedBy,
    });
  }

  return updatedRows.length;
}

module.exports = { promoteClass };
