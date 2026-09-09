'use strict';
/**
 * Meetings seed: 7 help entries covering the admin meetings page (all three tabs)
 * and the teacher meetings app (meetings + PLC tabs).
 * Run once: node backend/seed-help-entries-meetings.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'meetings',
    applicable_roles: ['admin'],
    title: 'Meetings Attendance Overview',
    body: `The Meetings Attendance page is where you create meetings, track which teachers attended, and monitor who was absent. Go to Meetings in the left menu to open it.

The page has three tabs:

Meetings — the list of all scheduled meetings. Use this tab to create, edit, and delete meetings, and to manage QR codes and minutes documents.

Attendance — a log of every teacher attendance record submitted across all meetings. Use this tab to review who attended which meeting, view GPS and photo proof, and manually record attendance when needed.

Absences — a log of every meeting absence recorded against teachers. Use this tab to see which teachers were marked absent for which meetings.

Click any tab label to switch between them. The Meetings tab also has a Type filter and date range, while the Attendance and Absences tabs share a From / To date range filter.

Meeting types in CAS:
PLC (Professional Learning Community) — green badge
Morning Briefing — blue badge
Staff Meeting — purple badge
PTA (Parent-Teacher Association) — amber badge
Other — grey badge`,
  },

  {
    feature_area: 'meetings',
    applicable_roles: ['admin'],
    title: 'Creating and Scheduling Meetings',
    body: `Click New Meeting (top right, visible on the Meetings tab) to create a new meeting. Click Edit on any row to modify an existing one.

The form has the following fields:

Title — required. The name displayed on meeting cards and in teacher notifications (for example, "Weekly Staff Meeting" or "Maths Department Briefing").

Meeting Type — choose from PLC, Morning Briefing, Staff Meeting, PTA, or Other.

Date — required. The date of the meeting.

Start Time / End Time — required. The scheduled duration of the meeting.

Location / Venue — required. Select from the school's defined locations. Locations are managed under the Locations menu.

Repeat (create only) — when creating a new meeting, you can set it to repeat:
None — create a single meeting on the chosen date.
Daily (Mon–Fri) — create one occurrence for each weekday from the start date to the Repeat Until date.
Weekly — create one occurrence per week from the start date to the Repeat Until date.
When a repeat mode is selected, a Repeat Until date field appears. A small preview line shows how many meetings will be created. Click Create Meeting to generate all of them at once.

Note: repeat settings are only available when creating; editing a meeting changes that single occurrence only.

Click Save Changes (edit) or Create Meeting (create) to save.`,
  },

  {
    feature_area: 'meetings',
    applicable_roles: ['admin'],
    title: 'Meeting QR Codes, Minutes, and Generating Absences',
    body: `Three additional actions are available on each row in the Meetings tab: QR, Minutes (labelled Upload or Uploaded), and Absences.

QR — generates a print-ready attendance sheet for the meeting. Click QR on any meeting row to open the QR modal. The system fetches a unique QR token for this meeting and renders a formatted PNG sheet that includes:
The school name and "Meeting Attendance Registration" header.
The meeting type badge.
The meeting title, date, time, and venue.
The QR code, large and centred.
Step-by-step instructions for teachers on how to scan it using the teacher app.

Click Download PNG to save the sheet to your computer. Print it and post it at the meeting venue before the meeting starts. Teachers scan this code when submitting their attendance.

Minutes — lets you attach the formal meeting minutes document to the meeting record. Click the Upload link (or the Uploaded green button if a document already exists) to open the minutes modal. If a document has been uploaded, the filename, upload date, and a Download link appear. To add or replace the document, click the file picker and select a PDF or Word document (.pdf, .doc, .docx), then click Upload. To remove a previously uploaded document, click Remove (a confirmation appears first).

Absences — generates absence records for all active teachers who did not submit attendance for this meeting on a specified date. Click Absences on a meeting row to open the generate absences modal. Confirm or adjust the date (it is prefilled from the meeting date) and click Generate Absences. The system marks as Absent every teacher who has no attendance record and no approved excuse covering that date. Teachers already marked absent are not duplicated. A results screen shows how many absences were recorded and how many were skipped.

Delete — permanently deletes the meeting and all attendance records linked to it. A confirmation dialog appears first.`,
  },

  {
    feature_area: 'meetings',
    applicable_roles: ['admin'],
    title: 'Attendance Tab — Recording and Reviewing',
    body: `The Attendance tab lists every teacher attendance record submitted across all meetings.

Three filters appear at the top: From and To date pickers, and a Type dropdown (to filter by meeting type). Click Search to apply date and type filters. Click Reset to clear them.

A record count appears above the table showing how many records match the current filter.

The table columns are: Date, Teacher, Meeting (the meeting title), Type (badge), Location, GPS, and Photo.

GPS column — if the teacher's device recorded GPS coordinates when they submitted, a blue Map link appears. Click it to open Google Maps at that location. A dash appears if no coordinates were recorded.

Photo column — if the teacher uploaded a photo at the venue, a View button appears. Click it to open the attendance photo modal, which shows the photo alongside a details grid (teacher name, date, venue, GPS coordinates with a Maps link). Click Close to dismiss.

Delete — a Delete link at the far right of each row permanently removes that attendance record.

Two buttons at the top right of the Attendance tab allow you to record attendance on behalf of a teacher:

Record Manually — for a single teacher. Select the meeting, teacher, and date (date is prefilled from the meeting). Optionally add a reason or notes. Click Record Attendance. The system creates an attendance record without GPS or photo proof and clears any absence record for that teacher on that date.

Bulk Record — for multiple teachers at once. This is a two-step flow. Step 1: select the meeting and confirm the date, then click Next. Step 2: a teacher checklist appears. Teachers who already have an attendance record for this date are greyed out and labelled "Already recorded" — they cannot be selected. Tick the teachers you want to record. Use Search to filter the list or Select All to check all eligible teachers. Optionally add a note. Click Record N Teachers to save.`,
  },

  {
    feature_area: 'meetings',
    applicable_roles: ['admin'],
    title: 'Absences Tab — Meetings Absence Log',
    body: `The Absences tab in the Meetings Attendance page shows every meeting absence record across all teachers.

An absence record in this tab is created when an admin uses the "Absences" button on a meeting row (in the Meetings tab) to bulk-generate absences, or when a teacher is individually flagged as absent for a meeting.

Two filters appear at the top: From and To date pickers. Click Search to apply and Reset to clear.

The table columns are: Date, Teacher, Meeting (the meeting title), Type (badge), and Status (a red badge showing the absence status).

This tab is read-only — there are no action buttons. To remove or correct an absence, use the Absences tab on the main Absences & Remedials page, or record attendance manually for the affected teacher from the Attendance tab (which will clear the absence).`,
  },

  // ── Teacher entries ───────────────────────────────────────────────────────────

  {
    feature_area: 'meetings',
    applicable_roles: ['teacher'],
    title: 'Submitting Your Meeting Attendance',
    body: `The Meetings page in the teacher app shows every meeting scheduled for today. Tap Meetings in the bottom navigation bar to open it.

The page is titled "Today" and shows today's date. A segmented control at the top lets you switch between the Meetings tab and the PLC tab.

Each scheduled meeting appears as a card showing the type badge, meeting title, time (start – end), and venue.

If you have already submitted your attendance for a meeting, the card shows a green "Submitted" badge with the time you submitted.

If you have not yet submitted, a Submit button appears on the card. Tap it to expand the attendance submission form below the card.

The attendance form has four required sections:

GPS Location — the page automatically requests your device's GPS coordinates when it loads and when you open a form. Your coordinates appear as a string of numbers (latitude, longitude). If there is an error or the GPS is slow, tap Refresh to try again. GPS coordinates are required — you cannot submit without them.

Notes — optional. A short text field for any notes about the meeting.

Photo — tap the camera icon to take a photo at the venue. The photo is compressed automatically. Once taken, a preview appears and you can tap Retake to replace it. A photo is required.

Venue QR Code — tap Scan Venue QR Code to open your device camera and scan the QR code that has been posted at the meeting venue. Hold the code inside the viewfinder rectangle. When detected, the code is validated against this meeting's token. A green "Venue Verified" panel appears if it matches. If it does not match, an error appears — make sure you are scanning the QR sheet for this specific meeting. A venue QR scan is required.

Once GPS, photo, and QR are all completed, tap Submit Attendance. A success state appears on the card with the submission time.

If there are no meetings today, the tab shows "No meetings today."`,
  },

  {
    feature_area: 'meetings',
    applicable_roles: ['teacher'],
    title: 'Submitting Your PLC Attendance',
    body: `PLC (Professional Learning Community) sessions are tracked separately from regular meetings. Tap Meetings in the teacher app, then select the PLC tab.

The PLC tab shows the session scheduled for today, if any. Each session shows the session title, time, and venue.

If you have already submitted your PLC attendance today, a green success card appears showing the session title and your submission time.

If you have not yet submitted, an attendance form appears with the following sections:

PLC Venue QR — tap Scan Venue QR Code and point your camera at the QR code posted at the PLC room. The code is validated against today's PLC session. A green "Venue Verified" panel appears once confirmed. This is required.

GPS Coordinates — auto-acquired from your device. Tap Refresh if the location failed to load. Required.

Agenda — optional. A short text field where you can describe what was discussed in today's PLC session.

Venue Photo — tap the photo area to take a picture at the PLC venue. A preview appears once taken; tap Retake to replace it. Required.

Once all required fields are completed, tap Submit PLC Attendance. The form is replaced by a green confirmation card.

If no PLC session is scheduled for today, the tab shows "No PLC Session Today" with a note to check back on your next scheduled day.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} meetings help entries…\n`);
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
