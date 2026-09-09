'use strict';
/**
 * Transcript seed: 1 admin help entry covering the full student academic
 * transcript page — search, cumulative stats, performance trend, semester
 * accordion, best semester callout, and the printed A4 document.
 * Run once: node backend/seed-help-entries-transcript.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'results',
    applicable_roles: ['admin'],
    title: 'Student Academic Transcript',
    body: `The Transcript page generates a complete academic history for any student across all years and semesters on record. It is an admin-only page — go to Transcript in the left navigation to open it.

Page subtitle (in empty state): "Full academic history across all years and semesters."

Searching for a student:

Type the student's name or student ID code into the "Search Student" field. A dropdown appears below the field showing up to 10 matching students — each result shows the student's photo (or an avatar), their full name, student ID, class, and programme. Click any row to load their transcript. The × button on the right of the search field clears the current selection.

If no match is found, a "No students found" message appears in the dropdown.

Cumulative statistics:

Once a student is selected and their transcript loads, four summary tiles appear at the top:

Cumulative Average — the mean of all semester averages across the student's full academic record.
Total Semesters — how many semesters have results on record.
Subjects Sat — total number of individual subject results (across all semesters).
Pass Rate — the percentage of all subject results where the student scored 50% or above. Shown in green if ≥ 70%, amber otherwise.

Performance Trend chart:

A horizontal bar chart below the stats shows the student's average score for each semester in order. Bars are colour-coded: green for ≥ 70, amber for 50–69, red for < 50. The average is printed inside the bar (or beside it for very low scores). The class position (e.g. "3rd/28") is shown on the right of each bar.

Academic Record — semester accordion:

All semesters are listed as collapsible cards below the trend chart. Each card header always shows:
A colour-coded side stripe (green/amber/red based on the average).
The academic year and semester number, with the class name in small grey text.
The number of subjects and how many were passed (e.g. "6 subjects · 5/6 passed").
The semester average (large, colour-coded), class position (e.g. "4th/30"), and overall grade badge.
A chevron arrow that rotates when the card is expanded.

Click any card header to expand or collapse it. Expanded cards show a subject table with columns: Subject, CA Score, Exam Score, Total, Grade, and Remark. A "Semester Summary" footer row repeats the average, overall grade, and class position.

"Expand all" / "Collapse all" toggle:

A button above the accordion instantly expands or collapses all semesters at once. All semesters start expanded when a transcript first loads.

Best Academic Performance callout:

At the bottom of the transcript, a green banner highlights the student's single best semester: the academic year, semester number, average, and overall grade.

Student identity panel:

Below the search box, a panel shows the student's photo, full name, student ID, programme, class, and gender. A "Print Transcript" button sits at the right of this panel.

Printing the transcript:

Click "Print Transcript" to open the browser's print dialog. The printed A4 document is a formal "Official Academic Transcript" that includes:

Header: school logo, school name and address, document title, and the student's photo.
Student Info: Full Name, Student ID, Programme, Class, Gender, and Issue Date (today's date, automatically filled).
Cumulative Summary boxes: Cumulative Average, Total Semesters, Total Subjects Sat, Overall Pass Rate.
Academic Record: every semester listed chronologically — each block has a green header bar with the year, semester, class, average, position, and grade; then a subject table (Subject, CA Score, Exam Score, Total, Grade, Remark) with alternating row shading.
Grade Reference panel: the full WAEC/GES grade scale (A1–F9) with score ranges and descriptors.
Signature lines: Head of Academics & Date, School Stamp, Headmaster's Signature & Date, with "Certified True Copy" centred above.

If the student has no results on record, the page shows an empty state: "No academic records found for [student name]. Results will appear here once assessments or imports are available."`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} transcript help entries…\n`);
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
