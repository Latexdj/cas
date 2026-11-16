'use strict';
// Timetable clashes for one academic year and semester.
//
// Class clash: two lessons overlap in the same class. When either subject is
// set to "Some students" for that class (class_subjects.is_elective), the
// class is splitting into groups, which is expected, so it is not reported.
//
// Teacher clash: one teacher has two lessons whose times overlap.
//
// Lessons that merely touch (8:00-9:00 then 9:00-10:00) do not clash.

const pool = require('../config/db');

async function resolvePeriod(schoolId, yearId, semester) {
  if (yearId && semester) return [yearId, parseInt(semester, 10)];
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return [yearId || rows[0]?.id || null, semester ? parseInt(semester, 10) : (rows[0]?.current_semester ?? null)];
}

// onlyId: limit to clashes involving one timetable row (after a manual add/edit).
async function findClashes(schoolId, { yearId, semester, onlyId } = {}) {
  const [y, s] = await resolvePeriod(schoolId, yearId, semester);
  if (!y || !s) return { class_clashes: [], teacher_clashes: [], total: 0 };
  const params = [schoolId, y, s];
  let only = '';
  if (onlyId) { params.push(onlyId); only = `AND ($4::uuid IN (a.id, b.id))`; }

  const { rows: classClashes } = await pool.query(`
    WITH tt AS (
      SELECT t.id, t.teacher_id, t.day_of_week, t.start_time::time AS st, t.end_time::time AS et,
             t.subject, TRIM(c) AS cls
        FROM timetable t, unnest(string_to_array(t.class_names, ',')) AS c
       WHERE t.school_id = $1 AND t.academic_year_id = $2 AND t.semester = $3 AND TRIM(c) <> ''
    ),
    split AS (
      SELECT LOWER(cs.class_name) AS cls, LOWER(TRIM(sj.name)) AS subj
        FROM class_subjects cs JOIN subjects sj ON sj.id = cs.subject_id
       WHERE cs.school_id = $1 AND cs.is_elective
    )
    SELECT a.cls AS class_name, a.day_of_week,
           a.id AS a_id, a.subject AS a_subject, to_char(a.st, 'HH24:MI') AS a_start, to_char(a.et, 'HH24:MI') AS a_end, ta.name AS a_teacher,
           b.id AS b_id, b.subject AS b_subject, to_char(b.st, 'HH24:MI') AS b_start, to_char(b.et, 'HH24:MI') AS b_end, tb.name AS b_teacher
      FROM tt a
      JOIN tt b ON LOWER(a.cls) = LOWER(b.cls) AND a.day_of_week = b.day_of_week
               AND a.id < b.id AND a.st < b.et AND b.st < a.et
      LEFT JOIN teachers ta ON ta.id = a.teacher_id
      LEFT JOIN teachers tb ON tb.id = b.teacher_id
     WHERE NOT EXISTS (SELECT 1 FROM split sp WHERE sp.cls = LOWER(a.cls) AND sp.subj IN (LOWER(TRIM(a.subject)), LOWER(TRIM(b.subject))))
       ${only}
     ORDER BY a.day_of_week, a.st, a.cls`, params);

  const { rows: teacherClashes } = await pool.query(`
    WITH tt AS (
      SELECT t.id, t.teacher_id, t.day_of_week, t.start_time::time AS st, t.end_time::time AS et, t.subject, t.class_names
        FROM timetable t
       WHERE t.school_id = $1 AND t.academic_year_id = $2 AND t.semester = $3 AND t.teacher_id IS NOT NULL
    )
    SELECT te.name AS teacher_name, te.teacher_code, a.day_of_week,
           a.id AS a_id, a.subject AS a_subject, a.class_names AS a_classes, to_char(a.st, 'HH24:MI') AS a_start, to_char(a.et, 'HH24:MI') AS a_end,
           b.id AS b_id, b.subject AS b_subject, b.class_names AS b_classes, to_char(b.st, 'HH24:MI') AS b_start, to_char(b.et, 'HH24:MI') AS b_end
      FROM tt a
      JOIN tt b ON a.teacher_id = b.teacher_id AND a.day_of_week = b.day_of_week
               AND a.id < b.id AND a.st < b.et AND b.st < a.et
      JOIN teachers te ON te.id = a.teacher_id
     WHERE TRUE ${only}
     ORDER BY a.day_of_week, a.st, te.name`, params);

  return { class_clashes: classClashes, teacher_clashes: teacherClashes, total: classClashes.length + teacherClashes.length };
}

module.exports = { findClashes };
