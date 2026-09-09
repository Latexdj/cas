'use strict';
/**
 * School Calendar seed: 4 help entries — 3 admin (overview, holidays/events tab,
 * vacation/exam tab) + 1 student (read-only calendar view).
 * Run once: node backend/seed-help-entries-school-calendar.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'school_calendar',
    applicable_roles: ['admin'],
    title: 'School Calendar Overview',
    body: `The School Calendar page is where you publish the school's official calendar for students, staff, and parents. Go to School Calendar in the left navigation to open it.

The page subtitle reads: "Holidays, vacations and examination periods."

A year selector in the top-right corner lets you view and edit the calendar for a specific calendar year. It shows the previous year, the current year, and the next year. Changing the year reloads all three tabs for that period.

The page is organised into three tabs:

Holidays & Events — individual calendar entries for specific dates: public holidays, school events, and closed days. These entries appear on the student-facing calendar. Each entry can optionally carry a time range to indicate that only lessons during that window are affected, or it can apply to the whole day.

Vacation — multi-day vacation periods (e.g. Christmas Holiday, Long Vacation). Defining a vacation period pauses absence detection for all lessons that fall within it, so students are not flagged as absent during school holidays.

Exam Periods — multi-day examination windows (e.g. WASSCE 2025). Defining an exam period also pauses regular absence detection for those dates, since teachers are on invigilation duty rather than teaching.

Each tab shows a count badge with the number of entries for the selected year.

The student-facing calendar (accessible from the student portal) shows all Holidays & Events entries grouped by month. Vacation and exam periods are not shown directly to students, but they affect how their attendance is processed.`,
  },

  {
    feature_area: 'school_calendar',
    applicable_roles: ['admin'],
    title: 'School Calendar — Holidays and Events',
    body: `The Holidays & Events tab is where you add individual dated entries to the school calendar.

Adding an entry:

Click "+ Add Entry" to open the entry form. Fill in the following fields:

Date (required) — the date of the holiday or event.

Type (required) — one of three options:
  Holiday (red badge) — a public holiday or school holiday when no lessons run.
  School Event (blue badge) — an in-school event such as a sports day, open day, or assembly.
  Closed Day (orange badge) — a day when the school is closed for any other reason.

Name (required) — a descriptive label for the entry, for example "Independence Day" or "Founders' Day Sports."

Notes (optional) — additional information visible in the calendar list.

Start Time and End Time (both optional) — if you set both times, only lessons that fall within that window are treated as affected by the event. A note below the time fields confirms this: "Only lessons from {start}–{end} will be affected." If you leave the times blank, the entry is treated as a whole-day event: "No times set — affects all lessons on this day."

Click "Save Entry" to add it to the calendar.

Viewing entries:

Entries are displayed grouped by month, each group as a separate table. Columns are: Date (weekday + day + month), Name, Type badge, Time range (or "Whole day"), and Notes.

Editing an entry:

Click Edit on a row. The row highlights amber and an edit form expands beneath it. Update any field and click "Save Changes." Click Cancel to close without saving.

Fix Absences:

The "Fix Absences" button re-runs absence clearing for a calendar entry. If a holiday was added after attendance had already been recorded for that date, some students may have been incorrectly marked absent. Clicking Fix Absences retrospectively excuses those records. An alert appears showing how many records were corrected (or "No outstanding absences found" if there was nothing to fix).

Removing an entry:

Click Remove and confirm the prompt "Remove '{name}' from the school calendar?" Removal is permanent. To retrospectively un-excuse absences after removal, you would need to use the attendance management tools directly.`,
  },

  {
    feature_area: 'school_calendar',
    applicable_roles: ['admin'],
    title: 'School Calendar — Vacation and Exam Periods',
    body: `The Vacation tab and the Exam Periods tab both let you define multi-day periods that affect how absence detection works. They share the same form and table layout but have different effects.

Vacation Periods (teal):

A vacation period is a range of dates when school is on holiday — for example, "Long Vacation 2025" from 20 Jul to 1 Sep. During a vacation period, absence detection is paused for all lessons that fall within the range. Students will not be flagged as absent for lessons on those dates, even if attendance has been recorded.

Click "+ Add Vacation" to open the form:
  Name (required) — a descriptive label, e.g. "Easter Break 2025."
  Start Date (required) — first day of the vacation.
  End Date (required) — last day (inclusive). The end date must be on or after the start date.

A duration preview appears as you fill in the dates (e.g. "14 days"). A note confirms: "Absence detection is paused for the entire period."

When you save a vacation period, any existing absence records that fall within those dates are automatically excused. An alert shows the count: "Saved. N false absence records from this period were automatically excused." If there were no outstanding absences to fix, no alert appears.

Exam Periods (purple):

An exam period marks a window when teachers are on invigilation duty and regular class attendance is not expected — for example, "WASSCE 2025" from 5 May to 20 May. During an exam period, regular absence detection is paused. The note confirms: "Regular absence detection is paused — teachers are on invigilation duty."

Click "+ Add Exam Period." The form has the same Name, Start Date, and End Date fields as the vacation form.

Both tabs share these behaviors:

Each saved period appears in a table with columns: Name (displayed as a coloured badge), Start, End, Duration (in days), and Edit/Remove actions.

Editing a period: click Edit to highlight the row amber and expand an inline edit form. Update any field and click "Save Changes."

Removing a period: click Remove and confirm the prompt. The warning reads: "Absences from this period will not be un-excused." This means that if you remove a vacation or exam period, any absence records that were excused because of it will remain excused — they are not automatically reinstated. Review attendance records manually if needed after removing a period.`,
  },

  // ── Student entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'school_calendar',
    applicable_roles: ['student'],
    title: 'School Calendar (Student)',
    body: `The School Calendar in the student portal shows the official school calendar for the year — public holidays, school events, and closed days published by the admin. Open it from the Calendar section of the student portal navigation.

At the top of the page, a year selector shows the current year with left and right arrow buttons to navigate to the previous or next year.

Below the year selector, a colour-coded legend shows the three entry types:
Holiday (green badge) — a public holiday or school holiday.
School Event (warm badge) — an in-school event such as sports day or an assembly.
Closed Day (red badge) — a day the school is closed.

Entries are grouped by month, each month displayed as a separate card. Within each month, entries are listed in chronological order. Each entry shows:
The day of the week and date number on the left (large and bold). Today's date is highlighted in your school's colour with a "TODAY" label.
The event name in bold text.
A small coloured type badge below the name.
Any notes the admin added, in smaller text below the badge.
A small coloured dot on the right matching the entry type.

Past events are displayed at reduced opacity (faded) to help you focus on upcoming dates.

If your school has not published any events for the selected year, the page shows "No events for {year}. Try a different year, or check back when your school publishes events."

Note: vacation and exam periods are not shown in the student calendar view, but they affect how your attendance is processed behind the scenes.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} school calendar help entries…\n`);
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
