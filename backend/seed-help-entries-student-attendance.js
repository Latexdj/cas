'use strict';
/**
 * Student Attendance seed: 6 help entries covering:
 *   - Admin student attendance page (sessions + student report tabs + session detail)
 *   - Admin teacher attendance records page (revoke / remove)
 *   - Student portal attendance view
 *   - Principal teacher attendance summary
 * Run once: node backend/seed-help-entries-student-attendance.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin: student attendance ─────────────────────────────────────────────────

  {
    feature_area: 'student_attendance',
    applicable_roles: ['admin'],
    title: 'Student Attendance Overview',
    body: `The Student Attendance page lets you review student presence records lesson by lesson and generate per-student attendance summaries. Go to Student Attendance in the left menu to open it.

The page has two tabs:

Sessions — a list of every class session for which a teacher submitted attendance. Each row represents one session (one class, one subject, on one date). Use this tab to drill into the individual students recorded for any session and to correct student statuses where needed.

Student Report — an aggregated view showing each student's total attendance percentage across all sessions in the selected period. Use this tab to identify students with low attendance and to export reports for academic review.

Click either tab label to switch. Both tabs share date range, class, academic year, and semester filters.`,
  },

  {
    feature_area: 'student_attendance',
    applicable_roles: ['admin'],
    title: 'Student Attendance — Sessions Tab',
    body: `The Sessions tab lists every class session for which student attendance was recorded by a teacher.

Filters at the top: From and To date pickers (default to today), a Class dropdown (populated from sessions in the current results), an Academic Year dropdown (auto-selected to the current year, marked with ✦), and a Semester dropdown. Filters apply immediately when you change them.

The table shows: Date, Class, Subject, Teacher, and counts for Present (green), Absent (red), and Late (amber) students, plus the Total headcount.

Click any row to open the Session Detail modal. The modal shows:

The session title (Class — Subject) and the date and teacher name below it.

A summary line at the top right showing how many students are Present, Absent, and Late in this session.

A student-by-student table with four columns: Student ID, Name, Status (a colour-coded badge), and an Edit control.

To correct a student's status, click Edit on their row. Three status buttons appear: Present, Absent, and Late. Click the correct one to save the change immediately. The summary counts at the top of the modal update in real time. Click Cancel to dismiss the edit without saving.

Export buttons at the top right of the filter bar let you save the current filtered session list as an Excel file or a PDF. The export includes date, class, subject, teacher, and all count columns.`,
  },

  {
    feature_area: 'student_attendance',
    applicable_roles: ['admin'],
    title: 'Student Attendance — Student Report Tab',
    body: `The Student Report tab shows each student's total attendance performance aggregated across all sessions in the selected date range.

Filters: From and To date pickers (default to the last 30 days), a Class dropdown, an Academic Year dropdown, and a Semester dropdown. All filters take effect immediately when changed.

Two summary badges appear above the table once data loads:

A green badge showing how many students are tracked in the current filter.
A red badge showing how many students are below 75% attendance — the typical threshold for exam eligibility. This badge only appears when at least one student is below 75%.

The table columns are: Student ID, Name, Class, Sessions (total number of sessions in the period), Present, Absent, Late, and Attendance % (an inline progress bar with the percentage number beside it).

Attendance % colour coding: 90% and above is green (Excellent). 75–89% is blue. 60–74% is amber. Below 60% is red. A grey dash appears if no sessions are recorded for the student.

Rows for students below 75% have a red background tint to make them easy to spot while scrolling.

Export buttons at the top right let you download the full report as an Excel file or a PDF. The exported report includes student ID, name, class, total sessions, present/absent/late counts, and the attendance percentage.`,
  },

  {
    feature_area: 'teacher_attendance',
    applicable_roles: ['admin'],
    title: 'Teacher Attendance Records — Revoking and Removing',
    body: `The Attendance page (sometimes listed as Teacher Attendance in the admin menu) shows every class attendance record submitted by teachers — the proof submissions that include a classroom photo, GPS coordinates, and lesson details.

Three filters appear at the top: From date, To date, and a Teacher dropdown. Click Filter to apply or Clear to reset all three.

A record count below the filter bar shows how many records match the current filter.

The table columns are: Date, Teacher, Subject, Class, Periods (number of lesson periods covered), Topic (the topic the teacher recorded, truncated), Location (with a green tick ✓ if the room was verified against a known location, or an amber tilde ~ if unverified), Photo, and Week number.

Photo column — if the teacher uploaded a classroom photo with their submission, a View button appears. Click it to open the photo properties modal, which shows the photo alongside a grid with: Time Taken, File Size, Location name, and GPS Coordinates (a clickable Maps link if coordinates exist). Click Open full size to view the original image. Click Close to dismiss.

Two action buttons appear on each row:

Revoke — use this when an attendance record needs to be formally invalidated (for example, when GPS coordinates are inconsistent with the classroom location or the photo shows the wrong room). Clicking Revoke opens a confirmation modal that shows the teacher, subject, class, and date. You must enter a reason for the revocation. The reason is sent to the teacher by email. When confirmed, the revoke action: deletes the attendance record and associated student attendance, marks the teacher absent for each affected class, sends the teacher an email notification with your reason, and logs the action in the audit trail. This action cannot be undone.

Remove — a simpler permanent deletion with no email notification and no absence record created. A browser confirmation appears first. Removing a record allows the teacher to resubmit attendance for that session. Use this when a record was submitted in error and no further action is needed.`,
  },

  // ── Student portal ────────────────────────────────────────────────────────────

  {
    feature_area: 'student_attendance',
    applicable_roles: ['student'],
    title: 'Your Attendance Record',
    body: `The Attendance page in the student portal shows your personal attendance record — how often you have been Present, Absent, or Late across your lessons this semester. Open it from the navigation bar.

Two filters appear at the top: Academic Year and Semester. The current year and semester are pre-selected when the page loads. Change either to view a different period.

Attendance Summary card — a panel at the top of the page shows:

Your overall attendance percentage as a large number, colour-coded by level:
85% and above — Excellent (green)
75–84% — Good (blue)
70–74% — At risk (amber)
Below 70% — Critical (red)

Three count tiles: Present (green), Absent (red), and Late (amber) — showing the total number of sessions in each state for the selected period.

A progress bar below the tiles that fills to your attendance percentage.

Total sessions count and your attendance level label.

Warning notice — if your attendance is below 75%, a red warning panel appears: "Attendance below 75% — you may be at risk of being barred from exams." If you see this, speak with your class teacher or form teacher immediately.

Session Log — a list below the summary card shows every individual lesson session recorded for you in the selected period. Each entry shows:

A mini date block on the left showing the month abbreviation, day number, and day of the week.
The subject name and teacher name.
A status badge on the right: Present (green), Absent (red), or Late (amber).

The list is paginated. Use the page controls at the bottom to navigate through older sessions.`,
  },

  // ── Principal ─────────────────────────────────────────────────────────────────

  {
    feature_area: 'teacher_attendance',
    applicable_roles: ['management'],
    title: 'Teacher Attendance Summary (Principal)',
    body: `The Teacher Attendance page in the principal portal gives you a consolidated view of how each teacher is performing across class attendance and meeting participation. Go to Attendance in the principal navigation to open it.

Three shared filters appear at the top: a Search box (filter by teacher name or department), an Academic Year dropdown (auto-set to the current year), and a Semester dropdown. Changing any filter updates all tabs immediately.

The page has four tabs:

Class Attendance — shows each teacher's class attendance record for the selected period. The table columns are: Teacher (name), Department, Scheduled (total periods on the timetable), Present (periods where the teacher submitted attendance), Absent (periods with no attendance record), Excused (periods covered by an approved leave excuse), Attendance % (a mini progress bar and percentage), and Status (a colour-coded label: Excellent for 90%+, Good for 75–89%, Needs Attention for 60–74%, Critical for below 60%). A School Total footer row at the bottom of the table aggregates all teachers.

If no timetable has been uploaded for the selected academic year and semester, an amber notice appears instead of the table: "No timetable for this period — Upload a timetable before attendance data will appear here." Contact the admin responsible for timetable management to resolve this.

PLC — shows each teacher's PLC session attendance. Columns: Teacher, Department, Sessions (total scheduled), Present, Absent, Attendance %, Status. School Total footer row.

Morning Briefings — same structure as PLC but for Morning Briefing meetings.

Staff Meetings — same structure for Staff Meeting attendance.

All four tables support sorting by clicking column headers. A Search bar filters across all four tabs simultaneously by teacher name or department.

This page is read-only. Use it to identify teachers who need follow-up, then action that through the Absences & Remedials or Discipline pages as appropriate.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} student attendance help entries…\n`);
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
