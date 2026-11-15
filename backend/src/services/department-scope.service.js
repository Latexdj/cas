'use strict';
/**
 * What belongs to a department.
 *
 * A subject belongs to one department (subjects.department_id). A department's
 * classes are the classes that take its subjects, from this term's timetable
 * and from the curriculum allocations (class_subjects), whoever teaches them.
 *
 * Until an admin links a school's subjects to departments, callers fall back to
 * the older rule (a teacher's free-text department); hasLinkedSubjects() tells
 * them which to use.
 */
const pool = require('../config/db');

/** Subject names linked to the department. */
async function deptSubjectNames(schoolId, deptId) {
  if (!deptId) return [];
  const { rows } = await pool.query(
    `SELECT name FROM subjects WHERE school_id = $1 AND department_id = $2 ORDER BY name`,
    [schoolId, deptId]
  );
  return rows.map(r => r.name);
}

async function hasLinkedSubjects(schoolId, deptId) {
  if (!deptId) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM subjects WHERE school_id = $1 AND department_id = $2 LIMIT 1`,
    [schoolId, deptId]
  );
  return rows.length > 0;
}

/** A department id from its name (HOD contexts that only know the name). */
async function resolveDeptId(schoolId, name) {
  if (!name) return null;
  const { rows } = await pool.query(
    `SELECT id FROM departments WHERE school_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1`,
    [schoolId, name]
  );
  return rows[0]?.id ?? null;
}

/** The department a subject (by name) belongs to, or null if unlinked. */
async function subjectDepartment(schoolId, subjectName) {
  if (!subjectName) return null;
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.head_teacher_id
       FROM subjects s JOIN departments d ON d.id = s.department_id
      WHERE s.school_id = $1 AND LOWER(TRIM(s.name)) = LOWER(TRIM($2))
      LIMIT 1`,
    [schoolId, subjectName]
  );
  return rows[0] ?? null;
}

/**
 * Classes taking the department's subjects: one row per class + subject, with
 * the teacher from this term's timetable when there is one, and the number of
 * active students in the class.
 */
async function getDepartmentClasses(schoolId, deptId, yearId, semester) {
  if (!deptId) return [];
  const { rows } = await pool.query(
    `WITH dept_subjects AS (
       SELECT id, name FROM subjects WHERE school_id = $1 AND department_id = $2
     ),
     taught AS (
       SELECT DISTINCT TRIM(cls) AS class_name, ds.name AS subject,
              te.id AS teacher_id, te.name AS teacher_name, te.phone AS teacher_phone, te.email AS teacher_email
         FROM timetable tt
         JOIN dept_subjects ds ON LOWER(TRIM(tt.subject)) = LOWER(ds.name)
         JOIN teachers te ON te.id = tt.teacher_id
         CROSS JOIN LATERAL unnest(string_to_array(tt.class_names, ',')) AS cls
        WHERE tt.school_id = $1 AND tt.academic_year_id = $3 AND tt.semester = $4
          AND TRIM(cls) <> ''
     ),
     allocated AS (
       SELECT TRIM(cs.class_name) AS class_name, ds.name AS subject
         FROM class_subjects cs JOIN dept_subjects ds ON ds.id = cs.subject_id
        WHERE cs.school_id = $1
     ),
     pairs AS (
       SELECT class_name, subject, teacher_id, teacher_name, teacher_phone, teacher_email FROM taught
       UNION
       SELECT a.class_name, a.subject, NULL, NULL, NULL, NULL FROM allocated a
        WHERE NOT EXISTS (SELECT 1 FROM taught t WHERE LOWER(t.class_name) = LOWER(a.class_name) AND t.subject = a.subject)
     )
     SELECT p.*, (SELECT COUNT(*)::int FROM students s
                   WHERE s.school_id = $1 AND s.status = 'Active' AND LOWER(s.class_name) = LOWER(p.class_name)) AS student_count
       FROM pairs p
      ORDER BY p.class_name, p.subject`,
    [schoolId, deptId, yearId ?? '00000000-0000-0000-0000-000000000000', semester ?? 1]
  );
  return rows;
}

module.exports = { deptSubjectNames, hasLinkedSubjects, resolveDeptId, subjectDepartment, getDepartmentClasses };
