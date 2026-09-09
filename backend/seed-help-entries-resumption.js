'use strict';
/**
 * Resumption Register seed: 5 help entries covering the admin, teacher, and
 * principal resumption register pages (all three are structurally identical —
 * same five tabs, same actions).
 * Run once: node backend/seed-help-entries-resumption.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'resumption',
    applicable_roles: ['admin'],
    title: 'Resumption Register Overview',
    body: `The Resumption Register tracks which boarding students have returned to campus when school reopens after a holiday. Go to Resumption Register in the left menu to open it.

The page is used during the first days of a new term. As boarding students check back in, their arrivals are recorded here. The register helps you know at any moment which boarders are on campus and which have not yet reported.

A status banner appears at the top of the page. It shows:
A green Open badge or a red Closed badge — whether the arrival register is currently open for recording.
The configured school reopening date.
The maximum number of days a student is permitted to remain at home after resumption before being flagged.

The page has five tabs:

Arrivals — a log of every boarding student who has been recorded as returned. Use this as the primary check-in view.

Missing (N) — a list of boarding students who have not yet been recorded as arrived. The count in the tab label updates in real time. Use this to identify and bulk-record students who have reported.

Flags (N) — automatically generated alerts for boarding students who have been marked Present in class attendance but have no arrival record. The count shows active (unresolved) flags.

Kitchen Count — a live count of how many boarders are currently on campus, broken down by class. Share this number with kitchen staff for meal planning.

Configuration — where you set the reopening date, the maximum days-home limit, and whether the register is open or closed.

Click any tab label to switch.`,
  },

  {
    feature_area: 'resumption',
    applicable_roles: ['admin'],
    title: 'Resumption Register — Arrivals Tab',
    body: `The Arrivals tab shows every boarding student who has been recorded as returned to campus for the current semester.

Three filters appear at the top: a name or ID search box, a Class dropdown, and a House dropdown. Type in the search box and press Enter or click Search to filter. Changing the Class or House dropdowns also filters the list. Use these together to quickly find a specific student's record.

The table columns are: Student name, Student ID, Class, House, Arrival Date (the date their return was recorded), and Recorded By (which admin or teacher created the record).

A record count below the filter row shows the total number of arrivals matching the current filter.

Remove — a red Remove button appears on each row. Click it to delete the arrival record after a browser confirmation. Removing a record moves the student back to the Missing list, allowing their arrival to be re-recorded if it was entered in error.

If no arrival records exist yet, the tab shows: "No arrival records yet. Use the Missing tab to record student arrivals."`,
  },

  {
    feature_area: 'resumption',
    applicable_roles: ['admin'],
    title: 'Resumption Register — Missing Tab and Recording Arrivals',
    body: `The Missing tab lists every active boarding student who does not yet have an arrival record for the current semester. Use it to record students as they check in during resumption.

Two filters narrow the list: a Class dropdown and a House dropdown. Click Refresh to reload the list after recording arrivals. If all boarding students have reported, the tab shows a green "All boarding students have reported" message.

To record one or more students as arrived:

1. Tick the checkbox beside each student who has returned. Selected rows highlight in green. Tick multiple students at once if a group has arrived together.

2. Use Select All to tick every student currently shown (respects any active class/house filter). Use Deselect All to clear all selections.

3. Once at least one student is ticked, a Record Arrival button appears — on desktop it appears in the filter bar; on mobile it appears as a sticky button at the bottom of the screen. The button label shows the count of selected students, for example "Record Arrival (5)".

4. Click the button to record today's date as the arrival date for all selected students. The system saves the records, the selected students disappear from the Missing list, and the page switches to the Arrivals tab where you can confirm the records were created.

A count at the bottom of the tab shows how many boarding students are still yet to report.`,
  },

  {
    feature_area: 'resumption',
    applicable_roles: ['admin'],
    title: 'Resumption Register — Flags, Kitchen Count, and Configuration',
    body: `Flags tab:

Flags are generated automatically when the system detects a boarding student who has been marked Present in class attendance but has no arrival record in the resumption register. This can happen if a student attended class without formally checking in with the housemaster or admin office.

The Flags tab lists every such student. Each row shows: Student name, Class, House, Subject and Session Date (of the class attendance that triggered the flag), the date the flag was raised, and the current Status (Active or Resolved).

To resolve a flag, click the Resolve button on an Active flag row. A prompt appears asking for an optional resolution note (for example, "Student checked in; arrival was recorded late"). The note is saved with the resolution. Resolved flags remain in the list for reference but are no longer counted in the Flags tab label.

If no active flags exist, the tab shows "No active flags."

Kitchen Count tab:

The Kitchen Count tab shows the total number of boarding students currently recorded as on campus, alongside a class-by-class breakdown. Share this figure with the kitchen or boarding staff for meal and housekeeping planning. Click Refresh to reload the count at any time.

Configuration tab:

The Configuration tab is where you set up the semester's resumption settings. Three fields are available:

Resumption Date — the official date school reopens. This is displayed in the status banner at the top of the page.

Maximum days allowed home after resumption — a number between 0 and 60. A boarding student who has not reported within this many days after the resumption date will be considered overdue. Set to 0 to remove the day limit.

Arrival register is open — a checkbox. When ticked, the register is open and teachers can record student arrivals from their portal. When unticked, the register is closed and only admins can make changes. Tick this at the start of term and untick it once the check-in period has ended.

Click Save configuration to apply. The last-updated timestamp and the name of the person who last saved the settings appear below the button.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'resumption',
    applicable_roles: ['teacher'],
    title: 'Resumption Register (Housemasters and Teachers)',
    body: `The Resumption Register is available in the teacher portal during school resumption periods. It gives housemasters and teachers the same tools as the admin portal to record boarding student arrivals, monitor who is missing, and view flags.

Open it from the Resumption Register link in your teacher navigation.

You will see the same five tabs as the admin view: Arrivals, Missing, Flags, Kitchen Count, and Configuration. The register is only active when the admin has set it to Open — the status banner at the top of the page shows whether the register is currently open or closed.

Recording arrivals — go to the Missing tab to see which students in your house have not yet reported. Tick each student who has returned and click Record Arrival to log their return with today's date. The students move from the Missing list to the Arrivals tab.

Flags — if a student in your class has been marked Present in attendance but has no arrival record, a flag is raised automatically. Check the Flags tab regularly during resumption and resolve any flags for students you can confirm have returned.

Kitchen Count — shows how many boarders are on campus. Share this with boarding house staff as needed.

Configuration — if you have been given admin responsibilities for the boarding house, you can set the resumption date, maximum days-home limit, and open or close the register from the Configuration tab.`,
  },

  // ── Management entry ──────────────────────────────────────────────────────────

  {
    feature_area: 'resumption',
    applicable_roles: ['management'],
    title: 'Resumption Register (Principal)',
    body: `The Resumption Register in the principal portal gives you full visibility into boarding student arrivals at the start of each term. Go to Resumption Register in the principal navigation to open it.

The page is identical in layout to the admin and teacher views — it has five tabs (Arrivals, Missing, Flags, Kitchen Count, and Configuration) and the same controls. As principal you can record arrivals, resolve flags, adjust configuration, and view the kitchen count.

Use this page to monitor the overall boarding situation during resumption:

Arrivals tab — see how many boarders have returned and when.
Missing tab — see who has not yet reported. The tab label shows the live count of missing students.
Flags tab — review students who appeared in class attendance before their arrival was formally recorded. The tab label shows the count of active, unresolved flags. Resolve each flag once you are satisfied the student has properly checked in.
Kitchen Count — the total number of boarders on campus, broken down by class. Useful for operational planning.
Configuration — view and update the semester settings: the official reopening date, the maximum days-home allowance, and whether the register is open or closed.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} resumption register help entries…\n`);
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
