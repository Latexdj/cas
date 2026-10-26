'use strict';
const pool = require('../config/db');

// getElectiveEnrollmentFilter(schoolId, className, subjectName)
//
// Returns null when this subject is NOT configured as elective for this
// class (no class_subjects row, or is_elective = false) — the caller must
// then apply NO filtering, preserving the "whole class" roster behavior
// that is correct for every core subject and every school that hasn't
// opted into electives at all. This is the overwhelmingly common case.
//
// Returns a Set<string> of enrolled student_ids when the subject IS flagged
// elective for this class — callers narrow their own roster/result set down
// to this set. It only ever narrows a roster the caller already resolved;
// it never adds students outside that roster.
//
// subjectName is matched against subjects.name case-insensitively and
// trimmed — the same convention used elsewhere in this codebase to resolve
// a free-text subject string (timetable.subject, assessments.subject,
// exam_scores.subject, remedial_lessons.subject are all plain TEXT, not
// FKs) against the subjects table.
async function getElectiveEnrollmentFilter(schoolId, className, subjectName) {
  if (!className || !subjectName) return null;

  const { rows } = await pool.query(
    `SELECT cs.is_elective, cs.subject_id
     FROM class_subjects cs
     JOIN subjects s ON s.id = cs.subject_id
     WHERE cs.school_id = $1
       AND LOWER(cs.class_name) = LOWER($2)
       AND LOWER(s.name) = LOWER(TRIM($3))`,
    [schoolId, className, subjectName]
  );
  const row = rows[0];
  if (!row || !row.is_elective) return null;

  const { rows: enrolled } = await pool.query(
    `SELECT student_id FROM student_electives WHERE subject_id = $1`,
    [row.subject_id]
  );
  return new Set(enrolled.map(r => r.student_id));
}

module.exports = { getElectiveEnrollmentFilter };
