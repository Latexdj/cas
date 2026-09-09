'use strict';
/**
 * Student Clearance seed: 5 help entries —
 *   2 admin  (Clearance overview + Offices & Staff config)
 *   1 teacher (Clearance — pending queue, lookup, history)
 *   1 student (My Clearance — status banner, checklist)
 *   1 management/principal (Clearance — certificate check, summary, detail)
 * Run once: node backend/seed-help-entries-clearance.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin — main clearance page ───────────────────────────────────────────────

  {
    feature_area: 'clearance',
    applicable_roles: ['admin'],
    title: 'Student Clearance — Admin View',
    body: `The Student Clearance page lets admins track and manage the clearance process for certificate collection. Open it from Student Clearance in the left navigation.

Page subtitle: "Track and manage student clearance for certificate collection."

Clearance is the process of getting sign-off from each designated office (Library, Accounts, Housemaster, etc.) before a student can collect their leaving certificate. Each student's clearance record is made up of one item per configured office.

Initiating clearance — Batch Initiation:

Before students can be tracked, their clearance records must be created. Click "Initiate Batch Clearance" in the top-right corner to open the Batch Initiation modal.

The modal lists all classes. Tick the checkboxes next to the classes you want to initiate, then click "Initiate for N classes." Students who already have a clearance record are automatically skipped — it is safe to run this multiple times. After initiation, the modal shows a result summary: Total students found, Initiated (new records created), Skipped (already had records).

Filters:

Three controls appear in the filter bar:

Search — type a student name or student ID to narrow the list. Filters live as you type.
Class — a dropdown of all classes with clearance records. Filters to one class.
Status — filter by clearance state: Not Initiated (no record created), In Progress (some offices cleared), Fully Cleared (all offices signed off).

Student table:

The table lists all students with the following columns:

Student — full name (bold) and student ID (monospace, small).
Class — the student's class.
Status — one of four badges:
  "Not started" (grey) — clearance has not been initiated for this student.
  "Fully Cleared" (green) — all offices have signed off.
  "Action Required" (red) — at least one office has marked the student as Not Cleared.
  "In Progress" (amber) — initiated, but some offices are still pending.
Progress — a green progress bar showing cleared offices out of total (e.g. "3/5"). Not shown for students not yet initiated.
Initiated — the date the clearance record was created.
Actions — "View →" opens the student's detail drawer.

All table columns are sortable. Click any column header to sort.

Student detail drawer:

Click "View →" on any row to open a slide-in drawer from the right. The drawer header shows the student's name and ID. Inside, each clearance office is shown as a card:

Cleared (green) — the office has signed off. Any notes are shown below the office name. The action date is shown in small text.
Not Cleared (red) — the office has flagged an issue. The reason/notes appear on the card.
Pending (white/amber) — the office has not acted yet.

An "Override" button appears on every card. This lets an admin manually change the clearance status for that office regardless of whether the responsible staff has acted.

Admin Override modal:

Click "Override" on any office card to open the Admin Override modal. The modal shows the office name. Three buttons let you set the new status: Pending, Cleared, Not Cleared.

A Notes field is available — it is required when setting status to "Not Cleared" (you must state a reason). For Cleared or Pending, notes are optional. Click "Apply" to save. The drawer and student list both update immediately.`,
  },

  // ── Admin — offices & staff config ───────────────────────────────────────────

  {
    feature_area: 'clearance',
    applicable_roles: ['admin'],
    title: 'Clearance Offices & Staff',
    body: `The Offices & Staff page is where admins configure which offices are part of the clearance process and assign the staff responsible for each one. Open it from Student Clearance → Offices & Staff in the navigation (or a sub-link under Student Clearance).

Page subtitle: "Configure clearance offices and assign responsible staff."

This page is a prerequisite for the clearance system — no clearance records can be checked or actioned until at least one office is created and has staff assigned to it.

Page layout:

The page is divided into two columns. The left column lists all clearance offices. The right column shows either the staff assignment panel for the selected office or the office add/edit form.

Creating an office:

Click "+ New Office" to open the office form in the right panel. Fields:

Office Name (required) — e.g. "Library," "Accounts Office," "Housemaster."
Type — controls which students see this office in their clearance checklist:
  General — applies to all students, regardless of programme or house.
  HOD — applies by programme. A "Link to Programme" dropdown appears when this type is selected; leave it blank to apply to all programmes, or select one to target a specific programme's students.
  Housemaster — applies by house. A "Link to House" dropdown appears; leave blank for all houses, or select one house.
  Senior Housemaster — applies to all houses (same as General but signals the role of the responsible officer).
Sort Order — a number controlling the order in which offices appear in student checklists. Lower numbers appear first.

Click "Save Office" to create it. The office appears in the left column list.

Editing and deactivating an office:

Click "Edit" on any office card to load its details into the right-panel form. All fields are editable. When editing, an "Active" checkbox appears — untick it to deactivate the office. Inactive offices are shown with a grey "Inactive" badge and are excluded from new clearance records (they do not appear in students' checklists going forward). Existing records for that office are not removed. Click "Save Office" to apply changes.

Click "Del" on any office card to permanently delete it. This removes all staff assignments for that office but does not retroactively remove the office from existing student clearance records.

Assigning staff to an office:

Click any office card in the left column to open the staff assignment panel in the right column. The panel shows the office name and lists any already-assigned staff in a green row with a "Remove" button.

To add staff, type in the "Search teachers or clearance staff…" box. Two pools of people can be assigned:

Teachers — any teacher in the system, found by name or teacher code. Suitable for HODs, housemasters, and subject-related offices.
Clearance Staff — dedicated non-teaching staff accounts created specifically for the clearance system (see below). Found by name or email.

Click any search result to assign them to the office instantly. They move into the "Assigned" list. Click "Remove" to unassign them. A person can be assigned to multiple offices.

Non-teaching clearance staff accounts:

Staff who are not teachers (e.g. librarians, bursars, accounts clerks) cannot log in through the teacher portal. The system provides a separate "clearance staff" login for them.

Click "+ Add Staff Account" to open the Staff Account modal. Fields: Full Name (required), Email (required), Password (required for new accounts; leave blank when editing to keep the existing password).

Staff accounts appear in the right panel when no office is selected. Each row shows the staff member's name, email, and which offices they are assigned to. Edit or delete accounts with the Edit / Del buttons on each row.

Clearance staff log in at a separate URL provided by the admin. Once logged in, they see only the students pending for their assigned offices and can mark them cleared or not cleared from the same interface as teachers.`,
  },

  // ── Teacher clearance page ────────────────────────────────────────────────────

  {
    feature_area: 'clearance',
    applicable_roles: ['teacher'],
    title: 'Clearance — Teacher View',
    body: `The Clearance page in the teacher portal is where you process student clearance for any office you have been assigned to. Open it from Clearance in the teacher portal navigation.

Your assigned offices are shown as green badges in the page header (e.g. "Library," "Housemaster"). If the header shows no offices and a message reads "Not assigned to any clearance office," ask your admin to assign you to the relevant office.

Three tabs are available: Pending, Student Lookup, and History.

Pending tab:

The Pending tab (shown first) lists every student whose clearance item for your office has not yet been actioned — their status is still Pending. The tab label shows the total count in brackets (e.g. "Pending (12)").

If you are assigned to more than one office, an office filter dropdown appears at the top. Use it to filter the list to one specific office at a time, or leave it on "All my offices" to see every pending student across all your offices.

Each row shows the student's photo (or initial avatar), full name, student ID, class, current status badge, and an "Action" button. If you are assigned to multiple offices, the office name is also shown on each row.

Click "Action" to open the Clearance Action modal.

Clearance Action modal:

The modal header shows "Clearance Action" and the office name. Two decision buttons appear:

Cleared (green) — the student has met all requirements for this office.
Not Cleared (red) — the student has an outstanding issue with this office.

A "Reason / Notes" field is below the buttons. It is required when selecting "Not Cleared" — you must clearly state the reason (e.g. "2 overdue library books," "Outstanding house fee balance"). For Cleared, notes are optional.

Click "Confirm" to save. The student immediately moves from Pending to History (for your office), and their overall clearance status updates. If all offices clear the student, they become "Fully Cleared."

Student Lookup tab:

Use the Lookup tab to check any student's clearance status by their Student ID, even if they are not currently pending in your queue.

Type the Student ID into the search box and click "Search" (or press Enter). If found, the student's photo, name, ID, and class are shown, followed by a list of clearance items for your office. Each item shows the office name, current status badge, any notes, and the action timestamp.

An "Action" button appears on each item — use it to update the status exactly as you would from the Pending tab. If the student is not found, a red error message appears: "Student not found. Check the ID and try again."

History tab:

The History tab shows a record of every clearance action you have taken, across all your offices. Each row shows the student name, ID, class, the status you recorded (Cleared or Not Cleared), any notes, and the date the action was taken.

History is read-only — you cannot edit past actions from this view. If you need to correct a previous action, use the Lookup tab to find the student and submit a new action, which will overwrite the previous one. An admin can also override any status from the admin clearance page.`,
  },

  // ── Student clearance page ────────────────────────────────────────────────────

  {
    feature_area: 'clearance',
    applicable_roles: ['student'],
    title: 'My Clearance',
    body: `The Clearance page shows your personal clearance status for certificate collection. Open it from Clearance or My Clearance in the student portal navigation.

Overall status banner:

A large banner at the top of the page shows your overall clearance status at a glance. Four possible states:

Not Started (grey) — your clearance process has not been initiated by the school yet. No action is needed from you — contact your administrator if you believe this is an error.
In Progress (amber) — your clearance is active. Some offices have signed off, but others are still pending.
Action Required (red) — one or more offices have marked you as Not Cleared. See the details below to find out what is needed.
Fully Cleared (green) — all offices have signed off and you may collect your certificate.

The banner includes a progress bar showing how many offices have cleared you out of the total (e.g. "3 of 5 offices cleared — 60%"). If you are fully cleared, the date of completion is shown in the banner.

Finance — Accounts Office:

A separate "Finance" section appears below the banner showing your fee payment status:

If you have an outstanding fee balance, a red "Not Cleared" card is shown with the exact amount owed (e.g. "Outstanding balance: GH₵ 250.00") and a link to your fee statement page where you can view the breakdown.
If all fees are fully paid, a green "Cleared" card is shown: "All fees fully paid."

This finance check is automatic — it reads your live fee balance and does not require a teacher or admin to action it manually.

Clearance Checklist:

Below the finance section, a checklist shows one card per clearance office configured by the school. Each card has a coloured icon and border:

Green ✓ — Cleared. The office has signed off. Any note from the staff member is shown below the office name.
Red ✗ — Not Cleared. The office has flagged an issue. The reason is shown in a red box: "Reason: [text]." You must resolve this issue directly with that office and ask them to update your status.
Amber ● — Pending. The office has not yet reviewed your clearance.

The action timestamp (date and time the status was last updated) is shown in small grey text on each card.

You cannot change your own clearance status — only the assigned office staff or an admin can update it. If a status is wrong, speak to the relevant office or your admin.

Clearance Not Started state:

If your clearance has not been initiated, the checklist is empty and a message reads: "Clearance Not Started — Your clearance process has not been initiated. Please contact your school administrator."`,
  },

  // ── Principal clearance page ──────────────────────────────────────────────────

  {
    feature_area: 'clearance',
    applicable_roles: ['management'],
    title: 'Student Clearance — Principal View',
    body: `The Student Clearance page in the principal portal gives a read-only overview of all students' clearance status and a dedicated certificate verification tool. Open it from Clearance in the principal portal navigation.

Certificate Clearance Check:

A "Certificate Clearance Check" panel appears at the top of the page. Use this to quickly verify whether a specific student is cleared before issuing their certificate.

Type the student's ID code or full name into the input field and click "Check" (or press Enter). The result appears immediately below:

Fully Cleared (green) — shows the student's name, ID, class, programme, and the date they were fully cleared (e.g. "Fully Cleared — 12 Mar 2025"). Safe to issue the certificate.
Not fully cleared (red) — shows the student's name and ID, plus a list of the offices that have not yet signed off (e.g. "• Library • Accounts Office"). Do not issue the certificate until these are resolved.
Clearance not started — the student has no clearance record at all.

If the name or ID is not found, an error message is shown: "Student not found."

Summary tiles:

Three clickable tiles below the certificate check show the counts for the current class/status filter:

Fully Cleared (green) — students who have been cleared by all offices.
In Progress (amber) — students with an active clearance record that is not yet complete.
Not Started (grey) — students with no clearance record.

Click any tile to filter the table to only that group. Click the same tile again to remove the filter.

Filters:

A name/ID search field and a Class dropdown narrow the list further. The search filters as you type. The class dropdown is populated from the students in the table.

Student table:

The table lists all students with the following columns:

Student — full name and student ID (monospace).
Class — the student's class.
Program — the student's programme (or "—" if not assigned). Sortable.
Progress — a horizontal progress bar showing cleared offices out of total (e.g. "3/5"). Green when fully cleared (100%), amber otherwise. Shows "Not started" if no record exists.
Status — a badge: "Cleared" (green), "In Progress" (amber), or "Not Started" (grey). Sortable.
View — opens the student's detail modal.

All labelled column headers are sortable.

Student detail modal:

Click "View" on any row to open a detail modal for that student. The modal shows:

The student's name, ID, and class in the header.
An overall clearance summary — "Fully Cleared on [date]" (green) or "Clearance In Progress" (amber).
A list of every clearance office with its status:
  ✅ Cleared — who actioned it and when.
  ❌ Not Cleared — who actioned it, when, and the reason given (shown in a red italic box).
  ⏳ Pending — no action taken yet.

The principal view is read-only. To override a status, an admin must do so from the admin Student Clearance page.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} clearance help entries…\n`);
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
