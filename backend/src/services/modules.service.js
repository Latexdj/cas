const pool = require('../config/db');

const ALL_MODULE_KEYS = [
  'teacher_attendance', 'student_attendance', 'timetable',
  'leave_management', 'meeting_attendance', 'plc',
  'remedial_lessons', 'assessments', 'houses',
  'exeat', 'clearance', 'library', 'classroom_qr', 'fees', 'inventory',
  'admissions', 'lms', 'discipline',
];

// `licensable` marks which modules can ever be toggled off for a school via
// the super-admin licensing UI / checkModuleAccess. Attendance/scheduling
// keys (teacher_attendance, student_attendance, timetable, leave_management,
// meeting_attendance, plc, remedial_lessons, classroom_qr) are foundation —
// same tier as student records and academic years — and are never gated,
// regardless of subscription. `licensable` is independent of `core`: `core`
// makes defaultModulesForType() ignore school-type scoping entirely, which
// would wrongly turn on e.g. PLC/remedial lessons for every school type
// (they're deliberately scoped to JHS/SHS/Technical only). A key can be
// non-licensable (never gated) while still being scoped by school type.
const MODULE_REGISTRY = [
  { key: 'teacher_attendance', label: 'Teacher Attendance',   description: 'QR-based classroom attendance tracking for teachers',              core: true,  licensable: false, defaultFor: 'all' },
  { key: 'student_attendance', label: 'Student Attendance',   description: 'Student attendance registers during lessons',                       core: false, licensable: false, defaultFor: 'all' },
  { key: 'timetable',          label: 'Timetable',            description: 'Weekly class-teacher timetable management',                         core: false, licensable: false, defaultFor: ['Primary','JHS','SHS','Technical','University','Other'] },
  { key: 'leave_management',   label: 'Leave & Excuses',      description: 'Teacher leave requests and absence excuse management',              core: false, licensable: false, defaultFor: 'all' },
  { key: 'meeting_attendance', label: 'Meeting Attendance',   description: 'Track attendance for staff meetings and briefings',                 core: false, licensable: false, defaultFor: ['JHS','SHS','Technical','University','Other'] },
  { key: 'plc',                label: 'PLC Sessions',         description: 'Professional Learning Community session tracking',                  core: false, licensable: false, defaultFor: ['JHS','SHS'] },
  { key: 'remedial_lessons',   label: 'Remedial Lessons',     description: 'Schedule and verify make-up lessons for absences',                 core: false, licensable: false, defaultFor: ['JHS','SHS','Technical'] },
  { key: 'assessments',        label: 'Assessments & CA',     description: 'Continuous assessment scores and grade management',                core: false, licensable: true,  defaultFor: ['Primary','JHS','SHS','Technical'] },
  { key: 'houses',             label: 'Houses',               description: 'Inter-house competitions and house group assignments',              core: false, licensable: true,  defaultFor: ['JHS','SHS'] },
  { key: 'exeat',              label: 'Exeat',                description: 'Student exeat pass management',                                    core: false, licensable: true,  defaultFor: ['SHS'] },
  { key: 'clearance',          label: 'Student Clearance',    description: 'End-of-term or graduation clearance workflow',                     core: false, licensable: true,  defaultFor: ['JHS','SHS','University'] },
  { key: 'library',            label: 'Library',              description: 'Book catalog, loans, and overdue tracking',                        core: false, licensable: true,  defaultFor: ['JHS','SHS','University'] },
  { key: 'classroom_qr',       label: 'Classroom QR',         description: 'QR codes for classroom location verification',                     core: false, licensable: false, defaultFor: 'all' },
  { key: 'fees',               label: 'Accounts & Fees',      description: 'Fee schedules, payments, and outstanding balance tracking',      core: false, licensable: true,  defaultFor: [] },
  { key: 'inventory',          label: 'Inventory',            description: 'Track school assets, equipment, books, and issue/return logs',     core: false, licensable: true,  defaultFor: 'all' },
  { key: 'admissions',         label: 'Admission',            description: 'Online application, placement, and prospectus management',         core: false, licensable: true,  defaultFor: 'all' },
  { key: 'lms',                label: 'LMS',                  description: 'Courses, assignments, quizzes, and the past-questions bank',        core: false, licensable: true,  defaultFor: 'all' },
  { key: 'discipline',         label: 'Administration',       description: 'Disciplinary letters, general letters, and letter drafting/chat',   core: false, licensable: true,  defaultFor: 'all' },
];

function defaultModulesForType(schoolType, schoolCategory) {
  return MODULE_REGISTRY.map(m => {
    if (m.core) return { key: m.key, enabled: true };
    if (m.defaultFor === 'all') return { key: m.key, enabled: true };
    // fees: only default-on for Private schools
    if (m.key === 'fees') return { key: m.key, enabled: schoolCategory === 'Private' };
    const enabled = Array.isArray(m.defaultFor) && m.defaultFor.includes(schoolType);
    return { key: m.key, enabled };
  });
}

async function getEnabledModules(schoolId) {
  const { rows } = await pool.query(
    `SELECT module_key FROM school_modules WHERE school_id = $1 AND enabled = true`,
    [schoolId]
  );
  // If no rows at all, school was created before module system — treat as all enabled
  if (rows.length === 0) return ALL_MODULE_KEYS;
  return rows.map(r => r.module_key);
}

module.exports = { MODULE_REGISTRY, ALL_MODULE_KEYS, defaultModulesForType, getEnabledModules };
