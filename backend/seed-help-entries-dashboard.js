'use strict';
/**
 * Dashboard seed: 6 admin help entries covering every section of the admin dashboard.
 * Run once: node backend/seed-help-entries-dashboard.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'Admin Dashboard Overview',
    body: `The dashboard is the first page you see after logging in. It gives a live snapshot of what is happening across the school right now. All data on the page refreshes automatically every 60 seconds — you do not need to reload the browser.

School status banner: if today is a vacation, public holiday, closed day, or a special school event, a coloured strip appears at the very top of the page naming the day and confirming that no lessons are scheduled.

Six summary cards sit near the top of the page:

Today's Attendance — how many teachers have submitted their classroom attendance today.

Today's Absences — how many teacher absence records have been generated today (lessons with no submission).

Total Teachers — the total number of active teacher accounts in the system.

Week Attendance — the number of attendance submissions across all teachers so far this week.

Outstanding — absence records that have not yet been given a reason or had their status resolved.

Pending Remedials — remedial sessions that teachers have submitted and are waiting for admin verification.

These figures update every 60 seconds along with the rest of the page.`,
  },

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'Reading the Classroom Occupancy Panel',
    body: `The Classroom Occupancy section shows the live status of every class in your timetable. It sits below the stat cards and updates every 60 seconds.

The four summary figures at the top of the section tell you at a glance: Total (all classes in the timetable), Occupied (classes with an active attendance submission right now), Vacant (classes with no submission), and Current Period (classes that have a lesson timetabled at this moment, whether or not it has been submitted).

The filter buttons — All, Occupied, Vacant, Current Period — let you narrow the card grid to only the group you want to focus on.

Each class appears as a card with a coloured left border. The border colour tells you the status:

Green border — OCCUPIED. The teacher has submitted attendance for the current lesson. The class is confirmed to be running.

Amber border — SCHEDULED. The timetable shows a lesson is due right now, but the teacher has not yet submitted attendance. The lesson may be running and the teacher may still be within their submission window.

Purple border — ON LEAVE. The teacher assigned to this period is on approved leave. A purple badge inside the card shows the leave type (for example, Sick Leave or Annual Leave).

Grey border — FREE. No lesson is timetabled for this class in the current period.

Each card also shows the subject, teacher name, lesson start and end times, and the teacher's phone number if one is stored. The phone number has a small call icon beside it — tapping it opens a phone call to that teacher directly from the browser.`,
  },

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'Teacher Attendance Summary Table',
    body: `The Teacher Attendance Summary table shows cumulative attendance figures for every teacher across a selected academic period. It sits below the Classroom Occupancy section.

Use the Academic Year dropdown and the Semester dropdown at the top right of the section to choose the period. The table reloads whenever you change either filter. It defaults to the current academic year and current semester.

The table has eight columns:

Teacher — the teacher's full name.

Department — the department they belong to.

Scheduled — the total number of lesson periods assigned to them in the selected period.

Present — how many of those periods they submitted attendance for (shown in green).

Absent — how many resulted in an absence record (shown in red if above zero).

Excused — how many absences had an approved excuse (shown in purple if above zero).

Attendance % — a mini progress bar and a percentage. The bar fills with colour based on the attendance level.

Status — a badge summarising performance: Excellent (90 percent or above, green), Good (75 to 89 percent, blue), Needs Attention (60 to 74 percent, amber), Critical (below 60 percent, red), or No Data (no records exist, grey).

The School Total row at the bottom of the table adds up every teacher's figures into a single school-wide total. It shows the combined scheduled periods, present, absent, and excused counts, along with the overall school attendance percentage and its status badge.`,
  },

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'PLC Attendance Summary Table',
    body: `The PLC Attendance Summary table sits directly below the Teacher Attendance table and uses the same academic year and semester filters — changing those filters updates both tables at once.

PLC stands for Professional Learning Community. These are structured professional development sessions that teachers are required to attend. The table shows how consistently each teacher has attended their scheduled PLC sessions.

The columns are: Teacher, Department, Sessions (total PLC sessions scheduled for that teacher in the period), Present (sessions attended), Absent (sessions missed), Attendance % (progress bar and percentage), and Status (the same Excellent, Good, Needs Attention, and Critical badges used in the teacher attendance table).

The School Total footer row aggregates all teachers into a single school-wide PLC attendance figure.

If a teacher's PLC attendance is low, you can view the individual session history by going to ATTENDANCE → PLC and filtering by teacher. From there you can also see whether absences were recorded with a reason.`,
  },

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'Running the Absence Check',
    body: `The Run Absence Check button is in the top-right area of the dashboard, beside the Review Conflicts button.

The absence check scans today's timetable and compares each scheduled lesson against submitted attendance records. For any lesson period where no attendance was submitted and the window has closed, it creates an absence record for that teacher.

CAS runs this check automatically on a schedule, but you can trigger it manually at any time using this button. This is useful at the end of a school day to make sure all missing submissions have been captured before you review the day's attendance.

When you click the button it shows a loading spinner. Once done, the dashboard data reloads automatically so you can see the updated counts in the stat cards and occupancy grid.

Running the check more than once for the same day is safe — it only creates records that do not already exist. It does not duplicate or overwrite existing absence entries.`,
  },

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'Reviewing and Clearing False Absences',
    body: `The Review Conflicts button (amber, top-right of the dashboard) opens the false absences panel. Use it when the absence count on the dashboard looks higher than expected.

The system automatically flags absence records that may have been created in error. Three situations trigger a flag:

Attendance submitted — the teacher actually submitted attendance for that period, but an absence record was also created. This usually happens when attendance is submitted just after the check runs.

School event — a calendar event (holiday, activity day, etc.) was recorded on that date, meaning no lessons should have been expected.

Teacher excused — the teacher had an approved excuse for that date, so the absence should not count against them.

The panel groups flagged records by date, newest first. Each record shows the teacher name, subject, class, period, and the flag badges explaining why it was flagged.

To clear a false absence: tick its checkbox, then click Clear Selected. You can select multiple records at once, or use the Select All checkbox at the top to select every flagged record on screen. Clearing removes the false absence record from the system permanently.

Use the From and To date pickers at the top of the panel to narrow the list to a specific date range, then click Apply.

A false absence that you clear will no longer appear in the teacher's absence count or affect their attendance percentage. Only clear records you have reviewed and confirmed are genuinely incorrect.`,
  },

  {
    feature_area: 'dashboard',
    applicable_roles: ['admin'],
    title: 'Timetable Gaps Alert',
    body: `A red alert pill appears in the top-right area of the dashboard when the timetable has gaps. It shows two possible counts:

Unscheduled — lesson periods that appear in the school's timetable structure but have no lesson assigned to them. These are time slots that are simply empty.

No teacher — lesson slots that have a class and subject assigned but no teacher linked to them.

Both types of gap mean that the classroom occupancy grid will show those classes as FREE during the affected periods, even if a lesson is supposed to be happening. They will also generate absence records for the period because no teacher can submit attendance for an unassigned slot.

Clicking the alert navigates directly to the Timetable page where you can fix the gaps. Add the missing lesson slots or assign the missing teachers, then return to the dashboard — the alert disappears once all gaps are resolved.

The alert only shows when at least one gap exists. If the timetable is fully configured, you will not see it.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} dashboard help entries…\n`);
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
