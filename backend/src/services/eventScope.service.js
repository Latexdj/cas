const pool = require('../config/db');

// Builds the lookups needed to test a scoped school_calendar event against a
// specific teacher/class: which teachers sit in which department, and which
// class-level each class belongs to. Only needed when at least one of the
// day's events isn't whole-school, so callers fetch it lazily.
async function getScopeContext(schoolId) {
  const { rows: deptRows } = await pool.query(
    `SELECT department_id, teacher_id FROM department_teachers WHERE school_id = $1`,
    [schoolId]
  );
  const departmentTeacherSet = new Map();
  for (const r of deptRows) {
    if (!departmentTeacherSet.has(r.department_id)) departmentTeacherSet.set(r.department_id, new Set());
    departmentTeacherSet.get(r.department_id).add(r.teacher_id);
  }

  const { rows: classRows } = await pool.query(
    `SELECT name, level_id FROM classes WHERE school_id = $1 AND level_id IS NOT NULL`,
    [schoolId]
  );
  const classLevelByName = new Map();
  for (const r of classRows) classLevelByName.set(r.name.trim().toLowerCase(), r.level_id);

  return { departmentTeacherSet, classLevelByName };
}

// Teacher-only exemption (PLC sessions, staff meetings, primary clock-in —
// none of these are tied to a specific class). 'class_level'/'classes' scoped
// events don't resolve to a teacher-only match, so they exempt no one here.
function eventCoversTeacher(event, teacherId, ctx) {
  const scopeType = event.scope_type || 'school';
  if (scopeType === 'school') return true;
  if (scopeType === 'department') {
    const set = ctx?.departmentTeacherSet.get(event.scope_department_id);
    return !!set && set.has(teacherId);
  }
  return false;
}

// Lesson/class-level exemption (classroom attendance checks).
function eventCoversLesson(event, teacherId, className, ctx) {
  const scopeType = event.scope_type || 'school';
  if (scopeType === 'school') return true;
  if (scopeType === 'department') return eventCoversTeacher(event, teacherId, ctx);
  if (scopeType === 'class_level') {
    const levelId = ctx?.classLevelByName.get(className.trim().toLowerCase());
    return !!levelId && levelId === event.scope_class_level_id;
  }
  if (scopeType === 'classes') {
    const list = (event.scope_class_names || []).map(c => c.trim().toLowerCase());
    return list.includes(className.trim().toLowerCase());
  }
  return false;
}

// SQL-side equivalent for retroactive absence-excusing (school-calendar.js).
// Appends to `params` and returns an " AND ..." clause scoped to `alias`
// (an `absences`-shaped row: school_id, teacher_id, class_name columns).
// A scope configured but missing its reference (e.g. scope_type='department'
// with no scope_department_id) fails closed — excuses nothing rather than
// risking an accidental school-wide excuse.
function buildScopeFilterSql(scope, alias, params) {
  const scopeType = scope.scope_type || 'school';
  if (scopeType === 'school') return '';
  if (scopeType === 'department' && scope.scope_department_id) {
    params.push(scope.scope_department_id);
    return ` AND EXISTS (SELECT 1 FROM department_teachers dt WHERE dt.teacher_id = ${alias}.teacher_id AND dt.department_id = $${params.length})`;
  }
  if (scopeType === 'class_level' && scope.scope_class_level_id) {
    params.push(scope.scope_class_level_id);
    return ` AND EXISTS (SELECT 1 FROM classes c WHERE c.school_id = ${alias}.school_id AND lower(c.name) = lower(${alias}.class_name) AND c.level_id = $${params.length})`;
  }
  if (scopeType === 'classes' && Array.isArray(scope.scope_class_names) && scope.scope_class_names.length) {
    params.push(scope.scope_class_names.map(c => c.trim().toLowerCase()));
    return ` AND lower(${alias}.class_name) = ANY($${params.length}::text[])`;
  }
  return ' AND false';
}

module.exports = { getScopeContext, eventCoversTeacher, eventCoversLesson, buildScopeFilterSql };
