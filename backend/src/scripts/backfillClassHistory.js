'use strict';
// One-time backfill of class_history from existing assessment/exam evidence.
// See CAS-CLASS-HISTORY-DESIGN.md Section 3 for the approach and its
// explicit limitations (no exact timestamp, no reason, results_import
// excluded as unrecoverable evidence).
//
// Usage:
//   node src/scripts/backfillClassHistory.js            (dry run — reports proposed rows, writes nothing)
//   node src/scripts/backfillClassHistory.js --commit    (actually inserts the rows, source='backfill')
require('dotenv').config();
const pool = require('../config/db');

const COMMIT = process.argv.includes('--commit');

// Builds, per school, the sorted list of distinct classes each student has
// direct historical evidence for (from assessment_scores/exam_scores only —
// results_import has no class_name of its own and is deliberately excluded).
// Returns Map<studentId, Array<{ className, academicYearId, semester, ordinal }>>
// sorted ascending by ordinal (COALESCE(academic_years.start_date, created_at)), then semester.
async function loadEvidenceByStudent(schoolId) {
  const { rows } = await pool.query(
    `WITH evidence AS (
       SELECT sc.student_id, a.class_name, a.academic_year_id, a.semester
       FROM assessment_scores sc
       JOIN assessments a ON a.id = sc.assessment_id
       WHERE a.school_id = $1
       UNION ALL
       SELECT student_id, class_name, academic_year_id, semester
       FROM exam_scores
       WHERE school_id = $1
     )
     SELECT e.student_id, e.class_name, e.academic_year_id, e.semester,
            COALESCE(ay.start_date, ay.created_at) AS ordinal_date
     FROM evidence e
     JOIN academic_years ay ON ay.id = e.academic_year_id
     WHERE e.class_name IS NOT NULL AND e.academic_year_id IS NOT NULL AND e.semester IS NOT NULL`,
    [schoolId]
  );

  // Per student, per lowercased class_name: keep the LATEST period seen.
  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, new Map());
    const classMap = byStudent.get(r.student_id);
    const key = r.class_name.toLowerCase();
    const ordinal = [new Date(r.ordinal_date).getTime(), r.semester];
    const existing = classMap.get(key);
    if (!existing || ordinal[0] > existing.ordinal[0] || (ordinal[0] === existing.ordinal[0] && ordinal[1] > existing.ordinal[1])) {
      classMap.set(key, { className: r.class_name, academicYearId: r.academic_year_id, semester: r.semester, ordinal });
    }
  }

  const result = new Map();
  for (const [studentId, classMap] of byStudent) {
    const list = [...classMap.values()].sort((a, b) =>
      a.ordinal[0] - b.ordinal[0] || a.ordinal[1] - b.ordinal[1]
    );
    result.set(studentId, list);
  }
  return result;
}

// Turns one student's sorted evidence list + their current class_name into
// the list of class_history rows to insert (may be zero, one, or several).
function buildTransitions(evidenceList, currentClassName) {
  const transitions = [];
  for (let i = 1; i < evidenceList.length; i++) {
    const prev = evidenceList[i - 1];
    const cur = evidenceList[i];
    transitions.push({
      fromClass: prev.className, toClass: cur.className,
      academicYearId: prev.academicYearId, semester: prev.semester,
    });
  }
  const last = evidenceList[evidenceList.length - 1];
  if (last.className.toLowerCase() !== currentClassName.toLowerCase()) {
    transitions.push({
      fromClass: last.className, toClass: currentClassName,
      academicYearId: last.academicYearId, semester: last.semester,
    });
  }
  return transitions;
}

async function run() {
  const { rows: schools } = await pool.query(`SELECT id, name FROM schools ORDER BY name`);

  const proposedRows = []; // { schoolId, schoolName, studentId, studentName, fromClass, toClass, academicYearId, semester }
  const perSchoolCount = new Map();

  for (const school of schools) {
    const evidenceByStudent = await loadEvidenceByStudent(school.id);
    if (evidenceByStudent.size === 0) continue;

    const studentIds = [...evidenceByStudent.keys()];
    const { rows: students } = await pool.query(
      `SELECT id, name, class_name FROM students WHERE id = ANY($1::uuid[])`,
      [studentIds]
    );
    const studentById = new Map(students.map(s => [s.id, s]));

    // Skip students who already have a class_history row (idempotency —
    // running the dry run repeatedly, or re-running after a partial commit,
    // must not propose duplicates).
    const { rows: alreadyLogged } = await pool.query(
      `SELECT DISTINCT student_id FROM class_history WHERE school_id = $1`,
      [school.id]
    );
    const alreadyLoggedSet = new Set(alreadyLogged.map(r => r.student_id));

    let schoolCount = 0;
    for (const [studentId, evidenceList] of evidenceByStudent) {
      if (alreadyLoggedSet.has(studentId)) continue;
      const student = studentById.get(studentId);
      if (!student) continue; // student since deleted; evidence orphaned, nothing to backfill onto

      const transitions = buildTransitions(evidenceList, student.class_name);
      for (const t of transitions) {
        proposedRows.push({
          schoolId: school.id, schoolName: school.name,
          studentId, studentName: student.name,
          fromClass: t.fromClass, toClass: t.toClass,
          academicYearId: t.academicYearId, semester: t.semester,
        });
        schoolCount++;
      }
    }
    if (schoolCount > 0) perSchoolCount.set(school.name, schoolCount);
  }

  console.log(`\n=== Class history backfill — ${COMMIT ? 'COMMIT' : 'DRY RUN'} ===\n`);
  console.log(`Proposed rows: ${proposedRows.length}`);
  console.log(`Schools affected: ${perSchoolCount.size}`);
  for (const [name, count] of perSchoolCount) console.log(`  ${name}: ${count} row(s)`);

  console.log(`\nSample of proposed rows (up to 15):`);
  for (const r of proposedRows.slice(0, 15)) {
    console.log(`  [${r.schoolName}] ${r.studentName} (${r.studentId}): ${r.fromClass} -> ${r.toClass}  (as of academic_year=${r.academicYearId}, semester=${r.semester})`);
  }

  if (!COMMIT) {
    console.log(`\nDry run only — no rows written. Re-run with --commit to insert them.`);
    await pool.end();
    return;
  }

  console.log(`\nCommitting ${proposedRows.length} rows with source='backfill'...`);
  let inserted = 0;
  for (const r of proposedRows) {
    await pool.query(
      `INSERT INTO class_history (school_id, student_id, from_class, to_class, academic_year_id, semester, source, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'backfill', NULL)`,
      [r.schoolId, r.studentId, r.fromClass, r.toClass, r.academicYearId, r.semester]
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} class_history rows.`);
  await pool.end();
}

run().catch(async e => {
  console.error('BACKFILL FAILED', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
