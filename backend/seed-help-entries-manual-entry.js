'use strict';
/**
 * Manual Entry seed: 2 admin help entries covering the manual attendance entry page.
 * Run once: node backend/seed-help-entries-manual-entry.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'manual_entry',
    applicable_roles: ['admin'],
    title: 'Manual Attendance Entry — Recording the Lesson',
    body: `The Manual Attendance Entry page lets you record a teacher's class attendance on their behalf — use it when a teacher cannot submit via the app (for example, if they had no phone signal, their device was unavailable, or they were covering a class at short notice). Go to Manual Entry in the left menu to open it.

Important: manual entries are flagged in the attendance log as "Manual entry by admin." No classroom photo or GPS coordinates are captured, and the amber notice at the top of the page reminds you of this. Use manual entry only as a last resort; normal submissions from the teacher app carry photo and GPS proof.

The page works in two steps. Step 1 records the teacher's attendance for the lesson. Step 2 records which students were present.

Step 1 — filling in the lesson details:

Teacher — required. A dropdown listing all active teachers, each shown with their department in brackets. Select the teacher whose attendance you are recording.

Date — required. Defaults to today. You can backdate — the date picker does not allow future dates.

Scheduled Classes — once you select a teacher and a date, the system fetches that teacher's timetable for the day of the week matching the chosen date and shows a list of slot cards. Each card shows: the subject name, the start and end time, the number of periods, and the class or classes for that slot. Click a card to select it; the selected card highlights in green. If the teacher has only one scheduled slot on that day, it is selected automatically. If no slots are found, an amber notice appears explaining that the teacher has no timetable entries for that day — check the timetable or choose a different date.

After you select a slot, three more fields appear:

Subject and Periods — both are filled in automatically from the timetable slot and are read-only.

Class(es) — if the slot covers more than one class (a merged lesson), a checkbox list appears so you can choose which of the classes to include. All classes in the slot are ticked by default; untick any that were not taught in this session.

Topic — required. Type the lesson topic (for example, "Quadratic equations"). This appears in the attendance record and the teacher's lesson log.

Location — optional. A dropdown of the school's defined locations. Select the room where the lesson took place if you know it.

Click Next: Mark Student Attendance → to save the teacher attendance record and move to Step 2.`,
  },

  {
    feature_area: 'manual_entry',
    applicable_roles: ['admin'],
    title: 'Manual Attendance Entry — Marking Student Attendance',
    body: `After you submit the lesson details in Step 1, the page moves to Step 2 where you record which students attended.

The Step 2 header shows the subject and class name. If you are recording attendance for a merged lesson with multiple classes, a row of progress chips appears at the top: completed classes are shown in green with a tick, the class you are currently marking is shown in dark green, and remaining classes are shown in grey. You work through each class one at a time.

Three summary tiles show running totals: Present (green), Absent (red), and Total (tan). These update in real time as you mark students.

The student list below shows every active student enrolled in the current class. All students start as Present (white card with a green Present badge). Click a student's card to mark them Absent — the card turns red and the badge changes to Absent. Click the same card again to flip them back to Present.

If no active students are found for the class (for example, the class has no enrolled students in the system), a notice appears saying you can still proceed and no student records will be created.

Once you have finished marking, click the button at the bottom:

If there are more classes to mark (merged lesson), the button reads "Submit & Mark [next class name] →". Clicking it saves the current class's records and moves to the next class in the queue.

If this is the last (or only) class, the button reads "Save Student Attendance ✓". Clicking it saves the records, returns to Step 1, and shows a green confirmation banner: "Attendance and student records saved for [Teacher name] on [date]."

To go back to Step 1 without saving, click the back arrow button in the top left of the Step 2 header. This does not delete the teacher attendance record that was already created in Step 1.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} manual entry help entries…\n`);
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
