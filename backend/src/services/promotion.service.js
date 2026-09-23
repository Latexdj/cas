'use strict';

// Promotes active students from one class to another. Pass studentIds to
// promote only that subset (repeaters are simply the ones left out); omit
// it to promote every active student currently in fromClass.
// db may be the pool or a transaction client — callers that need several
// promotions to succeed or fail together (e.g. a whole-level promotion)
// should pass a client that's already inside BEGIN/COMMIT.
async function promoteClass(db, { schoolId, fromClass, toClass, studentIds }) {
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const { rowCount } = await db.query(
      `UPDATE students SET class_name=$1, updated_at=now()
       WHERE id=ANY($2::uuid[]) AND school_id=$3 AND status='Active'`,
      [toClass, studentIds, schoolId]
    );
    return rowCount;
  }
  const { rowCount } = await db.query(
    `UPDATE students SET class_name=$1, updated_at=now()
     WHERE school_id=$2 AND class_name=$3 AND status='Active'`,
    [toClass, schoolId, fromClass]
  );
  return rowCount;
}

module.exports = { promoteClass };
