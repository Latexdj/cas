'use strict';
/**
 * Bell Schedule seed: 2 admin help entries covering the school-breaks page
 * (labelled "Bell Schedule" in the navigation).
 * Run once: node backend/seed-help-entries-bell-schedule.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'bell_schedule',
    applicable_roles: ['admin'],
    title: 'Bell Schedule — Overview and How Break Deduction Works',
    body: `The Bell Schedule page (found under Bell Schedule in the left navigation) is where you define your school's regular break times. These breaks are used by the system when calculating how many teaching periods a lesson contains and the total teaching time per week shown in the Timetable Coverage Report.

How break deduction works:

When a timetable slot spans a configured break, the system subtracts the overlapping break time before counting periods. For example, if a lesson runs from 08:00 to 10:30 and there is a break from 09:00 to 09:30, the system subtracts 30 minutes and treats the lesson as 2 periods rather than 2.5. This ensures that the Coverage Report's "Duration/wk" column reflects actual teaching time, not clock time.

Changes to breaks take effect immediately — all future timetable lookups and coverage calculations use the updated break times as soon as you save.

If no breaks are configured, the system treats each lesson's full duration as teaching time with no deductions.

Typical breaks to configure:

Morning Break (e.g. 10:00–10:30, all days)
Lunch (e.g. 12:30–13:30, all days)
Any day-specific breaks (e.g. a shorter Friday lunch or an assembly period that interrupts lessons)

You can configure as many breaks as your school needs and scope each one to a specific day or leave it applying to all days.`,
  },

  {
    feature_area: 'bell_schedule',
    applicable_roles: ['admin'],
    title: 'Bell Schedule — Adding, Editing, and Deleting Breaks',
    body: `The Bell Schedule page has two sections: an Add Break form at the top and a Configured Breaks list below.

Adding a break:

Fill in the form fields:

Break name (required) — a descriptive label for the break, for example "Morning Break", "Lunch", or "Assembly". This name appears in the break list.

Applies to — a dropdown that defaults to "All days (Mon – Sun)". Change this to a specific day of the week if the break only occurs on certain days. For a break that occurs every school day, leave it set to "All days."

Start time (required) and End time (required) — the start and end of the break in HH:MM format. The end time must be later than the start time.

Click "Add Break" to save. The new break appears immediately in the Configured Breaks list below.

Validation: if the name is missing, or start or end time is blank, a red error message appears. If the start time is not before the end time, an error also appears.

Editing a break:

Click the Edit button on any break in the list. The form at the top changes to "Edit Break" mode and fills in the break's current values. The break's card in the list gets a green border to show it is being edited. Make your changes and click "Save Changes." To abandon the edit without saving, click Cancel — the form clears and the list returns to normal.

Deleting a break:

Click the Delete button on a break card. A confirmation prompt appears: "Delete this break? Period calculations will update immediately." Confirm to permanently remove the break. The list updates instantly and the system recalculates timetable durations without this break.

Configured Breaks list:

Each break card shows the break name, the day it applies to, the start and end time in 12-hour format (e.g. 10:00 AM – 10:30 AM), and the break duration in minutes. If the list is long, pagination controls appear below the list.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} bell schedule help entries…\n`);
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
