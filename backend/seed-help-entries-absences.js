'use strict';
/**
 * Absences & Remedials seed: 7 help entries covering the admin absences page
 * (three tabs), the principal leave requests page, and the teacher absences
 * landing page.
 * Run once: node backend/seed-help-entries-absences.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'absences',
    applicable_roles: ['admin'],
    title: 'Absences & Remedials Overview',
    body: `The Absences & Remedials page is where you monitor teacher attendance, track remedial lessons teachers have been required to conduct to make up for missed classes, and review teacher leave (excuse) requests. Go to Absences in the left menu to open it.

The page has three tabs:

Absences — every individual lesson absence a teacher has incurred. An absence record is created automatically when a teacher marks their attendance as absent for a class, or it can be created manually by an admin. Each absence record tracks the lesson, the date, the current status, and any reason given.

Remedials — lesson-by-lesson records of make-up lessons that teachers have scheduled or completed to compensate for a class absence. When a teacher schedules a remedial, it is linked to the original absence record.

Excuses — formal leave requests teachers submit (or admins create) to excuse a period of absence. Excuses cover a date range rather than individual lessons and require principal approval.

The tab bar shows a count for each tab so you can see at a glance how many records are in each category. Click any tab to switch to it.`,
  },

  {
    feature_area: 'absences',
    applicable_roles: ['admin'],
    title: 'Absences Tab — Viewing and Managing',
    body: `The Absences tab lists every teacher absence record in the school.

Four filters appear at the top. Apply them individually or together; the table refreshes when you click Filter.

Teacher — select a specific teacher from the dropdown to see only their absences.
Status — filter to a specific absence status (see status list below).
From / To — date pickers that restrict results to absences within that date range.
Click Clear to reset all filters.

A record count below the filters shows how many absences match the current filter.

The table columns are: Date, Teacher, Subject, Class, Status (colour-coded badge), Reason (truncated — full text on hover), and Source.

The Source column shows how the absence was recorded:
Auto — the absence was generated automatically by the system when the teacher submitted attendance as absent for that lesson.
Manual — the absence was entered directly by an admin.

Status values in the Absences tab:
Absent — the absence has been recorded but nothing further has happened.
Excused — an approved excuse covers this lesson period.
Remedial Scheduled — the teacher has scheduled a remedial lesson to make up for this absence.
Completed — the teacher has marked a remedial lesson as done.
Verified — an admin has verified the remedial was satisfactorily conducted.
Made Up — the lesson has been considered made up.
Cleared — the absence has been cleared from the record.

Each row has two action buttons:

Reason — opens a small modal showing the teacher's name, subject, class, and date for this absence. A text area lets you type or edit the reason recorded for the absence. Click Save to update it.

Delete — permanently removes the absence record after a browser confirmation. Deleting an absence allows the teacher to resubmit attendance for that lesson slot. Use this when an absence was recorded in error.`,
  },

  {
    feature_area: 'absences',
    applicable_roles: ['admin'],
    title: 'Remedials Tab — Tracking and Verifying',
    body: `The Remedials tab lists every remedial lesson that teachers have scheduled or completed. A remedial lesson is a make-up class that a teacher conducts to cover the content missed during an absence.

Three controls appear at the top:

Teacher filter — select a teacher to see only their remedials.
Status filter — filter by: Scheduled, Completed, Verified, Rejected, or Cancelled.
Missing register checkbox — when ticked, the list shows only remedials that do not yet have a student attendance register taken, excluding Cancelled records. A count badge beside the checkbox shows how many are missing. Use this to quickly find remedials where the register has not been recorded.

The table columns are: Absence Date (the original date of the missed lesson), Remedial Date (the make-up date and time), Teacher, Subject, Class, Location, Duration (in periods), Status badge, and Register.

The Register column shows one of three values:
✓ Taken — the student register for this remedial lesson has been recorded.
Missing — the remedial took place but no student register has been taken yet (shows in amber).
A dash — the remedial was Cancelled (no register needed).

Row actions depend on the remedial's status:

Completed — two action buttons appear: Verify and Reject.
Verify opens the verification modal (see below).
Reject opens a rejection form. A reason is required. Rejecting a remedial reverts the linked absence status back to Outstanding and permanently deletes the student attendance register that was taken during that lesson.

Not Cancelled / Not Rejected — a Mark Register (or Register, if already taken) button appears. Click it to open the register modal where you can mark which students attended the remedial session.

Scheduled — a Cancel button appears. Click it to cancel the remedial (a confirmation appears first).

Verify modal — when you click Verify on a Completed remedial, a modal opens showing:
A proof photo uploaded by the teacher (or a "No photo submitted" placeholder if none was attached).
A details grid showing teacher name, subject, class, absence date, remedial date, time range, number of periods covered, location, and topic covered.
A GPS link — if the teacher recorded their location during the remedial, a "View on map" link opens Google Maps at that location.
A verification notes field (optional) where you can add any internal notes.
Click Mark Verified to confirm the lesson as satisfactory. The remedial status moves to Verified.`,
  },

  {
    feature_area: 'absences',
    applicable_roles: ['admin'],
    title: 'Remedials — Taking the Student Register',
    body: `For each remedial lesson, you can record which students attended using the Register function. This is separate from the teacher's own reporting of completing the lesson.

Click Mark Register on a remedial row to open the register modal. If a register has already been taken for that session, the button label changes to Register and the modal will show the existing record which you can update.

The modal title shows the subject and class name for the remedial. Below the title is the teacher's name and the remedial date.

Two quick-mark buttons appear at the top of the student list:
All Present — marks every student as Present with one click.
All Absent — marks every student as Absent with one click.

The student list below shows every student in the class. If the remedial spans more than one class (a merged lesson), the student's class name appears below their ID. Each student row shows their name and Student ID, and a circular badge on the right showing their current attendance status — P for Present (green), A for Absent (red), or L for Late (amber).

Click the badge to cycle through the three statuses in order: Present → Absent → Late → Present.

A summary line at the bottom of the list shows the total count of Present, Absent, and Late students updating in real time as you make changes.

Click Save Register to save a new register, or Update Register to overwrite an existing one. Click Cancel to close without saving.`,
  },

  {
    feature_area: 'absences',
    applicable_roles: ['admin'],
    title: 'Excuses Tab — Managing Teacher Leave Requests',
    body: `The Excuses tab lists formal leave requests submitted by teachers or created by admins. An excuse covers a date range and, once approved, converts the individual absence records that fall within that period to Excused status.

Two filters at the top narrow the list: a Teacher dropdown and a Status dropdown (Pending, Approved, Rejected).

The table columns are: Teacher, Type, Period (the date range of the excuse), Reason, Document, Status (badge), and Approved By.

Type values: Official Duty, Permission, Sick Leave, Other.

Document column: for Official Duty excuses, a dash appears (no document required). For all other types, a View link appears if the teacher attached a supporting document — click it to open the file. If no document is attached for a non-Official-Duty type, the column shows "Missing" in amber. A supporting document must be present before you can approve a non-Official-Duty request.

Status badge colours: Pending (amber), Approved (green), Rejected (red). If the request was rejected, the rejection reason appears below the badge in red text.

Row actions for Pending excuses:
Approve — approves the leave request. For non-Official-Duty types this button is disabled (greyed out with a tooltip) until a supporting document has been attached by the teacher.
Reject — opens a rejection modal. A rejection reason is required before you can confirm.
Del — permanently deletes the excuse record (no status change to absences).

Adding an excuse as admin: click + Add Excuse (top right of the tab). An inline form appears with fields for Teacher (required), Type (required), Date From (required), Date To (required), and Reason (required). Admin-created excuses are automatically marked as Approved — there is no pending step. Click Save Excuse to create the record. The inline form closes and the list refreshes.`,
  },

  // ── Management entry ──────────────────────────────────────────────────────────

  {
    feature_area: 'absences',
    applicable_roles: ['management'],
    title: 'Teacher Leave Requests (Principal)',
    body: `The Leave Requests page in the principal portal is where you review and act on teacher leave applications that are waiting for approval. Go to Leave Requests in the principal navigation to open it.

A sub-heading beneath the title shows how many requests are currently pending, for example "3 pending requests".

A Status filter at the top right lets you see all requests, or filter to Pending, Approved, or Rejected.

Requests are displayed as cards rather than a table. Each card shows:

The teacher's name (bold), their teacher code, and their department.
A status badge (amber for Pending, green for Approved, red for Rejected) in the top right corner of the card.
A detail grid showing: Type (Official Duty, Sick Leave, etc.), Dates (from–to), Reason, and (if applicable) a Rejected by and rejection reason row or an Approved by row.
The date the request was submitted.

Supporting document — if the teacher attached a supporting document to their request, a blue "View Supporting Document" button appears. Click it to open an in-browser document viewer that can display PDFs and common Office formats. A Download button in the viewer lets you save the file. If no document is attached and the request is not Official Duty, an amber notice says "No supporting document attached."

Actions for Pending requests: two buttons appear at the bottom of the card — Approve (green) and Reject (red).

Clicking Approve opens a confirmation overlay. Click Confirm Approve to approve.

Clicking Reject opens a confirmation overlay with a required Rejection Reason text area. The rejection cannot be submitted without a reason. Click Confirm Reject to reject. The teacher will see the rejection reason in their portal.

Once actioned, the card updates to show the new status. The card no longer has action buttons once Approved or Rejected.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'absences',
    applicable_roles: ['teacher'],
    title: 'Your Absence Record',
    body: `The Absences section in the teacher app shows a summary of all your absence records, grouped by category. Tap Absences in the teacher app navigation to open it.

Four summary cards appear, each showing a count and a short description:

Class Absences — the number of unresolved class absences on your record. These are lessons you were marked absent for. Tap View Details to see the list, where you can schedule a remedial lesson for any outstanding absence.

Meeting Absences — the number of staff or department meeting absences recorded against your account. Tap View Details to see the list.

PLC Absences — the number of Professional Learning Community session absences on your record. Tap View Details to see the list.

Remedial Lessons — the total number of remedial lessons you have scheduled or completed. Tap View Details to see the remedials list, where you can submit proof of completion for lessons you have conducted.

Each card's count updates whenever your absence records change. A count of zero means you have no recorded absences in that category.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} absences & remedials help entries…\n`);
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
