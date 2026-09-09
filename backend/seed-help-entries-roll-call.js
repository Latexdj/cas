'use strict';
/**
 * Roll Call seed: 4 help entries covering the admin, teacher, and principal
 * roll call pages (all three are structurally identical — same layout, same
 * actions, different API client).
 * Run once: node backend/seed-help-entries-roll-call.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'roll_call',
    applicable_roles: ['admin'],
    title: 'Roll Call Overview',
    body: `Roll Call is a boarding-school tool for identifying students who have broken bounds (left school grounds without permission) or gone AWOL. Go to Roll Call in the left navigation menu to open it.

The page subtitle reads: "Identify students who have broken bounds or gone AWOL." A roll call is a snapshot — a particular check at a particular time — and you can run as many as you need in a semester.

The page uses a two-panel layout on desktop:

Left panel (260px wide) — a list of all roll calls conducted this semester. Each card shows the roll call's title (or "Roll Call" if no title was set), the date and location, and coloured count chips: green for Present, red for Absent, and amber for Break Bounds. A small trash icon on each card lets you delete the roll call.

Right panel — the detail view of whichever roll call is selected. If no roll call is selected, the panel shows "Select a roll call to view entries."

On mobile the layout switches to a single-panel view. The list fills the screen and tapping a card navigates into the detail view. A back button ("Roll calls") returns to the list.

All roll calls conducted this semester are listed in the left panel in reverse chronological order. Previous semesters' roll calls are not shown here — each semester starts fresh.

To delete a roll call, click the trash icon on a card in the left panel and confirm the browser prompt. Deleting a roll call permanently removes it and all its student entries.`,
  },

  {
    feature_area: 'roll_call',
    applicable_roles: ['admin'],
    title: 'Starting a Roll Call',
    body: `To start a new roll call, click the green "Start roll call" button in the top-right of the page. A form panel slides open beneath the header with three fields:

Date — required. Defaults to today. You can change this to a past date if you are recording a roll call after the fact.

Title (optional) — a short label to distinguish this roll call from others on the same day. Examples given in the placeholder text: "Evening roll call", "Morning check". If you leave this blank, the roll call is saved with the default label "Roll Call".

Location (optional) — where the roll call is being conducted. Example: "Assembly Hall". Appears on the card in the left panel after the date.

Click Create to save the roll call. The new roll call appears immediately at the top of the left panel and is automatically selected, opening the detail view on the right. The form closes and resets.

If there is an error (for example, a missing required field or a server error), a red error message appears below the fields. Click Cancel to dismiss the form without creating a roll call.

After creating a roll call, the detail panel is empty — no students have been added yet. The next step is to add boarding students to the roll call.`,
  },

  {
    feature_area: 'roll_call',
    applicable_roles: ['admin'],
    title: 'Adding Students and Marking Status',
    body: `Once a roll call is selected (or just created), the detail panel shows the roll call's title and date as a heading, along with three controls in the action bar:

Class filter dropdown — "All Classes" by default. Change this to restrict the student list to a single class. This filter applies to both "Add boarding students" and the students already in the list (on mobile, scroll to see cards for only the selected class — the filter does not hide existing entries on desktop).

Add boarding students button — fetches the school's active boarding students and adds any who are not already in this roll call to the student list, starting them all as Present. If a class filter is active, only students from that class are added. If all boarding students are already in the list, a message says "No new students to add." After adding, a green confirmation message shows how many students were added, for example "Added 42 students."

Save button — saves all status changes to the server. Changes you make to student statuses are held in memory until you click Save. The button shows "Saving…" while the request is in progress. A green "Saved." message confirms success.

The student table has five columns: Student (name), ID (student code), Class, House, and Status. Rows are sorted by class, then alphabetically by student name within each class.

Status column — each student has three buttons: Present, Absent, and Break Bounds. The active status button is highlighted in its colour: green for Present, red for Absent, and amber for Break Bounds. Click a different button to change the student's status. All changes are local until you click Save.

Row background colours reflect the current status: Absent rows have a light red background; Break Bounds rows have a light amber background; Present rows have a white background. This makes it easy to see at a glance which students need attention without reading each row individually.

On mobile, the table is replaced by a card list. Each card shows the student's name, ID, class, and house, followed by the three status buttons stacked full-width for easier tapping. A sticky save bar is fixed to the bottom of the screen with the class filter dropdown, an Add button, and the Save button.

Important: status changes are not saved automatically. Always click Save before navigating away or closing the detail panel.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'roll_call',
    applicable_roles: ['teacher'],
    title: 'Roll Call (Teachers and Housemasters)',
    body: `Roll Call is available in the teacher portal for housemasters and duty teachers who need to check boarding students into a formal roll. Go to Roll Call in the teacher navigation to open it.

The page works identically to the admin portal version. The subtitle reads: "Identify students who have broken bounds or gone AWOL."

Starting a roll call — click "Start roll call" to open the new roll call form. Set the Date (required, defaults to today), an optional Title (e.g. "Evening roll call"), and an optional Location (e.g. "Assembly Hall"). Click Create. The roll call is saved and immediately selected.

Adding students — in the detail panel, click "Add boarding students" to add all active boarding students not already in this roll call. Use the Class filter dropdown first if you want to add only one class at a time. Students are added with a default status of Present.

Marking status — each student row has three buttons: Present, Absent, and Break Bounds. Click the appropriate button for each student. Absent rows show a light red background; Break Bounds rows show a light amber background, making the roll call easy to scan visually.

Break Bounds means the student has left school grounds without permission. AWOL means the student cannot be accounted for at all. Use Absent for a student who is simply not present at the roll call location but whose whereabouts are known.

Save — click Save after making any status changes. Changes are not saved until you click the button. On mobile, the Save button is in the sticky bar at the bottom of the screen.

Previous roll calls for this semester are listed in the left panel. Click any card to review or update it. You can also delete a roll call using the trash icon on its card — this permanently removes it and all its entries, so confirm before deleting.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} roll call help entries…\n`);
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
