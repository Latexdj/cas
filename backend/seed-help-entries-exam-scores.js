'use strict';
/**
 * Exam Scores seed: 1 admin help entry covering the Exam Scores admin page —
 * filters, the exam-batch table, Edit modal, and Delete modal with audit log.
 * Run once: node backend/seed-help-entries-exam-scores.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'assessments',
    applicable_roles: ['admin'],
    title: 'Exam Scores — Admin View',
    body: `The Exam Scores page lets admins view and correct the end-of-semester exam scores entered by teachers across all subjects, classes, and academic years. Open it from Exam Scores in the left navigation.

Page subtitle: "View and correct end-of-semester exam scores across teachers, subjects, and academic years."

Filters:

Five controls appear in the filter bar:

Academic Year — a dropdown of all academic years. Defaults to the current year.
Semester — All Semesters, Semester 1, or Semester 2.
Teacher — a dropdown to filter to one teacher's exam batches.
Subject — a text input; type any part of a subject name to filter. Press Enter or click Apply.
Class — a text input; type any part of a class name to filter. Press Enter or click Apply.

Click Apply (or press Enter in any text field) to reload the table with the selected filters.

Exam Scores table:

The table shows one row per exam batch — a unique combination of teacher, subject, class, year, and semester. A count of batches is shown above the table. Columns:

Teacher — the teacher who entered the scores. Click the column header to sort.
Subject — the subject the exam belongs to. Sortable.
Class — the class the exam is for. Sortable.
Year / Sem — the academic year and semester (e.g. "2024/25 · Sem 1").
Max — the maximum score set for this exam.
Scores — the number of students who have exam scores entered, shown as "N / class_size." Displayed in green if at least one score is entered. Sortable.
Last Saved — the date the scores were most recently saved (the submission timestamp). Sortable.
Actions — Edit and Delete buttons.

Editing an exam batch:

Click Edit on any row to open the Edit Exam Scores modal. The modal header confirms the subject, class, and how many scores are currently entered.

If any scores have been entered, an amber notice warns: "N scores will be moved to the updated period / subject / class." This is important — changing the year, semester, subject, class, or teacher reassigns all existing scores to the new values.

Fields available to edit:

Academic Year — move the batch to a different year.
Semester — change between Semester 1 and Semester 2.
Subject — correct the subject name.
Class — correct the class name.
Teacher — reassign the batch to a different teacher.
Max Score — change the maximum marks (must be greater than 0).

Click Save Changes to apply. Click × or Cancel to close without saving.

Deleting exam scores:

Click Delete on any row to open the Delete Exam Scores confirmation modal. The modal shows:
The number of scores that will be permanently deleted.
The subject, class, academic year, and semester.
The teacher's name.
A note: "The teacher will be notified and the action will be recorded in the audit log."

A Reason for deletion field (required) — type the reason before confirming, e.g. "Wrong semester selected" or "Duplicate entry." The Delete Scores button is disabled until a reason is entered.

Click Delete Scores to permanently remove all exam scores in the batch. This action cannot be undone. Click Cancel to close without deleting.

Note: The Exam Scores page covers only the end-of-semester exam component of a teacher's submission. CA (continuous assessment) scores are managed separately in the Assessments page. The teacher's own exam score entry screen is accessed from their Assessments section in the teacher portal.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} exam scores help entries…\n`);
  let inserted = 0;
  let skipped  = 0;

  for (const e of ENTRIES) {
    const { rowCount } = await pool.query(
      `INSERT INTO help_entries (school_id, feature_area, applicable_roles, title, body, is_active)
       SELECT NULL, $1, $2, $3, $4, true
       WHERE NOT EXISTS (
         SELECT 1 FROM help_entries WHERE school_id IS NULL AND title = $3
       )`,
      [e.feature_area, e.applicable_roles, e.title, e.body]
    );
    if (rowCount > 0) {
      inserted++;
      console.log(`  ✓  ${e.title}`);
    } else {
      skipped++;
      console.log(`  –  ${e.title} (already exists)`);
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);

  const { rows } = await pool.query(
    `SELECT applicable_roles[1] AS role, COUNT(*) AS n
     FROM help_entries WHERE school_id IS NULL AND is_active = true
     GROUP BY 1 ORDER BY 1`
  );
  console.log('\nTotal active global entries by role:');
  rows.forEach(r => console.log(`  ${r.role.padEnd(12)} ${r.n}`));

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
