const pool = require('../config/db');

const ALL_MODULE_KEYS = [
  'teacher_attendance', 'student_attendance', 'timetable',
  'leave_management', 'meeting_attendance', 'plc',
  'remedial_lessons', 'assessments', 'houses',
  'exeat', 'clearance', 'library', 'classroom_qr', 'fees', 'inventory',
];

const MODULE_REGISTRY = [
  { key: 'teacher_attendance', label: 'Teacher Attendance',   description: 'QR-based classroom attendance tracking for teachers',              core: true,  defaultFor: 'all' },
  { key: 'student_attendance', label: 'Student Attendance',   description: 'Student attendance registers during lessons',                       core: false, defaultFor: 'all' },
  { key: 'timetable',          label: 'Timetable',            description: 'Weekly class-teacher timetable management',                         core: false, defaultFor: ['Primary','JHS','SHS','Technical','University','Other'] },
  { key: 'leave_management',   label: 'Leave & Excuses',      description: 'Teacher leave requests and absence excuse management',              core: false, defaultFor: 'all' },
  { key: 'meeting_attendance', label: 'Meeting Attendance',   description: 'Track attendance for staff meetings and briefings',                 core: false, defaultFor: ['JHS','SHS','Technical','University','Other'] },
  { key: 'plc',                label: 'PLC Sessions',         description: 'Professional Learning Community session tracking',                  core: false, defaultFor: ['JHS','SHS'] },
  { key: 'remedial_lessons',   label: 'Remedial Lessons',     description: 'Schedule and verify make-up lessons for absences',                 core: false, defaultFor: ['JHS','SHS','Technical'] },
  { key: 'assessments',        label: 'Assessments & CA',     description: 'Continuous assessment scores and grade management',                core: false, defaultFor: ['Primary','JHS','SHS','Technical'] },
  { key: 'houses',             label: 'Houses',               description: 'Inter-house competitions and house group assignments',              core: false, defaultFor: ['JHS','SHS'] },
  { key: 'exeat',              label: 'Exeat',                description: 'Student exeat pass management',                                    core: false, defaultFor: ['SHS'] },
  { key: 'clearance',          label: 'Student Clearance',    description: 'End-of-term or graduation clearance workflow',                     core: false, defaultFor: ['JHS','SHS','University'] },
  { key: 'library',            label: 'Library',              description: 'Book catalog, loans, and overdue tracking',                        core: false, defaultFor: ['JHS','SHS','University'] },
  { key: 'classroom_qr',       label: 'Classroom QR',         description: 'QR codes for classroom location verification',                     core: false, defaultFor: 'all' },
  { key: 'fees',               label: 'Accounts & Fees',      description: 'Fee schedules, payments, and outstanding balance tracking',      core: false, defaultFor: [] },
  { key: 'inventory',          label: 'Inventory',            description: 'Track school assets, equipment, books, and issue/return logs',     core: false, defaultFor: 'all' },
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
