'use strict';
/**
 * Outstanding Submissions seed: 1 admin help entry covering the non-submitters
 * page — filters, status badges, table filters, diagnostic panel, and what
 * to do when teachers appear in the list.
 * Run once: node backend/seed-help-entries-outstanding-submissions.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'results',
    applicable_roles: ['admin'],
    title: 'Outstanding Submissions',
    body: `The Outstanding Submissions page lists every teacher-subject-class combination where results have not yet been submitted to the HOD for the selected semester. Open it from Outstanding Submissions in the left navigation.

Page subtitle: "Teachers who have not yet submitted results to the HOD."

An amber badge in the page header shows the total count of outstanding entries (e.g. "14 not submitted") whenever any are found.

Filters:

Two dropdowns appear in the filter bar:

Academic Year — a dropdown of all academic years. The current year is pre-selected and marked with ✦.
Semester — Semester 1 or Semester 2.

Changing either dropdown automatically reloads the list. A Refresh button reloads the data at any time without changing the filters.

What counts as "outstanding":

A teacher-subject-class entry appears in this list if the teacher has a timetable assignment for that subject and class but has not submitted their result to the HOD for the selected semester. The entry appears regardless of whether the teacher has:

Not started — no assessments or scores have been created at all.
Draft — the teacher has begun entering scores but has not yet submitted.
Rejected — a previous submission was returned by the HOD or admin and the teacher has not resubmitted.

Entries that are already submitted, HOD-approved, final-approved, or published do not appear.

Table filters:

Above the table, three dropdowns let you narrow the list:

Class — filter to a single class. Only classes that appear in the current outstanding list are shown.
Subject — filter to a single subject. Only subjects in the current list are shown.
Department — filter to a department (shown only when departments are set up). Only departments present in the list are shown.

Active filters are highlighted with a green background. A "Clear filters" link resets all three. A count on the right shows how many rows match the active filters out of the total (e.g. "5 of 14 outstanding").

Table columns:

Teacher — the name of the teacher assigned to this subject and class.
Department — the teacher's department, or "—" if not assigned.
Subject — the subject name.
Class — the class name.
Status — one of three badges:

"Draft" (amber) — the teacher has started but not submitted.
"Rejected — Needs Resubmission" (red) — a prior submission was returned; the teacher must correct and resubmit.
"Not Submitted to HOD" (grey) — no submission has been made at all for this entry.

What to do when entries appear:

Contact the teachers listed and remind them to complete score entry and submit from their Assessments page in the teacher portal. Teachers with a "Rejected" status should check the Assessments page for the rejection reason, fix the flagged issues, and resubmit.

Once a teacher submits, their entry moves to the Result Approvals page and disappears from this list.

Diagnostic panel:

If the page returns an error loading the list, or if the list is empty and you believe it should not be, a "Run Diagnostic" button appears below the message. Click it to open the Diagnostic panel.

The panel shows a step-by-step trace of how the outstanding list is built:

Timetable raw rows — how many timetable records exist for the selected year and semester.
Timetable after LATERAL unnest — how many distinct teacher-subject-class combinations are derived from those timetable rows.
Timetable after JOIN teachers — how many remain after matching timetable entries to teacher records.
Assessments raw — how many assessment records exist in the database for this period.
Assessments after JOIN teachers — how many assessments were successfully linked to a teacher.
Exam scores raw — how many exam score records exist.
Union candidates (all 4 sources) — the total unique teacher-subject-class candidates produced before filtering out completed submissions.

Each row shows a count coloured green (data found) or red (zero or error). Any pipeline error message is shown in small text beside the count.

Below the pipeline counts, the panel shows:

Result submissions by status — chips showing how many result submissions exist per status (draft, submitted, hod_approved, etc.) for the selected year and semester. This helps confirm whether submissions exist at all.
Sample timetable rows — up to 5 raw timetable records, showing teacher name, subject, and class. Use this to verify that timetable data is present and correctly associated with teachers.
Sample submission rows — up to 5 existing submission records with teacher, subject, class, and status. Use this to cross-reference which submissions the system already knows about.

If timetable raw rows is 0, the timetable for this year/semester has not been set up or has no teacher assignments — add timetable entries first. If the union candidate count is low but raw rows are high, the teacher JOIN is likely failing because teacher records are not linked to their timetable assignments. Contact support with the diagnostic output.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} outstanding submissions help entries…\n`);
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
