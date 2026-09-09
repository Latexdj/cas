'use strict';
/**
 * Assessment Tracker seed: 1 admin help entry covering the monitoring page —
 * filters, KPI tiles, teacher accordion, subject detail rows, Details modal,
 * status meanings, and the printable PDF report.
 * Run once: node backend/seed-help-entries-assessment-tracker.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'assessments',
    applicable_roles: ['admin'],
    title: 'Assessment Tracker',
    body: `The Assessment Tracker is an admin monitoring page that shows how far every teacher has progressed with entering CA scores and exam scores for the current semester. Go to Assessment Tracker in the left navigation to open it.

Page subtitle: "Monitor score entry completion across all teachers, subjects, and assessment modes."

Filters:

Five dropdowns and two action buttons appear in the filter bar:

Academic Year — select the year to monitor.
Semester — Semester 1 or Semester 2.
Department — filter to one department, or leave as "All Departments."
Teacher — filter to a single teacher, or leave as "All Teachers."
Status — filter the teacher list to show only rows with a specific status (see status meanings below).

Refresh button — reloads the data with the current filter settings.
Print / PDF button — generates a printable A4 landscape report (see Printing below). Disabled until data is loaded.

Summary KPI tiles:

Six count tiles appear below the filters:

Total Assignments — the total number of teacher-subject-class combinations being tracked.
Not Started (red) — no CA scores or exam scores have been entered at all.
In Progress (amber) — some scores have been entered but not all modes are complete.
Scores Complete (blue) — all CA modes and exam scores are fully entered; not yet submitted.
Submitted (darker blue) — the teacher has submitted for HOD or admin review.
Published (dark green) — results have been approved and published to students.

Status meanings:

Not Started — no assessments created and no students scored.
In Progress — at least one assessment exists or at least one student has a score, but not all modes are complete.
Scores Complete — all CA assessment modes have full scores and all exam scores are entered for every student in the class.
Submitted — the teacher has formally submitted their results for review. An HOD or admin must approve before publication.
HOD Approved — the head of department has approved the submission; awaiting final admin sign-off.
Final Approved — admin has given final approval; awaiting publication.
Published — results are live and visible to students on their Results page.

The worst status across a teacher's subjects is shown on the teacher header row.

Teacher accordion:

Each teacher appears as a collapsible card. The card header shows:
The teacher's name and department.
Number of subjects assigned (e.g. "4 subjects").
A horizontal progress bar with a completion percentage (average across all the teacher's subjects).
A "N not started" badge in red if any subjects have not been started.
The teacher's worst status badge.
A chevron arrow that rotates when expanded.

Click any teacher header to expand or collapse their subject rows.

Subject detail rows (expanded):

When a teacher card is expanded, a table appears with one row per subject-class assignment. Columns:

Subject — the subject name.
Class — the class being taught.
Students — the total number of students in that class.
CA Modes — how many CA assessment modes are complete out of the total (e.g. "2 / 3"). Coloured green if all done, amber if partial, red if none.
Exam Scores — how many students have exam scores entered out of the total (e.g. "28 / 30"). Coloured green if all entered, amber if partial, red if none.
Completion — the overall completion percentage for this subject, combining CA modes and exam scores. Coloured green (100%), amber (>50%), or red (≤50%).
Status — the status badge for this specific subject-class.
Details button — opens the Details modal for this row.

Details modal:

Clicking "Details" on any subject row opens a modal showing a breakdown per assessment mode. The modal header shows the subject, class, teacher name, and student count. A progress bar at the top shows the overall completion fraction (e.g. "3 / 4 complete · 75%").

The modal table has one row per CA mode, plus a final "Exam Scores" row. Columns:

Mode — the assessment mode name (e.g. "Class Test 1", "Mid-term Exam").
Created — the number of assessments created for this mode (should be at least 1).
Scored — how many students have scores entered out of the class total.
Status — ✓ Done (green) if all students are scored; ⚠ Incomplete (amber) if some are scored; ✗ Not Started (red) if no assessments or scores exist.

Close the modal with the × button or the "Close" button.

Printing the report (Print / PDF):

Click "Print / PDF" to open the browser's print dialog. The report is formatted for A4 landscape paper. It includes:

A dark green header bar with the report title, year, semester, date, and a count of teachers with outstanding entries.
A summary strip showing all six KPI counts.
A section listing every teacher who has incomplete entries — each teacher block shows their name, department, incomplete subject count, and a mini progress bar. A subject table beneath lists each incomplete subject with: Subject, Class, Students, Outstanding CA Modes (which specific modes are missing, e.g. "Class Test 1 (not started), Project (14/30 students)"), Exam Scores status, and Completion percentage.
A final "All entries complete" panel listing the names of all teachers who are fully done.
A footer with the generation date and time.

If all teachers are fully complete, the outstanding section is replaced with a single "✓ All teachers have completed their score entries" message.

The report is intended as a follow-up tool: print it, identify which teachers still have outstanding entries, and contact them directly.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} assessment tracker help entries…\n`);
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
