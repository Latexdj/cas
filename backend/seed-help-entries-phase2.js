'use strict';
// Phase 2: seeds teacher (5) and student (3) global help entries.
// Also drops the FK constraint on help_chat_sessions.created_by so that
// student sessions (whose IDs live in the students table, not teachers) can
// be inserted without a FK violation.
// Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [
  // ── Teacher entries ────────────────────────────────────────────────────────

  {
    feature_area:     'attendance_submission',
    applicable_roles: ['teacher'],
    title: 'Submitting Attendance (Teacher Portal)',
    body: `Go to Submit in the sidebar. Attendance is a two-step process.

Step 1 — Lesson details: Select today's lesson slot from the dropdown (populated from your timetable). Tap "Scan" to open the camera and point it at the QR code displayed in your classroom — the classroom field fills automatically once the QR is recognised. Enter the topic covered in this lesson. Select the location from the dropdown if it was not pre-filled by the QR scan. GPS coordinates are captured automatically; tap Refresh if the location shows as unavailable. Take a photo of the classroom and students.

Tap "Next: Student Attendance" to proceed.

Step 2 — Student marking: All students in the class are listed and default to Present (shown in green). Tap a student's name to mark them Absent (turns red). Students currently on an approved exeat appear with an "On Exeat" badge and are excluded from the submission — do not mark them as absent.

Tap Submit to record attendance.

Edit window: You can correct student status up to 30 minutes after the lesson end time. After that the record is locked.

If you closed the browser mid-way, a Resume banner appears on the Submit page the next time you open it — tap Resume to continue where you left off.`,
  },

  {
    feature_area:     'lms',
    applicable_roles: ['teacher'],
    title: 'Managing Your LMS Courses',
    body: `Go to My Courses in the sidebar. The page shows all courses you have created, filterable by academic year and semester.

To create a course: tap "+ New Course". Select the subject and class from the dropdowns — these are drawn from your timetable assignments. If a subject or class is missing, contact your admin. Choose the academic year, optionally a semester, and add a description. Click Save. The course is created as a Draft and is not yet visible to students.

To add content: click "Open Course" on a course card. Inside the course you can add Lessons, Assignments, and Quizzes.

To make a course visible to students: tap Publish on the course card. Tap Unpublish to hide it again. Published courses show a pending submissions badge when students submit work.

Archived courses are read-only and no longer visible to students.`,
  },

  {
    feature_area:     'meetings',
    applicable_roles: ['teacher'],
    title: 'Submitting Meeting and PLC Attendance',
    body: `Go to Meetings in the sidebar. The page has two tabs: Meetings and PLC.

Meetings tab: Shows today's scheduled meetings (morning briefing, staff meeting, PTA, and other types). Find your meeting and tap "Submit". The submission form requires:
- GPS location (captured automatically — tap Refresh if unavailable)
- A photo of the meeting venue or participants
- A QR scan of the venue QR code (tap Scan, then point the camera at the venue QR)
- Optional notes

Tap Submit to confirm your attendance.

PLC tab: Shows today's Professional Learning Community session if one is scheduled. Submission requires the same fields (venue QR, GPS, photo) plus an optional agenda field.

Only meetings and PLC sessions scheduled for today appear on this page. If you cannot see a meeting, contact your admin.`,
  },

  {
    feature_area:     'form_class_remarks',
    applicable_roles: ['teacher'],
    title: 'Entering Form Class Remarks',
    body: `Go to Form Class in the sidebar (only visible if you have a form class assigned). Tap the Remarks tab.

For each student in the list, you can set:
- Attitude — select from Excellent, Very Good, Good, Fair, or Poor
- Conduct — same five options
- General Remarks — type a free-text remark in the text box

To generate a remark automatically: tap "Draft with AI" next to the student. The system sends the student's recent performance data to the AI and returns a suggested remark in a green card below the row. Review it carefully, then tap "Use this draft" to copy it into the General Remarks field, or "Dismiss" to discard it.

When you have entered remarks for all students, tap "Save All" at the top of the list to save everything at once. Remarks are not saved until you tap Save All.

The Overview tab shows how many students have remarks entered so you can track your progress.`,
  },

  {
    feature_area:     'query_letters',
    applicable_roles: ['teacher'],
    title: 'Responding to Query Letters',
    body: `Go to Conduct in the sidebar. The page is titled "My Queries" and shows all query letters that have been issued to you by management or admin.

Each query shows the subject, category, issue date, response deadline, and current status. Overdue queries (deadline passed, not yet responded) are highlighted.

Status flow: Issued → Acknowledged → Responded → Resolved (or Escalated).

To acknowledge receipt: expand the query and tap "Acknowledge Receipt". This is required before you can submit a response and confirms you have read the letter.

To submit a response: once acknowledged, tap "Submit Response". Write your written response in the text box. You can optionally attach a supporting document (PDF or DOC). Tap Submit.

Once management marks the matter resolved, the status changes to Resolved. If it is escalated further, the status shows Escalated.`,
  },

  // ── Student entries ────────────────────────────────────────────────────────

  {
    feature_area:     'clearance',
    applicable_roles: ['student'],
    title: 'Understanding Your Clearance Status',
    body: `Go to Clearance in the sidebar. Clearance is required to collect your end-of-year certificate or transcript.

Your overall clearance status is shown at the top:
- Not Started — the school has not yet initiated clearance for you. Contact your school administrator.
- In Progress — clearance is underway; some offices have not yet cleared you.
- Action Required — at least one office has flagged an issue. Check the office list below for the reason.
- Fully Cleared — all offices have cleared you. You may collect your certificate.

The checklist below shows each office (for example, the library, administration, or a subject teacher). Each row shows Cleared, Pending, or Not Cleared with an optional reason or note. If an office shows Not Cleared, contact that office directly to resolve the issue — students cannot self-clear.

The Accounts Office row is separate and shows your current fee balance. If there is an outstanding balance, go to Fees to view the details.

You cannot initiate your own clearance — it is started by the school.`,
  },

  {
    feature_area:     'exeat',
    applicable_roles: ['student'],
    title: 'Requesting an Exeat',
    body: `Go to Exeat in the sidebar. An exeat is a formal permission to leave school grounds and must be approved by your housemaster.

Quota bars at the top show how many exeats of each type you have used this semester and the maximum allowed.

Two types:
- Internal — a few hours off campus (day visit, local errand)
- External — overnight or home visit

To submit a request: tap "Request". Choose the type (Internal or External). Fill in:
- Destination
- Reason for leaving
- Parent or guardian contact (pre-filled from your record; edit if needed)
- Departure date and time
- Expected return date and time
- Optional notes

Tap Submit. Your housemaster will review and approve or reject the request.

Status values: Pending (waiting for approval), Active / Approved — Out (approved and you are currently out), Returned (you have come back), Overdue (you have not returned by the expected time — report to your housemaster immediately), Rejected (with a reason).

If your quota is reached, the request button is disabled. Contact your housemaster for an exception.`,
  },

  {
    feature_area:     'results',
    applicable_roles: ['student'],
    title: 'Viewing Your Results',
    body: `Go to Results in the sidebar. Use the Academic Year and Semester dropdowns to choose which term's results to view.

The results table shows each subject with your Continuous Assessment (CA) score, Exam score, Total score, Grade, and Remark. Your class average is shown in small text beside your total for comparison.

Summary cards at the top show your overall average percentage, your class position (e.g., 3rd of 45), and the number of subjects.

Form Teacher's Remarks — your form teacher's comments on your attitude, conduct, and general performance — are shown below the table.

Performance trend — a chart at the bottom shows your average across all semesters so you can track progress over time.

At-risk notice: if your average is below 40%, a warning banner appears at the top. Speak to your form teacher.

To print your report card: tap "Print Report Card" to generate and print an A4 PDF of your full report.

Results are only visible after the school publishes them for the selected semester.`,
  },
];

async function run() {
  // Drop the FK on created_by so student sessions can be inserted.
  // The column becomes a plain UUID — role field already identifies the user type.
  console.log('Dropping FK constraint on help_chat_sessions.created_by (if exists)…');
  await pool.query(
    `ALTER TABLE help_chat_sessions
     DROP CONSTRAINT IF EXISTS help_chat_sessions_created_by_fkey`
  );
  console.log('Constraint removed (or was already absent).');

  console.log(`\nSeeding ${ENTRIES.length} Phase 2 help entries…\n`);
  let inserted = 0;

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
      console.log(`  ✓  [${e.applicable_roles[0]}]  ${e.title}`);
    } else {
      console.log(`  –  [${e.applicable_roles[0]}]  ${e.title} (already exists, skipped)`);
    }
  }

  console.log(`\nDone. ${inserted} new entries inserted.`);
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
