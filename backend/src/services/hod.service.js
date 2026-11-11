'use strict';
const pool = require('../config/db');

// The departments a teacher heads. Schools make HODs in one of two ways:
//   1. Departments page: the teacher is set as the department's head.
//   2. Responsibilities: the teacher holds a responsibility tagged 'hod'.
//      Their department is the one named on their teacher record, or, if
//      that is blank, the one department they belong to.
// Every HOD check uses this so a responsibility-made HOD gets the same
// department pages, inventory, observations and budgets as a Departments-made one.
async function getHeadedDepartments(schoolId, teacherId, db = pool) {
  const { rows } = await db.query(
    `WITH is_resp_hod AS (
       SELECT EXISTS (
         SELECT 1 FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id = $2 AND tr.school_id = $1 AND tr.module_key = 'hod'
       ) AS yes
     ),
     me AS (SELECT NULLIF(TRIM(department), '') AS dept FROM teachers WHERE id = $2 AND school_id = $1),
     memberships AS (
       SELECT dt.department_id FROM department_teachers dt
       JOIN departments d ON d.id = dt.department_id AND d.school_id = $1
       WHERE dt.teacher_id = $2
     )
     SELECT d.id, d.name, 'head' AS via FROM departments d
     WHERE d.school_id = $1 AND d.head_teacher_id = $2
     UNION
     SELECT d.id, d.name, 'responsibility' AS via FROM departments d, is_resp_hod r, me
     WHERE r.yes AND d.school_id = $1 AND (
       (me.dept IS NOT NULL AND LOWER(d.name) = LOWER(me.dept))
       OR (me.dept IS NULL AND (SELECT COUNT(*) FROM memberships) = 1
           AND d.id IN (SELECT department_id FROM memberships))
     )
     ORDER BY name`,
    [schoolId, teacherId]
  );
  // A department reached both ways appears once, keeping the 'head' row.
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.id) || r.via === 'head') seen.set(r.id, r);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function hasHodResponsibility(schoolId, teacherId, db = pool) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM teacher_responsibility_assignments tra
     JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
     WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key = 'hod' LIMIT 1`,
    [teacherId, schoolId]
  );
  return rowCount > 0;
}

module.exports = { getHeadedDepartments, hasHodResponsibility };
