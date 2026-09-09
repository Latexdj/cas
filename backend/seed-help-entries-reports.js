'use strict';
/**
 * Reports seed: 9 help entries covering all Reports pages across admin and management portals.
 * Run once: node backend/seed-help-entries-reports.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Main Reports page ────────────────────────────────────────────────────────

  {
    feature_area: 'reports',
    applicable_roles: ['admin'],
    title: 'Reports Page Overview',
    body: `The Reports page gives you tabular breakdowns of your school data across students, teachers, and academic performance. Go to Reports in the left menu to open it.

The page has a left sidebar listing every available report, grouped into three sections: Student Reports, Teacher Reports, and Academic Reports. Click any report name to load it in the main area. On a small screen, use the menu icon at the top left to open the sidebar as a drawer.

The current report name and category appear as a heading above the table. A Status toggle in the top-right corner lets you switch between Active Only (default, showing current enrolled students or active teachers) and All (showing all records regardless of status). Changing the toggle reloads the report immediately.

Every report displays as a table with a dark header row naming each column, alternating row shading for readability, and a totals row at the bottom that sums up the numeric columns. If no data matches your filters, the table shows a "No data found" message instead.`,
  },

  {
    feature_area: 'reports',
    applicable_roles: ['admin'],
    title: 'Student Reports',
    body: `Student Reports are listed at the top of the sidebar. Each one breaks down your student population by a different attribute. All figures reflect the status filter (Active Only or All) you have selected.

Program Distribution — how many students are enrolled in each program (e.g. Science, Business, Arts). Includes a percentage column showing each program's share of the total.

Program Distribution by Residential Status — the same program breakdown, split further by whether students are Day or Boarding. Useful for comparing residential populations across programs.

Class Distribution — how many students are in each class (e.g. Form 1A, Form 2B). Includes student count and percentage per class.

House Distribution — how many students belong to each house. Includes count and percentage.

Religion Distribution — how many students belong to each religion category.

Religious Denomination Distribution — a finer breakdown within each religion, showing individual denomination counts.

Age Distribution — how many students fall into each age group. Helps identify unusually young or old cohorts.

Aggregate Range Distribution — how many students fall into each BECE aggregate band (for schools that collect entry aggregate scores). Shows the spread of academic entry levels.

All student reports include a School Total row at the bottom summing the counts across all groups.`,
  },

  {
    feature_area: 'reports',
    applicable_roles: ['admin'],
    title: 'Teacher Reports',
    body: `Teacher Reports are listed below Student Reports in the sidebar. Each one profiles your teaching staff by a different attribute. The Status toggle (Active Only or All) applies here too.

Gender Summary — the number of male and female teachers, with percentages.

Department Distribution — how many teachers are assigned to each department.

GES Rank Distribution — how many teachers hold each Ghana Education Service rank (e.g. Assistant Headmaster, Senior Teacher). Useful for understanding the seniority profile of your staff.

Qualification Distribution — the highest academic qualification held by teachers in each group (e.g. Degree, HND, Diploma).

Association Distribution — how many teachers belong to each professional association (e.g. NAGRAT, CCT, GNAT).

All teacher reports include a School Total row at the bottom.`,
  },

  {
    feature_area: 'reports',
    applicable_roles: ['admin'],
    title: 'Academic Reports',
    body: `Academic Reports appear at the bottom of the sidebar. These reports are based on student assessment results rather than demographic data, so they require you to choose an academic year and semester before the data loads.

Two filter dropdowns appear in the top bar when any Academic Report is selected: Academic Year and Semester. These default to the current year and current semester. Change them to view historical data.

The four academic reports are:

Class Performance Summary — for each class, shows the number of students, average score, pass rate, and highest and lowest scores in the selected semester. Gives a quick comparison of how each class performed overall.

Subject Pass Rate — for each subject taught in the selected semester, shows how many students sat assessments, how many passed, and the pass rate percentage. Useful for identifying subjects where students are consistently struggling.

At-Risk Students — lists individual students whose average score has fallen below the pass threshold. Shows the student name, class, average score, and number of subjects failed. Use this to identify students who need intervention.

Grade Distribution — shows how many students received each grade (e.g. A1, B2, C4, F9) for a specific class. This report requires you to type a class name in the Class Name field and press Enter before it loads. It shows the full grade spread for that one class in the chosen semester.`,
  },

  {
    feature_area: 'reports',
    applicable_roles: ['admin'],
    title: 'Exporting and Printing Reports',
    body: `Every report on the Reports page can be exported to Excel or printed as a PDF. Both buttons are in the top-right corner of the page, to the left of the Status toggle. They are disabled while a report is loading or if no data has been returned yet.

Excel button — downloads the current report as an .xlsx file. The file is named after the report (for example, "Program Distribution.xlsx"). Open it in any spreadsheet application to sort, filter, or use the data further. Academic reports include the year and semester in the exported data.

Print button — opens the browser's print dialog. The page is set up so that only the report table is included when you print; the sidebar, top bar, and all filters are hidden. Use your browser's "Save as PDF" option in the print dialog to save a PDF copy instead of printing on paper.

Both exports always reflect the current filter state: the active Status toggle and, for Academic Reports, the selected year, semester, and class name.`,
  },

  // ── Admissions Reports ───────────────────────────────────────────────────────

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Admissions Reports',
    body: `The Admissions Reports page gives you an overview of how this year's admission cycle is progressing. Open it from Admissions in the left menu, then select Reports from the admissions sub-menu.

At the top of the page, seven stat cards show counts for each stage of the admissions pipeline:

Placed — students placed by CSSPS (the school selection system) who appear in the CAS admissions list.
Registered — students who have started or completed the online registration form.
Pending — students whose registration form has been started but not fully completed.
Completed — students whose form is fully filled in.
Reported — students who have physically reported to the school.
Migrated — students whose records have been transferred into the main student database.
Total — the overall number of students in the admissions list.

Below the stat cards, a Pipeline section shows the same stages as a horizontal bar chart, with each bar proportional to the number of students at that stage relative to the total placed. This makes it easy to see at a glance how many students have dropped off between placement and migration.

Four distribution charts below the pipeline break down the admitted students by Program, House, Gender, and Residential Status (Day or Boarding). Each chart shows a horizontal bar for each category with the count beside it.`,
  },

  // ── Library Reports ──────────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library Reports',
    body: `The Library Reports page shows circulation statistics and overdue tracking for the school library. Open it from Library in the left menu, then select Reports.

Date filter — a From and To date picker at the top lets you limit the Circulation Summary and Most Borrowed Titles to a specific period. Click Apply Filter to reload those sections with the selected range. Click Clear to remove the date filter and show all-time data. The overdue loans list always shows current outstanding loans regardless of the date filter.

Circulation Summary — six stat cards showing:
Total Issues — the number of times books have been checked out in the period.
Total Returns — the number of books returned.
Currently Out — books currently on loan that have not been returned.
Currently Overdue — books that are past their due date and still out.
Fines Assessed — the total value of fines generated for late returns (in GH₵).
Fines Collected — the amount of those fines that has been paid.
If there is an outstanding balance between fines assessed and collected, an amber alert appears below the cards showing the outstanding amount.

Overdue Aging — a bar chart grouping overdue loans into three severity bands: Mild (1 to 7 days overdue), Moderate (8 to 21 days), and Severe (more than 21 days). The bar width shows each band's proportion of total overdue loans.

Most Borrowed Titles — a ranked table of books by borrow count. Shows the title, author, and number of times borrowed in the selected period (or all time if no date filter is set). A small progress bar beside each title shows it relative to the most-borrowed book.

Current Overdue Loans — a full list of every book currently overdue, regardless of the date filter. Each row shows the book title, copy number, the student's name, student code, class, the due date, how many days overdue it is, and the fine status. Days overdue appears as a coloured badge: amber for mild, orange for moderate, red for severe. Rows for severe overdue loans have a red-tinted background. Fine amounts are shown in green if paid, grey if waived, and red if still outstanding. The table footer shows the total unpaid fines across all overdue loans.`,
  },

  // ── Primary School Report Approvals ─────────────────────────────────────────

  {
    feature_area: 'primary',
    applicable_roles: ['admin'],
    title: 'Primary School Report Card Approvals',
    body: `The Report Approvals page is in the Primary School section of the admin portal. It lets you review and approve the end-of-term report cards that class teachers have submitted.

Start by selecting the Academic Year and Term from the filter dropdowns at the top. Once a term is selected, the page shows an overview grid with one card per class.

Each class card shows: the class name, the term name, and four count tiles — Draft (reports started but not submitted), Submitted (ready for approval), Approved, and Rejected. A progress bar below the counts shows the percentage of students whose report has been approved.

Click any class card to drill into that class. The drill-down view lists every student in the class with their name, admission number, and the current status of their report card (Draft, Submitted, Approved, or Rejected).

Students with a Submitted report show two buttons: Approve and Reject.

Approve — opens a panel where you can enter optional headmaster remarks, then confirm the approval. Approved reports are released to students and parents.

Reject — opens the same panel with a field for the reason for rejection. The teacher will need to revise and resubmit.

Headmaster remarks entered during approval are printed on the report card. Remarks entered during rejection are shown to the teacher as the reason to address before resubmission.

Use the All Classes button to go back from the class drill-down to the overview grid.`,
  },

  // ── Principal (management) Reports ──────────────────────────────────────────

  {
    feature_area: 'reports',
    applicable_roles: ['management'],
    title: 'Reports (Principal View)',
    body: `The Reports page in the management portal gives the principal a read-only view of the same student and teacher distribution data available to the school administrator.

Use the Students and Teachers toggle to switch between the two categories. Then choose the specific report from the dropdown beside it. A Status dropdown lets you view Active Only records (the default) or All records.

The report table loads automatically when you change any of these controls. It shows the same breakdown as the admin version: category names in the first column, numeric counts and percentages in the remaining columns, and a totals row at the bottom.

There are no export or print buttons in this view. If you need a printed or spreadsheet copy of a report, ask your school administrator to export it from the admin portal.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} reports help entries…\n`);
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
