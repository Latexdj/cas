'use strict';
/**
 * Academic Years seed: 2 admin help entries covering the academic years page
 * (year management + expandable semester panel).
 * Run once: node backend/seed-help-entries-academic-years.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'academic_years',
    applicable_roles: ['admin'],
    title: 'Academic Years Overview',
    body: `The Academic Years page is where you define and manage the school's academic calendar. Go to Academic Years in the left navigation to open it.

Every piece of data in the system — attendance records, timetables, results, resumption registers, and more — is linked to an academic year and a semester. Keeping the academic year settings correct ensures that filters and reports across the entire portal show data for the right period.

The page shows a table of all academic years with these columns:

Year — the year's name, for example "2024/2025". Click the column header to sort.

Start and End — the year's overall start and end dates (shown in day-month-year format). These are optional but recommended for reference.

Semester — which semester is currently active within this year (Semester 1 or Semester 2).

Status — academic years marked as current display a green "Current" badge. Only one year should be marked current at a time. All other years show no badge.

Actions — each row has three controls:
  Semesters ▼ / Hide Semesters ▲ — expands or collapses a semester detail panel directly beneath the row.
  Edit — opens the edit modal for the year.
  Del — deletes the year after a confirmation prompt ("Delete academic year? This cannot be undone."). If the year has data attached (timetable slots, attendance records, etc.), deletion will fail and a message will appear saying "It may have data attached."

The table supports pagination if there are many years. Use the page size selector and navigation controls below the table.`,
  },

  {
    feature_area: 'academic_years',
    applicable_roles: ['admin'],
    title: 'Managing Academic Years and Semesters',
    body: `Adding a new academic year:

Click "+ Add Academic Year" in the top-right corner. A modal opens with these fields:

Year Name (required) — the label for the year, for example "2025/2026".

Start Date and End Date (optional) — the overall dates the academic year runs. These appear in the Year table for reference.

Current Semester — a dropdown set to Semester 1 or Semester 2. This tells the system which semester is currently active for attendance tracking, timetable display, and all other semester-scoped features.

Mark as current academic year — a checkbox. Tick this for the year that is currently running. The system uses the "current" year and its active semester as the default context across the admin portal (attendance pages, timetable, reports, etc.). Only one year should be current at a time — marking a new year as current does not automatically un-mark any previous year, so untick the old year manually if needed.

Click Save to create the year. It appears in the table immediately.

Editing an academic year:

Click Edit on any row to reopen the same form with the year's current values. Change any field and click Save. This is how you switch from Semester 1 to Semester 2 mid-year: edit the current year and change Current Semester to Semester 2.

Managing semesters within a year:

Click "Semesters ▼" on a year row to expand the semester panel beneath it. The panel shows all semesters defined for that year and lets you add or edit them individually.

Click "+ Add Semester" to open the semester form inline:
  Number — Semester 1 or Semester 2. If a semester with that number already exists for this year, it is greyed out and marked "(exists)" in the dropdown.
  Name — a display label, for example "First Semester." The placeholder text suggests the standard name for whichever number you selected.
  Start Date and End Date (optional) — the dates this specific semester runs.

Click "Add Semester" to save. The semester appears in the panel's mini-table showing Number, Name, Start, and End.

Click Edit on any semester row to update its details. Click Del to remove it after a confirmation prompt ("Remove?"). Removing a semester does not delete year-level data, but any records scoped to that semester number may no longer display correctly, so remove with care.

Click "Hide Semesters ▲" to collapse the panel when done.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} academic years help entries…\n`);
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
