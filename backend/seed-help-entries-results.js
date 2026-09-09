'use strict';
/**
 * Results seed: 3 help entries — 1 admin (Results overview + report cards +
 * CSV import + remarks), 1 teacher (results view + rejection workflow),
 * 1 student (My Results, trend chart, print report card).
 * Run once: node backend/seed-help-entries-results.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entry ───────────────────────────────────────────────────────────────

  {
    feature_area: 'results',
    applicable_roles: ['admin'],
    title: 'Results — Admin View',
    body: `The Results page is where you view, print, and manage end-of-semester report cards for all students, and import historical results from a CSV file. Go to Results in the left navigation to open it.

Filter bar:

Three filters at the top control which results are shown:

Academic Year — a dropdown of all academic years. The current year is selected automatically and marked with ✦.
Semester — Semester 1 or Semester 2.
Class — a dropdown of all classes. Results only load after you select a class.

When a class is selected, results load automatically. The table header confirms: "ClassName · YearName · Semester N · N students."

Results table:

The table is sorted by class position (1st place first). Columns:

Pos — the student's class position (1st, 2nd, 3rd, …).
Student — full name and student ID code.
Subjects — the number of subjects the student sat.
Average — the student's overall average score, colour-coded: green for ≥ 70, amber for 50–69, red for < 50.
Grade — the overall grade badge (green for A-range, amber for C/D-range, red for F-range).
Remarks — the attitude rating entered in the Form Teacher's Remarks, if one has been saved.
Actions — "View →" and a Print icon.

Viewing a student's full report:

Click "View →" on any row to open a slide-in panel from the right. The panel shows:
The student's name, code, class, year, and semester in the header, plus a "Print Card" button.
Three summary stats: Average, Class Position (e.g. "3rd / 28"), and Overall Grade.
A Subject Breakdown table with columns: Subject, CA (showing the CA weighting as "CA (N%)"), Exam (showing "Exam (N%)"), Total, Grade, Position (the student's position in that subject, e.g. "2nd/28"), and Remarks.
A Form Teacher's Remarks section (shown only if remarks have been saved for this student), displaying Attitude, Conduct, and General Remarks.

Printing report cards:

Print a single student: click the Print icon in the results table, or click "Print Card" inside the slide-in panel. Only that student's A4 report card is sent to the printer.

Print all students in the class: click "Print All (N)" at the top right of the filter bar. All students' report cards are printed in one job, one page per student.

The printed A4 report card includes:
Header: school logo, school name and address, "Student Academic Report Card," academic year, and semester. Student photo on the right (or a gender-appropriate avatar if no photo is on file).
Student Info panel: Full Name, Class, Student ID, Programme.
Summary boxes: Class Average, Class Position, Overall Grade, Subjects Sat.
Attendance (if available): Periods Present, Late, Absent, Total Periods.
Subject Breakdown table: each subject's CA score, exam score, total (colour-coded), grade (colour-coded), class position in that subject, and subject remark.
Performance Overview bar chart: a horizontal bar for each subject, coloured green (≥ 70), amber (50–69), or red (< 50).
Form Teacher's Remarks: Attitude, Conduct, and General Remarks.
Signature lines: Class Teacher's Signature & Date, Next Term Begins, and Headmaster's Signature & Date (headmaster's signature image is printed automatically if one has been uploaded in School Profile).

Editing Form Teacher's Remarks:

Click "Edit Remarks" (shown when results are loaded). A modal opens with a table of all students in the class. For each student, choose from Attitude (Excellent / Very Good / Good / Fair / Poor) and Conduct (same options) dropdowns, and type a free-text General Remarks entry. Click "Save Remarks" when done. Saved remarks appear on the results table and on printed report cards.

Importing historical results:

Click "Import Historical" (always visible, regardless of filter). A modal opens.

Expected CSV columns: Timestamp · Student ID · Student Name · Academic Year · Semester · Subject · Category · Class Score · Exam Score · Total Score · Grade · Remarks. The Timestamp, Student Name, and Category columns are ignored during import — only Student ID, Academic Year, Semester, Subject, and score/grade columns are used.

Upload a CSV file using "Choose file…" or paste the CSV text directly into the text area. A preview table shows the first 10 rows so you can verify the mapping before importing. The "Import N rows" button shows how many rows will be processed.

For large files, the import is sent in chunks of 2,000 rows and a progress bar tracks the upload. After import, a summary shows Total, Inserted, Updated, and Skipped counts. Any rows that could not be imported are listed in an error table with the row number, student ID, and reason.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'results',
    applicable_roles: ['teacher'],
    title: 'Results — Teacher View',
    body: `The Results page in the teacher portal shows the end-of-semester report card data for your classes. Open it from Results in the teacher portal navigation. The page subtitle reads: "End-of-semester report cards."

Filter bar:

Three controls appear at the top:
Academic Year — a dropdown defaulting to the current year. A "(current)" label marks it.
Semester — Semester 1 or Semester 2.
Class — select a class from the dropdown to load its results. Results only display after a class is chosen.

Rejection warnings:

If any of your result submissions have been returned for editing by the head of department or admin, a red warning panel appears above the results list. Each rejected submission shows:
The subject name and class.
The rejection reason or HOD comment in italics.
A note: "Edit your scores and resubmit from the Assessments page."

Go to the Assessments page (CA Register or Exam Results) to correct the scores and resubmit. The rejection warning clears once the submission is approved.

Results list:

When a class is selected and results are available, the students are listed in order of class position. Each row shows:
A numbered circle (position) in your school's colour on the left.
The student's full name in bold and their student ID code below it.
On the right: the student's average score (in your school's colour) and overall grade below it.
A right-arrow chevron indicating the row is tappable.

Tap any student row to open a slide-in detail panel.

Student detail panel:

The panel opens from the bottom of the screen on mobile, or centred on larger screens. It shows:

Header: the student's name and code, the class name, and the semester.
Three summary cards: Average, Position (e.g. "4th / 32"), and Grade.
Attendance section (if data is available): four tiles showing Periods Present (green), Late (amber), Absent (red), and Total Periods.
Subject Breakdown table: columns are Subject, CA, Exam, Total (shown in your school's colour), Grade, Pos (class position in that subject, e.g. "3rd/32"), and Remark. Subjects imported from the CSV historical import are marked with a small "IMP" badge next to the subject name.

Close the panel by tapping the × button in the top-left corner or tapping outside the panel.

Note: you can view results here but you cannot edit scores or grades from this page. Score entry and submission are done from the CA Register and Exam Results pages in the Assessments section.`,
  },

  // ── Student entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'results',
    applicable_roles: ['student'],
    title: 'My Results',
    body: `The Results page shows your end-of-semester academic report card. Open it from Results or Report Card in the student portal navigation.

Filter bar:

At the top, two dropdowns let you select the Academic Year and Semester you want to view. The current year and semester are selected automatically. A "Print Report Card" button appears on the right — it becomes active once your results have loaded.

Summary cards:

Three cards appear at the top of your results:
Average — your overall percentage for the semester, with your overall grade shown below it.
Position — your class position (e.g. "4th"), with "of N" showing how many students are in your class.
Subjects — the number of subjects you sat, with "N passed" below showing how many you scored 50% or above in.

Class average comparison:

Below the summary cards, a pill shows how your average compares to the class:
"+X% above class" (green) — you scored above the class average.
"X% below class" (red) — you scored below the class average.
"At class average" (grey) — your average matches the class exactly.

At-risk alert:

If your average is below 40%, a red warning banner appears: "Average below 40% — Speak with your form teacher or subject teachers for support." This is a private alert only visible to you.

Subject table:

Your subjects are listed in a table with these columns:
Subject — the subject name.
CA — your continuous assessment score.
Exam — your exam score.
Total — your combined total score, colour-coded green (≥ 70), amber (50–69), or red (< 50). The class average for that subject is shown in small grey text beside your score (e.g. "(class avg: 63%)") so you can compare yourself to your classmates.
Grade — your grade for the subject, shown as a coloured pill.
Remark — the grade remark (e.g. "Excellent", "Credit") and any subject-specific note from your teacher.

A footer row at the bottom of the table shows your overall average, overall grade, and class position.

Form Teacher's Remarks:

If your form teacher has added remarks for this semester, they appear in a warm-coloured panel below the subject table. The panel shows three fields: Attitude, Conduct, and General Remarks.

Grade Legend:

A colour-coded legend at the bottom of the page shows what each grade letter (A, B, C, D, E, F) represents by colour.

Performance Trend chart:

If you have results for more than one semester, a line chart appears showing your average score across all semesters. Each data point is labelled with your percentage and sits above the semester label (academic year, semester number, and grade). This chart lets you track your progress over time.

Below the chart, chips show how many subjects you sat per semester.

Best Semester callout:

A highlighted banner shows your best-ever semester: "Best Semester: {label}: {average}% ({grade})".

Printing your report card:

Click "Print Report Card" to open the print dialog. The printed A4 report card includes your school's logo and address, your photo (or an avatar if none is on file), your name and student ID, class, and programme, a summary of your average, position, grade, and subjects sat, your attendance record (if available), a full subject breakdown with CA, exam, and total scores, a performance bar chart, your form teacher's remarks, and signature lines for the class teacher and headmaster.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} results help entries…\n`);
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
