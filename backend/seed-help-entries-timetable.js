'use strict';
/**
 * Timetable seed: 7 help entries covering the admin timetable management page
 * (5 entries), the teacher read-only weekly timetable (1), and the student
 * class timetable (1).
 * Run once: node backend/seed-help-entries-timetable.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'timetable',
    applicable_roles: ['admin'],
    title: 'Timetable Overview',
    body: `The Timetable page is where you manage the school's weekly teaching schedule — which teacher teaches which subject to which class, on which day and at what time. Go to Timetable in the left navigation to open it.

Year and Semester selector — a bar at the top of the page lets you choose which academic year and semester to view. It defaults to the current year and semester automatically. Changing either selector reloads the table immediately. A slot count ("Showing N slots") appears on the right side of the selector bar.

Coverage alert — directly below the selector, the system checks whether every allocated class-subject combination has a scheduled timetable slot and an assigned teacher:
If gaps exist, an amber warning banner appears listing the number of unscheduled subjects (red) and slots without a teacher (amber). A "View Report" button on the banner opens the Coverage Report modal with full details.
If all subjects are covered and all slots have teachers, a green banner confirms this.
If no allocations are defined yet, no banner appears.

Filter bar — four dropdowns let you narrow the timetable table: Day (All Days or a specific weekday), Teacher, Class, and Subject. Changing any filter updates the table instantly. All four filters can be combined.

Timetable table — the main table has columns: Day, Time (start–end), Subject, Class(es) (each class displayed as a grey chip — merged lessons show multiple chips), Teacher, and an action column with Edit and Del buttons.

Rows are sorted by day of week first, then by start time within each day. If no entries match the current filters, the table shows "No timetable entries."

Three action buttons appear to the right of the filter bar:
Upload Excel — bulk-import a timetable from a spreadsheet file.
Update Records — update specific fields in existing timetable slots using a spreadsheet.
Add Slot — add a single timetable slot using a form.`,
  },

  {
    feature_area: 'timetable',
    applicable_roles: ['admin'],
    title: 'Adding and Editing Timetable Slots',
    body: `To add a single timetable slot, click the green "Add Slot" button. To edit an existing slot, click the Edit button on any table row. Both actions open the same form in a modal with the following fields:

Teacher (required) — a dropdown listing all teachers in the system. Select the teacher who will teach this slot.

Day (required) — a dropdown for the day of the week, Monday through Sunday.

Start Time and End Time (both required) — time pickers in HH:MM format. The end time must be after the start time.

Subject (required) — a dropdown of all subjects defined in the system. If no subjects exist yet, a message appears directing you to the Subjects page to add them first.

Class(es) (required, at least one) — a scrollable checkbox list of all classes. Tick one or more classes to assign them to this slot. This supports merged lessons where one teacher teaches multiple classes simultaneously. The selected classes are shown in green text above the list as you tick them.

Validation — clicking Save without a teacher, subject, or at least one class selected shows a red error message. Server-side errors (for example, a duplicate slot) also appear as a red message.

After saving, the modal closes and the timetable table reloads to reflect the change.

To delete a slot, click Del on the table row and confirm the browser prompt. Deletion is permanent and cannot be undone from this page.

Note: timetable slots are scoped to the currently selected academic year and semester. A slot added while viewing "2024–25 Semester 1" belongs to that period only and will not appear when viewing a different semester.`,
  },

  {
    feature_area: 'timetable',
    applicable_roles: ['admin'],
    title: 'Uploading a Timetable from Excel',
    body: `To bulk-import a timetable, click "Upload Excel" in the action bar. A modal opens showing which academic year and semester the import will target.

Expected spreadsheet format — the file must have these seven columns (row 1 may optionally be a header row and will be skipped if it contains text):

A: Teacher ID (recommended) or teacher name
B: Teacher Name — for reference only; this column is ignored during import
C: Day — Monday/Tuesday/etc. or a number 1 (Monday) through 7 (Sunday)
D: Start Time — HH:MM format or an Excel time cell
E: End Time — HH:MM format or an Excel time cell
F: Subject name
G: Classes — comma-separated list, e.g. "1A, 1B"

Using Teacher IDs (column A): Teacher IDs like T001 are unambiguous even when two teachers share the same name. Download the template first — it comes pre-filled with all your teachers' IDs so you can simply fill in the rest of the row. You may also type a teacher's full name in column A if you prefer, but IDs are recommended.

New classes: if a class name in column G does not yet exist in the system, it is created automatically during the import.

Template download — click "Download template (pre-filled with your teachers' IDs)" to get a .csv file with your teachers already listed. Fill in the remaining columns for each slot and save.

Selecting a file — click the file picker and choose a .xlsx, .xls, or .csv file.

Replace existing timetable — an amber checkbox option. When ticked, all existing timetable entries for the selected academic year and semester are deleted before the new file is imported. Entries for other semesters are not affected. Leave it unticked to add the imported rows on top of the existing timetable.

After clicking Import:
A green summary shows how many rows were successfully inserted.
If coverage gaps are detected after the import (subjects with no slots, or slots with no teacher), an amber warning appears with counts and a link to the Coverage Report.
If any rows in the file could not be imported, a red list shows the row number and reason for each skipped row. Fix those rows and re-import (without Replace checked if you only want to add the missed rows).`,
  },

  {
    feature_area: 'timetable',
    applicable_roles: ['admin'],
    title: 'Updating Timetable Records in Bulk',
    body: `The "Update Records" button opens the Bulk Update modal, which lets you edit specific fields in existing timetable slots without replacing the whole timetable. Use this when you need to reassign a teacher across many slots, change times for a subject, or correct data after an import.

How it works:

1. Click "Download update template (.xlsx) — pre-filled with current timetable." The file contains every slot for the currently selected year and semester, with all current field values already filled in.

2. The spreadsheet columns are:
   A: Entry ID — the unique identifier for each timetable slot. Do not edit this column — it is how the system knows which slot to update.
   B: Teacher Code — the teacher's ID code (e.g. T001)
   C: Teacher Name — for reference only; ignored on import
   D: Day — Monday/Tuesday/etc. or a number 1–7
   E: Start Time — HH:MM
   F: End Time — HH:MM
   G: Subject — subject name
   H: Classes — comma-separated class names

3. Edit only the cells you want to change. Leave any cell blank to keep the current value unchanged. This means you can update one column across many rows without touching the others.

4. Save the file and return to the portal. Click "Select file" or drag the file onto the dashed drop zone.

5. Click "Update Records." The system matches each row to its Entry ID and applies only the non-blank changes.

After updating:
A green summary shows how many slots were updated.
If any Entry IDs in the file were not found (for example, if a slot was deleted since you downloaded the template), an amber list shows which rows were skipped and which IDs were unrecognised.
If any rows had format errors (invalid day, unparseable time, etc.), a red list shows the affected rows.

Important: this tool only updates existing slots — it does not create new ones. To add new slots, use Add Slot or Upload Excel.`,
  },

  {
    feature_area: 'timetable',
    applicable_roles: ['admin'],
    title: 'Timetable Coverage Report',
    body: `The Coverage Report shows whether every subject that has been allocated to a class has a corresponding timetable slot and an assigned teacher. Click "View Report" on the amber warning banner, or use the button in the Coverage Report modal if you open it manually.

The report has two view modes, switched with toggle buttons at the top:
Issues only (default) — shows only rows where something is missing.
All subjects — shows every allocated class-subject combination, including ones that are fully covered.

The table columns are:

Class — the class name.
Subject — the subject name.
Expected/wk — how many periods per week are expected for this class-subject, based on the subject allocation settings.
Scheduled — how many periods are currently in the timetable for this class-subject.
Has Teacher — of the scheduled periods, how many have a teacher assigned.
Missing Teacher — how many scheduled periods have no teacher (shown in amber if non-zero, otherwise a dash).
Duration/wk — the total teaching time per week, calculated as the sum of slot durations minus any overlap with Bell Schedule breaks.
Status — one of three values:
  OK (green) — the subject is scheduled the expected number of times and all slots have teachers.
  No Teacher (amber) — slots exist but at least one has no teacher assigned.
  Missing (red) — fewer slots are scheduled than expected, or no slots at all.

A note below the table explains: "Duration/wk = sum of lesson times minus any overlapping Bell Schedule breaks."

Use this report to catch gaps after uploading a new timetable or after making changes. Resolve Missing rows by adding the required slots (Add Slot or Upload Excel). Resolve No Teacher rows by editing the affected slots and assigning a teacher.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'timetable',
    applicable_roles: ['teacher'],
    title: 'Your Weekly Timetable',
    body: `Your Weekly Timetable shows all of your teaching slots for the current semester, organised by day of the week. Open it by tapping the Timetable option in the teacher portal navigation.

The page title is "Weekly Timetable" with the subtitle "Your full week schedule."

The schedule is shown Monday through Friday, one day section at a time, scrolling down the page. Each day displays as a labelled section. Today's section is highlighted: the day name appears in your school's colour and a coloured "Today" badge is shown beside it.

Within each day, your slots are listed in chronological order. Each slot shows:
Start and end time on the left (e.g. 08:00 / 09:00).
A vertical divider line.
Subject name in bold.
The class or classes you are teaching (e.g. "2A, 2B" for a merged lesson).

Today's slots have a coloured left border to help them stand out further.

If you have no classes on a particular day, that day section shows a dashed empty state with "No classes."

A Refresh button in the top-right corner reloads the timetable from the server. Tap it if you expect a change has been made and want to see the latest version.

The timetable shown here is the one the admin has published for the current semester. If it looks wrong or is missing slots, contact your school administrator.`,
  },

  // ── Student entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'timetable',
    applicable_roles: ['student'],
    title: 'Your Class Timetable',
    body: `Your Class Timetable shows the weekly teaching schedule for your class. Open it from the Timetable section of the student portal.

At the top of the page, a row of day buttons shows the days on which your class has lessons. Click any day button to see that day's schedule. The portal opens on today's day automatically. Today's button is labelled with a small "Today" indicator.

The selected day's lessons appear below as a list of cards. Each card shows:
A period number circle on the left.
Start time and end time in bold monospace text.
A vertical divider.
Subject name in bold and the teacher's name below it in smaller text.
A small coloured dot on the right.

Periods are listed in chronological order. If your class has no lessons on the selected day, the panel shows "No classes on [day]. Select another day to view its schedule."

If your school has not published a timetable yet, the page shows "No timetable found — Your school hasn't published a timetable yet."

Weekly Overview (desktop only) — on wider screens, a full-week overview appears below the day view. Each day of the week is shown as an expandable panel. Today's day panel has a dark green header with a gold "Today" badge. Each row in the panel shows the period number, time range, subject, and teacher name.

The timetable displayed here is set by your school's admin. If you believe your schedule is incorrect, speak with your class teacher or school office.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} timetable help entries…\n`);
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
