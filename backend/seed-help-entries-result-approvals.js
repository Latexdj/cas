'use strict';
/**
 * Result Approvals seed: 2 help entries —
 *   1 admin  (Result Approvals page — full HOD/final/publish/unlock workflow)
 *   1 teacher (HOD Dashboard — 6-tab department overview incl. Approvals tab)
 * Run once: node backend/seed-help-entries-result-approvals.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entry ───────────────────────────────────────────────────────────────

  {
    feature_area: 'results',
    applicable_roles: ['admin'],
    title: 'Result Approvals — Admin View',
    body: `The Result Approvals page is where admins review, approve, reject, and publish teacher result submissions. Open it from Result Approvals in the left navigation.

Page subtitle: "Review and approve submitted results from teachers."

A red "N pending" badge appears in the page header whenever submissions are waiting for review.

Filters and batch actions:

Two dropdowns at the top — Academic Year and Semester — control which submissions are shown. A "Publish All Final-Approved" button sits to the right: clicking it immediately publishes every submission with Final Approved status for the selected year and semester in one action, making those results visible to students.

Status tabs:

Five tabs filter the list:

All — every submission regardless of status.
Awaiting HOD — submitted by the teacher, not yet reviewed by the HOD. Red count badge.
HOD Approved — the HOD has reviewed and approved. Amber count badge.
Final Approved — admin has given final approval. Green count badge.
Published — results are live and visible to students. Dark green count badge.

Click any tab to switch the view. Each tab shows a count of matching submissions.

Secondary filters:

Below the status tabs, a Class dropdown and a Subject dropdown narrow the list further. Both are populated from the submissions currently in the queue — only classes and subjects that have at least one submission appear. Click "Clear filters" to reset both.

Submissions table:

Columns: Subject, Class, Teacher, HOD (name or "—" if unassigned), Status badge, Actions.

Status badges:
"Awaiting HOD" — red.
"HOD Approved" — amber.
"Final Approved" — green.
"Published" — dark green.

Action buttons vary by status:

Awaiting HOD → "Approve as HOD" (dark green) and "Reject" (red).
HOD Approved → "Final Approve" (green) and "Reject" (red).
Final Approved → "Publish" (green).
Published → "Unlock" (grey).

Action modal:

Clicking any action button opens a shared modal. The modal header names the action and shows "Subject · Class · Teacher."

When acting as HOD (Approve as HOD), an amber notice reads: "You are acting on behalf of the HOD. This submission has not yet been reviewed by the assigned HOD." This is a safeguard — the system allows admins to step in when an HOD is unavailable.

Scores Completeness panel (shown when approving — Approve as HOD or Final Approve):

This panel checks whether all scores have been entered before you commit to approval:

Exam Scores — a ✓ or ✗ with the count of students who have exam scores entered out of the class total.
CA Modes — each CA mode shows ✓ if at least one assessment was created, or ✗ "no assessment created" if the mode has no entry.
Per-assessment completion — each assessment shows its label, mode name, and how many students are scored out of the total.

A coloured summary bar appears at the bottom of the panel:
Green — "All scores complete — safe to approve."
Red — "Scores incomplete — reject back to teacher to fix."

The Confirm button is disabled when scores are incomplete. You must reject the submission and ask the teacher to complete their entries before approving.

Results Preview table (shown when approving or publishing):

A scrollable table (max-height 240px) showing all students in the subject with their CA score, Exam score, Total, and Grade, sorted by total descending. If any students have no score, a warning is shown. Review this table to spot obvious data-entry errors before approving or publishing.

Publish warning:

When publishing, a notice reads: "This will make results visible to students immediately. This action can be undone with Unlock." Use Unlock on a published submission to revert it to Final Approved if you need to make corrections after publication.

Comment / Reason field:

A textarea appears in the modal. It is required for Reject, HOD Reject, and Unlock — you must type a reason before the action button becomes active. It is optional for Approve and Final Approve, allowing you to leave an internal note.

Approval workflow summary:

The full path from teacher submission to publication:

1. Teacher submits for review → status becomes "Awaiting HOD."
2. HOD (or admin acting as HOD) reviews and approves → status becomes "HOD Approved."
3. Admin gives final approval → status becomes "Final Approved."
4. Admin publishes individually or uses "Publish All Final-Approved" → status becomes "Published" and students can see their results.

At any stage, a Reject action returns the submission to the teacher with a reason. The teacher corrects their scores and resubmits from the Assessments page.`,
  },

  // ── Teacher HOD entry ─────────────────────────────────────────────────────────

  {
    feature_area: 'results',
    applicable_roles: ['teacher'],
    title: 'HOD Dashboard',
    body: `The HOD Dashboard is available to teachers who have been assigned as a Head of Department. Open it from HOD or My Department in the teacher portal navigation. The page title shows the department or programme name.

If you are the HOD for more than one department, a dropdown at the top of the page lets you switch between them. All six tabs reload for the selected department when you switch.

Six tabs are available: Overview, Approvals, Results, Classes, Teachers, Absences.

Overview tab:

Six stat cards give a snapshot of your department:

Teachers — the number of teachers in your department.
Classes — the number of classes under your supervision.
Students — the total number of students across those classes.
Outstanding Absences — the number of teacher absences still unresolved. Shown in red if above zero.
Pending Remedials — the number of remedial sessions not yet completed. Shown in amber if above zero.
Assessments (Term) — the total number of assessments this term, with "N with scores recorded" as a subtitle. Shown in your school's accent colour.

An assessment progress bar below the cards shows assessments with scores entered out of the total (e.g. "12/20").

Approvals tab:

This tab shows result submissions from teachers in your department that are awaiting your HOD review.

The list shows one card per submission. Each card shows:
Subject and class name (bold).
Academic year, semester, and teacher name.
How many students have been scored out of the class total, and when the submission was made.
A "Review" button.

Tap "Review" to open the Review Submission modal. The modal shows:

Subject, class, and teacher name in the header.

A "Submitted Results" preview table: columns Student, CA, Exam, Total, Grade — sorted by class position. Scroll within the table if there are many students. If results could not be loaded, an error message appears instead.

A Comment field: required when rejecting (a message appears if you try to reject without a comment), optional when approving.

Two action buttons:
Reject (red) — returns the submission to the teacher with your comment as the rejection reason. The teacher will see the reason in their Assessments page and can correct and resubmit.
Approve (dark green) — marks the submission HOD Approved and forwards it to admin for final sign-off.

After either action the modal closes and the queue refreshes. A "Refresh" link at the top of the tab reloads the queue at any time.

Results tab:

This tab lets you view the academic results for any class in your department for a chosen year and semester.

Three filters appear at the top:

Class — select a class from the dropdown (populated with classes in your department).
Academic Year — select the year. The current year is pre-selected.
Semester — Semester 1 or Semester 2.

Click "View Results" to load the results. A "Print Report" button appears once results are loaded — it opens the browser's print dialog.

A summary strip at the top of the results shows: total students, class average, number passing, and number at risk (average below 40%).

The results table lists students by class position with columns: Pos, Student (name and student ID), Average (colour-coded: green ≥ 40%, red < 40%), Subjects count, Status (PASSING or AT RISK badge), and a Details button.

Click "Details" on any student row to expand a per-subject breakdown: Subject, CA, Exam, Total, and Grade for each subject the student sat.

Classes tab:

A list of all classes in your department, one card per class. Each card shows the class name, student count, and — for subject HODs — the teacher assigned to that class for your subject, along with their phone and email (if on record). A "Teacher assigned" badge (green) or "No teacher on timetable" badge (amber) is shown at the top-right of each card.

For programme HODs, the card shows the form teacher for that class instead of the subject teacher.

Teachers tab:

A card for each teacher in your department. Each card shows:

The teacher's name and teacher code. If the teacher is a form teacher, a badge shows their form class.
An Absences tile — outstanding absences count (red if above zero).
A Remedials tile — pending remedials count (amber if above zero).
An Assessments progress bar — assessments with scores entered versus total assessments, as a fraction and percentage.
The date of the teacher's most recent attendance record.

Absences tab:

A list of teacher absences in your department. Filter by Teacher (select one) and Status (Absent, Remedial Scheduled, Made Up, Cleared, Verified, or Excused), then click Filter to update the list.

Each absence card shows: teacher name, subject and class, date of absence, and the absence reason (in italics, if given). A colour-coded badge shows the current status:
Absent — red.
Remedial Scheduled — amber.
Made Up / Cleared / Verified — green.
Excused — grey.

The HOD Dashboard is read-only for department data — you cannot edit teacher records or absence statuses from here. Those actions are managed in the admin portal.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} result approvals help entries…\n`);
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
