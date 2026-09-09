'use strict';
/**
 * Invigilation seed: 6 help entries — 5 admin (overview, exam sessions,
 * invigilator pool, duty roster, attendance report) + 1 teacher (duties,
 * check-in, and register flows).
 * Run once: node backend/seed-help-entries-invigilation.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'invigilation',
    applicable_roles: ['admin'],
    title: 'Invigilation Overview',
    body: `The Invigilation page is where you manage all exam-day operations: scheduling exam sessions, building the pool of eligible invigilators, generating and editing duty rosters, and reviewing attendance and check-in records. Go to Invigilation in the left navigation to open it.

The page subtitle reads: "Manage exam sessions, invigilator pool, and duty rosters."

The page has four tabs:

Exam Sessions — create and manage individual exam sessions (a session is one subject in one hall at one time). Each session tracks which class is sitting, how many invigilators are needed, and which teachers are assigned. Check-in records for assigned invigilators are also visible here.

Invigilator Pool — control which teachers are eligible to be assigned as invigilators. Teachers can be excluded from the pool with a stated reason, and restored later.

Duty Roster — auto-generate and confirm invigilator assignments across multiple exam sessions in one action.

Attendance Report — generate a printable or exportable report showing check-in rates, assigned duties, and per-session detail for any date range.

Each tab is independent. You would typically work through them in order at the start of an exam period: create sessions → set up the pool → generate the roster → monitor attendance as exams run.`,
  },

  {
    feature_area: 'invigilation',
    applicable_roles: ['admin'],
    title: 'Invigilation — Exam Sessions',
    body: `The Exam Sessions tab is where you create and manage individual exam sittings.

Adding exam sessions:

The "Add Sessions" form at the top of the tab lets you create multiple sessions at once. Fill in the shared fields first:

Date (required) — the date of the exam.
Start Time and End Time (required) — the exam window, e.g. 09:00–12:00.
Subject (required) — the subject being examined.

Below the shared header, a class picker table shows all your classes with columns for Checkbox, Class, Hall, and Invigilators Needed (1–10). Tick the classes that are sitting this exam. An "All" / "None" toggle selects or clears all classes at once.

Hall — enter the hall name or room for each selected class.
Invigilators Needed — set how many invigilators are required in that hall (default is 1, maximum is 10).

Grouping classes into one session:
Select two or more classes using the checkboxes and click "Group selected." This merges them into a single session showing all class names as chips. A "Ungroup" button splits them back. Use this when multiple classes sit in the same hall simultaneously.

A preview line below the table shows: "N classes → M sessions will be created."

Click "Create Sessions" to save. The sessions appear in the session list below the form.

Session list:

Sessions are grouped by date. For each session, the table shows: Time, Subject, Class (or class chips for merged sessions), Hall, Assigned invigilators (chips showing each teacher's name — chief invigilator shown with an amber dot, assistants with a grey dot), Attendance (a button showing "N/M checked in"), and Edit/Delete actions.

Edit: click Edit on a session row to expand an inline edit form (row highlights blue). Change Date, Start/End, Subject, Class, Hall, or Invigilators Needed. Click Save to apply.

Delete: click Delete and confirm. Deletion removes the session and all its duty records.

Merge Sessions:
Click the blue "Merge Sessions" button to enter merge mode. Click on individual session rows to select them (rows highlight). Then click the Merge button at the bottom. The system combines the selected sessions into one, keeping the earliest session's date, time, and hall, and summing the invigilator counts.

Check-In Panel:
Click the Attendance button on a session row to expand the Check-In Panel beneath it. The panel splits assigned invigilators into two groups:

Checked in — shown with a green circle, the exact check-in time, a GPS ✓ badge if location was verified, and "(manual)" if the check-in was recorded by an admin rather than the teacher themselves.

Not checked in — shown with an empty circle and "Not checked in." An admin can manually mark a teacher present by entering a note and clicking "Mark Present." Manual check-ins are flagged as "(Admin)" in all records.`,
  },

  {
    feature_area: 'invigilation',
    applicable_roles: ['admin'],
    title: 'Invigilation — Invigilator Pool',
    body: `The Invigilator Pool tab controls which teachers are available to be assigned as invigilators.

The tab shows a two-column layout:

Eligible (left column) — teachers who can be assigned to duty. Each teacher card shows the teacher's name, department, and a duty_count showing how many duties they have been assigned so far this exam period. A search bar at the top of the column lets you filter by name or department.

Excluded (right column) — teachers who have been removed from the pool. Each card shows the teacher's name, department, duty count, and the exclusion reason. A Restore button moves the teacher back to the Eligible column.

Excluding a teacher:

Click the "Exclude" button on a teacher in the Eligible column. A small form opens on the card asking you to select a reason from a dropdown:

Headmaster/Deputy — the teacher holds a senior leadership role and is exempt from invigilating.
Exam Committee — the teacher is part of the examining committee and cannot be an invigilator.
Other — any other reason (e.g. medical, external duty).

Click Confirm. The teacher moves to the Excluded column with the selected reason shown.

Restoring a teacher:

Click the Restore button on any teacher in the Excluded column. The teacher immediately moves back to the Eligible column and becomes available for roster generation.

The duty_count shown on each teacher card is used by the Duty Roster generator to distribute duties fairly — teachers with fewer duties are prioritised when generating a roster.

Excluded teachers are not available in the Duty Roster tab's pool. Exclude teachers before generating the roster to ensure they are not assigned.`,
  },

  {
    feature_area: 'invigilation',
    applicable_roles: ['admin'],
    title: 'Invigilation — Duty Roster',
    body: `The Duty Roster tab lets you auto-generate invigilator assignments for multiple exam sessions and confirm them in one action.

The tab has a two-column layout:

Left column: Session selector and Generation Settings
Right column: Generated roster preview

Step 1 — Select Sessions:

The "Select Sessions" panel lists all exam sessions grouped by date. Each entry shows the subject, hall, time range, and class. Tick the checkboxes next to the sessions you want to roster. Use the "All" / "None" buttons at the top of the panel to select or clear all at once.

Step 2 — Configure Generation Settings:

Invigilators per Hall — a number field (1–10) specifying how many invigilators to assign to each selected session. This overrides the per-session "Invigilators Needed" setting during generation.

Exclude subject teachers — when this checkbox is ticked, teachers who teach the subject being examined are not assigned to that session. This prevents a teacher from invigilating their own students.

A line below the settings shows: "Pool: N eligible teachers" — teachers who have not been excluded in the Invigilator Pool tab.

Step 3 — Generate:

Click "Generate Roster (N sessions)." The button is disabled until at least one session is selected.

The system assigns teachers from the eligible pool, prioritising those with the fewest duties so the workload is distributed fairly. It assigns a Chief Invigilator (first slot, shown in amber) and Assistants (remaining slots, shown in grey).

If any warnings arise during generation (for example, insufficient eligible teachers for a hall), they appear in an amber warnings box above the preview.

Step 4 — Review and Adjust:

The "Generated Roster — Review & Adjust" panel shows each session with its date, time, subject, class, and hall. Each assigned teacher appears as a row with their role (Chief or Assistant) and a dropdown listing all eligible pool teachers. You can swap any teacher to a different one by changing the dropdown before confirming.

A "Duty Distribution" bar chart below the roster shows how many duties each teacher is being assigned, with proportional bars so you can see at a glance if any one teacher is over-assigned.

Click "↺ Regenerate" to discard the current draft and generate a fresh roster (assignments will change).

Step 5 — Confirm and Save:

Click "Confirm & Save" (available both in the panel header and at the bottom of the page). The system saves all duties to the database. A green confirmation message shows: "Roster saved — N duties assigned."

After saving, the assigned teachers appear as chips on the session rows in the Exam Sessions tab.`,
  },

  {
    feature_area: 'invigilation',
    applicable_roles: ['admin'],
    title: 'Invigilation — Attendance Report',
    body: `The Attendance Report tab generates a summary of invigilator check-ins and register submissions for any date range. Use it to audit compliance before and after an exam period.

Generating a report:

Set a From date and a To date to define the reporting window. Optionally filter by Teacher (a dropdown of all invigilators) and/or Subject (a dropdown of all exam subjects). Click "Generate Report."

Summary cards:

Four stat cards appear at the top of the report:

Exam Sessions — the total number of sessions in the selected date range.
Duties Assigned — the total number of individual duty assignments (one per teacher per session).
Check-in Rate — the percentage of assigned duties where the teacher checked in. The card is highlighted red if the rate falls below 80%.
Registers Submitted — a fraction showing how many sessions have a submitted register out of the total.

Teacher Summary table:

Columns: Teacher name, Duties assigned, Checked In count, Rate badge (colour-coded: green ≥ 80%, amber 60–79%, red < 60%), Absent (duties with no check-in at all), Admin Manual (duties where an admin manually marked the teacher as present), Registers submitted count.

Session Detail table:

A row-level breakdown of every duty in the report. Columns: Date, Time, Subject, Class, Hall, Teacher, Role (Chief or Assistant), a check-in tick, Time of check-in, Entry method (Self = teacher checked in themselves / Admin = manually marked), GPS ✓ (whether GPS location was captured), Present count (students marked present in the register), Absent count.

Exporting the report:

Export CSV — downloads the Session Detail table as a comma-separated file.
Print PDF — opens the browser's print dialog with the report formatted for printing.

Note: the report reflects check-in and register data as it exists at the time you generate it. If teachers check in after you generate the report, click Generate Report again to refresh.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'invigilation',
    applicable_roles: ['teacher'],
    title: 'Invigilation Duties (Teachers)',
    body: `The Invigilation Duties page shows all the exam sessions you have been assigned to invigilate. Open it from Invigilation in the teacher portal navigation.

The page subtitle reads: "Your assigned exam sessions."

Your duties are organised into three sections:

Today — sessions scheduled for today.
Upcoming — sessions on future dates.
Past — sessions from the last 30 days, listed most recent first.

Each duty card shows:

The subject and class or hall as the card title.
The time range of the exam (e.g. 09:00–12:00).
A Check-In status pill and a Register status pill.

Status pills:
Done (green with a checkmark) — the action has been completed. Check-In also shows the exact time you checked in: "Checked in 09:04."
Admin (warm, with "(Admin)" suffix) — the admin recorded this on your behalf.
Not done (grey with a dot) — the action is still pending.

For today's duties only:

Two action buttons appear at the bottom of each card: "Check In" and "Take Register."

"Take Register" is disabled (grey) until you have checked in. Complete check-in first.

Checking in:

Tap "Check In." A full-screen overlay opens. The system automatically tries to acquire your GPS location when the page loads and again when you open the check-in screen. If GPS is not yet acquired, a "Refresh Location" button appears — tap it to try again. GPS must be confirmed before you can submit.

Attach a selfie photo: tap the photo field to open your camera (front-facing camera is used). The photo is compressed automatically to keep the file size small.

Optionally type a note in the Notes field (for example, "Running 5 minutes late — principal informed").

Once GPS is confirmed and a photo is attached, the "Submit Check-In" button becomes active. Tap it to submit. The overlay closes and the Check-In pill on the duty card turns green with your check-in time.

Taking the register:

Tap "Take Register." A full-screen register screen opens showing a summary bar at the top with the total number of students, how many are marked present, and how many absent.

Below the summary, the full student list appears as toggle buttons. All students start as Present (white/neutral button). Tap a student's name to toggle them to Absent (the button turns red). Tap again to mark them Present again.

When you are satisfied with the register, tap "Submit Register (N present, M absent)." A green success banner appears: the register has been submitted. Tap "Back to Duties" to return to the duty list.

The Register pill on the duty card shows "Register (N/M)" while in progress or "Register done · N/M" after submission. If you need to correct the register, tap "Edit Register" to reopen and change it — registers can be edited after submission.

Past duties:

Past duty cards show a "No check-in recorded" warning in red if you did not check in for a session. You cannot check in retrospectively from the teacher portal — contact an admin to have a manual check-in recorded if needed.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} invigilation help entries…\n`);
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
