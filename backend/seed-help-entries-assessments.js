'use strict';
/**
 * Assessments seed: 3 help entries —
 *   1 admin  (Assessments admin CRUD table)
 *   1 teacher secondary (CA Register + score entry + exam + submission workflow)
 *   1 teacher primary  (Primary school assessment workflow)
 * Run once: node backend/seed-help-entries-assessments.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entry ───────────────────────────────────────────────────────────────

  {
    feature_area: 'assessments',
    applicable_roles: ['admin'],
    title: 'Assessments — Admin View',
    body: `The Assessments page lets admins view and correct every assessment that teachers have created across all subjects, classes, and academic years. Open it from Assessments in the left navigation.

Page subtitle: "View and correct all assessments across teachers, subjects, and academic years."

Filters:

Six controls appear in the filter bar:

Academic Year — a dropdown of all academic years.
Semester — Semester 1 or Semester 2.
Teacher — a dropdown to filter to one teacher's assessments.
Subject — a text input; type any part of a subject name to filter.
Class — a text input; type any part of a class name to filter.
Search — a text input that searches across teacher name, subject, class, and assessment title.

Press Enter in any text input, or click Apply, to run the search with the current filter values.

Assessments table:

The table lists all matching assessments. Columns:

Teacher — the teacher who created the assessment. Click the column header to sort.
Subject — the subject the assessment belongs to. Sortable.
Class — the class the assessment is for. Sortable.
Year / Sem — the academic year and semester (e.g. "2024/25 · Sem 1").
Mode — the assessment mode (e.g. Class Test, Mid-term Exam). Sortable.
Title — the assessment title or label, truncated if long.
Date — the date the assessment was scheduled, if one was set.
Max Score — the maximum marks available for the assessment.
Scores — the number of students who have been scored. Shown in green if at least one score has been entered. Sortable.
Actions — Edit (pencil icon) and Delete (trash icon) buttons.

Editing an assessment:

Click the pencil icon on any row to open the Edit Assessment modal. Fields:

Academic Year — the year the assessment belongs to.
Semester — Semester 1 or Semester 2.
Mode — a dropdown of all assessment modes configured by the school.
Title — an optional label for the assessment (e.g. "Week 3 Test").
Date — an optional date the assessment was held.
Max Score — the maximum marks (required).

If scores have already been entered against this assessment, a warning appears: "Changing year/semester will move those scores to the new period." Click Save Changes to apply.

Deleting an assessment:

Click the trash icon on any row to open the Delete Assessment confirmation modal. The modal shows the assessment mode, title, subject, class, year, and semester. If students have already been scored on this assessment, a red warning shows how many scores will also be permanently deleted. Click Confirm Delete to proceed, or Cancel.`,
  },

  // ── Teacher entry (secondary school) ─────────────────────────────────────────

  {
    feature_area: 'assessments',
    applicable_roles: ['teacher'],
    title: 'CA Register and Score Entry',
    body: `The Assessments section of the teacher portal is where you create and manage your CA (continuous assessment) records and enter scores for your students. It covers four connected screens: the subject selector, the subject detail page, the CA scores screen, and the end-of-semester exam screen.

Subject selector (Assessments home):

The first screen shows all subject-class slots assigned to you in the timetable for the selected Academic Year and Semester. Use the two filter dropdowns at the top to switch year or semester. Each slot appears as a card with a coloured left stripe, the subject name in bold, and the class name. Tap any card to open that subject's detail page.

If no slots appear, your timetable has no entries for that year and semester — contact your admin to check your timetable assignments.

Subject detail page:

The subject detail page is the hub for one subject-class combination. The header shows the subject name, class, year, and semester. Two small buttons in the top-right corner let you download a bulk CA template (as an XLSX file) and upload a filled template back to save scores in bulk.

Submission status banner:

A banner near the top shows the current submission status for this subject. Possible statuses:

Draft — scores can still be added and edited. A "Submit for Review" button appears.
Submitted — you have submitted for HOD review. Scores are locked.
HOD Approved — the HOD has approved. Awaiting final admin sign-off. Scores are locked.
Final Approved — admin has given final approval. Awaiting publication. Scores are locked.
Published — results are live and visible to students. Scores are locked.
Returned — results were returned for correction. Edit scores and resubmit.

If a submission was returned, the reason appears in italic below the status. When locked, you cannot edit or delete assessments. Contact your HOD or admin to unlock.

End-of-Semester Exam link:

Below the banner, a button labelled "End-of-Semester Exam Scores" links to the exam scores screen. The button shows whether exam scores are complete (green ✓ N/N) or incomplete (red ✗ N/N) for the class.

CA Mode completion badges:

A panel shows all active CA modes (e.g. Class Test, Project, Mid-term). Each mode shows a green ✓ if at least one assessment has been created for it, or a red ✗ if none exist yet. These badges help you see which modes still need assessment entries.

Assessment list:

Below the badges, your created assessments are listed. Each item shows:
The assessment mode badge and date (if set).
The assessment label (title, or mode name if no title was given).
A score count — "Max: N | N/N students scored/absent" — with a green tint when all students are acted on.
An Edit (pencil) button on the right.
A Delete (trash) button when scores are not locked.

Tap the main body of any assessment card to open its CA scores screen.

Creating a new assessment:

Tap the green "+" floating action button in the bottom-right corner. A modal opens:
Mode (required) — select from your school's CA modes. The current usage and limit are shown (e.g. "2/3"). Modes at their maximum are greyed out and cannot be selected.
Title (optional) — a label, e.g. "Week 3 Test."
Date (optional) — the date the assessment was held.
Max Score (required) — the maximum marks for this assessment.

Tap Create to save. The assessment appears in the list immediately.

Editing an assessment:

Tap the pencil icon on any assessment card. The Edit Assessment modal opens with the same fields. If scores have been entered or the assessment is more than 48 hours old, the Academic Year and Semester fields are locked — you can still edit the mode, title, date, and max score. Tap Save Changes.

Bulk CA score upload:

To upload scores from a spreadsheet, first tap the download button (arrow-down icon) in the page header to get the class template in XLSX format. Fill in the scores column for each student, then tap the upload button (arrow-up icon) to send it back. A result modal shows how many scores were saved, how many rows were skipped (empty), and any errors by row number.

Submitting for HOD review:

When all your CA scores and exam scores are complete, tap "Submit for Review" in the status banner. A confirmation modal opens with a readiness checklist:

Each item is shown with a green ✓ (done), red ✗ (blocking), or amber warning:
End-of-semester exam — N/N students scored.
Each CA mode — whether at least one assessment exists and all students are acted on.

If any item is red, the "Confirm & Submit" button is disabled. Fix the issues (enter missing scores or create missing assessments) and try again. When all checks pass, a "All checks passed. Ready to submit." message appears and the Submit button becomes active.

CA scores screen:

When you tap an assessment card, you enter the score entry screen. The header shows the assessment label, subject, class, and max score. Download and upload template buttons are also available here.

A list of all students in the class appears. For each student:
Enter a score (number, up to the max score) in the input field on the right. Press Enter or Tab to move to the next student.
Tap the red × circle to mark a student Absent. The score input is replaced with an "Absent" badge. Tap the circle again to un-absent the student.

When scores are locked (status is Submitted or above), all inputs are greyed out and a lock notice explains the status.

Tap "Save Scores" or "Save Changes" at the bottom to save. A green confirmation banner appears with the save timestamp. The student count and last-saved time are shown below the save button.`,
  },

  // ── Teacher entry (primary school) ───────────────────────────────────────────

  {
    feature_area: 'assessments',
    applicable_roles: ['teacher'],
    title: 'Assessments — Primary School',
    body: `The Assessments page in the primary teacher portal is where you create assessments and enter scores for your primary school class. It uses a different structure from the secondary teacher portal — terms instead of semesters, and a simpler split-panel layout.

Page title: "Assessments." Subtitle: "Select a term and subject, then create or enter scores for each assessment."

Filters:

Two dropdowns appear at the top:
Term — select the academic term (e.g. Term 1, Term 2, Term 3). The current term is marked "(current)."
Subject — select one of your assigned subjects. When a subject is selected, a line on the right shows the class name, the maximum class score, and the maximum exam score for that subject.

Both selections must be made before the main content appears.

Layout — two panels:

The page is divided into a left panel (assessment creation and list) and a right panel (score entry).

Left panel — creating an assessment:

A "New Assessment" card shows three fields:

Mode (required) — select an assessment mode from the dropdown. Each mode shows its CA weight (e.g. "Class Test 1 (20%)") and whether it is a Terminal Exam. The usage count and limit are shown (e.g. "[2/3 used]"). Modes that have reached their limit are shown as disabled with "— Full."

Instance (required) — a title for this specific instance of the assessment, e.g. "Exercise 1", "Homework 3", or "Class Test 1."

Max Score (required) — the maximum marks for this assessment. A note below the field explains how the score will be scaled: scores are averaged within the mode, then weighted by the mode's CA weight toward the final class or exam score.

Click "Create & Enter Scores ▶" to save the assessment and automatically open it in the right panel for score entry.

Left panel — assessment list:

Existing assessments are grouped by mode. Each group shows the mode name and a badge indicating its type (blue for CA, purple for Terminal Exam) and weight. Within each group, assessment cards show the title, max score, and how many scores have been entered. Click any card to open that assessment in the right panel. A green dot on the card indicates it is currently selected. Click the × button on the right of a card to delete the assessment (and all its scores) after a confirmation prompt.

Right panel — score entry:

When an assessment is selected or just created, the right panel shows:

A header with the assessment title, mode badge, CA weight, subject, class, and max score. A note shows what the score scales to (e.g. "→ scales to 30 class marks"). A progress bar shows how many students have been scored (N/total entered).

A score table with columns: # (row number), Student (full name), Score / max (number input), and Absent (checkbox).

Enter each student's score in the Score input. The input accepts decimals (0.5 steps). If you tick the Absent checkbox, the score input is disabled and the row turns red.

Scores are validated in real time: if a score is outside the 0 to max range, the row turns amber and an error message appears below the input. The Save button is disabled while any scores are out of range.

Click "Save Scores" (or "Save Changes" if scores were previously entered) to save. A green confirmation bar appears: "✓ Scores saved — class scores recalculated." This confirms that the cumulative class scores for those students have been recalculated immediately.

The footer below the score table shows a note explaining the weighting: scores are averaged within the mode and then weighted by the CA weight toward the final class or exam score.

Standalone score entry page:

From other parts of the portal (e.g. links in the timetable or progress reports), you may be taken directly to a standalone score entry page for a specific assessment. This page shows the same score table and save button, with the assessment title, mode, subject, class, weight, and max score in the header. A sticky save bar at the bottom of the page includes a note about how scores will be scaled.

Assessment modes for primary are configured by the school admin in School Settings. If no modes are listed, contact your admin.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} assessments help entries…\n`);
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
