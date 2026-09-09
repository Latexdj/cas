'use strict';
/**
 * Exeat seed: 6 help entries covering the admin, principal, and student exeat pages.
 * Run once: node backend/seed-help-entries-exeat.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'exeat',
    applicable_roles: ['admin'],
    title: 'Exeat Overview',
    body: `The Exeat page is where administrators monitor all student exeat activity across the school. Go to Exeat in the left menu to open it.

An exeat is a formal permission for a boarding student to leave school premises. CAS tracks two types:

Internal — a short absence of a few hours during the day. The student leaves and returns the same day.
External — an overnight or multi-day absence, typically a home visit or extended trip.

Students submit their own exeat requests through the student portal. Those requests then go to the housemaster or responsible teacher for approval. The admin Exeat page shows all records — pending, approved, currently out, overdue, and returned — as a complete monitoring view. Admins do not approve or reject exeats from this page; that is done by the responsible teacher or housemaster.

Five summary cards appear at the top of the page:
Total — every exeat record in the system.
Out — students who have been approved and are currently off campus.
Overdue — students whose expected return time has passed but who have not yet been marked as returned.
Pending — requests awaiting approval.
Returned — students who have returned and been checked back in.

A small line above the cards shows the current semester quota settings (for example, "Semester quota — Internal: 5 · External: 2 · from 05 Sep 2026"). If quotas have not been configured yet, an amber warning appears instead: "Exeat quotas not configured — students can request without limits."`,
  },

  {
    feature_area: 'exeat',
    applicable_roles: ['admin'],
    title: 'Filtering and Reading the Exeat Table',
    body: `The filter bar below the summary cards lets you narrow the exeat list before applying it. All filters except Search work server-side: make your selections and click Apply to reload the table.

Search — type any part of a student's name, Student ID, destination, or house name. The table filters as you type without needing to click Apply.

Status — filter to a specific status: Pending, Out, Overdue, Returned, or Rejected.

Type — show only Internal or only External exeats.

House — a dropdown populated from the houses that appear in the current result set. Select one house to see only students from that house.

Date range — From and To date pickers. When set, only exeats with a departure date in that range are returned.

Click Apply to run the filtered query. The record count below the filter row updates to show how many records match.

The table columns are:

Student — the student's full name, Student ID, and class on a sub-line. Sortable.
House — the student's house.
Type — a sky-blue Internal pill or a purple External pill. Sortable.
Status — colour-coded badge: Pending (amber), Out (blue), Overdue (red), Returned (green), Rejected (grey). Sortable.
Departed — the date and time the student left. Sortable by date.
Exp. Return — the expected return date and time. Shown in red when the exeat is overdue.
Returned — the actual return date and time once the student has been checked back in. A dash if not yet returned.
Granted By — the name of the teacher or admin who approved the request.

Each row has a More link at the right edge. Clicking it expands an inline detail panel showing: Destination, Reason, Parent Contact number, whether an SMS notification was sent, and any notes recorded on the request. Click Less to collapse it again.`,
  },

  {
    feature_area: 'exeat',
    applicable_roles: ['admin'],
    title: 'Configuring Exeat Quota Settings',
    body: `Exeat quotas control how many exeats of each type a student is allowed to request per semester. Click the Quota Settings button (gear icon, top right of the Exeat page) to configure them.

The settings modal has three fields:

Semester Start Date — required. The date from which exeat counts are measured. When this date is set, every student's used count is calculated from this date forward. At the start of a new semester you update this date and all students' used counts effectively reset to zero for the new period.

Max Internal — the maximum number of internal exeats a student may request per semester. Set this to match your school's policy (for example, 5). If set to 0, students cannot submit internal exeat requests at all — the internal option appears greyed out in the student portal.

Max External — the maximum number of external exeats allowed per semester. Same logic: set to 0 to block all external requests.

Click Save Settings to apply. The quota line at the top of the Exeat page updates immediately to reflect the new values.

If you have not yet set a semester start date, the amber warning "Exeat quotas not configured — students can request without limits" appears at the top of the page. Students can still submit requests, but CAS will not enforce any per-student limit until the settings are saved.`,
  },

  // ── Management entry ──────────────────────────────────────────────────────────

  {
    feature_area: 'exeat',
    applicable_roles: ['management'],
    title: 'Exeat Management (Principal View)',
    body: `The Exeat Management page in the principal portal shows how many exeats each student has used relative to the school's semester quota. Go to Exeats in the principal navigation to open it.

The header shows the current school quota in a single line, for example "School quota: 5 internal / 2 external". If any students have reached or exceeded their quota, a red alert below the title names the count: for example "3 students at/over quota".

The table lists every active student with four columns: Student (name and Student ID), Class, Internal Exeats, and External Exeats. The Internal and External columns each show a progress bar:

The bar fills left to right as used count increases relative to the quota. The bar is green when usage is below 75 percent of the quota, amber between 75 and 99 percent, and red at 100 percent. The number beside the bar shows used/quota (for example "3/5"). A red number means the student has hit the limit.

Use the Search field to filter by student name or ID. Use the Class dropdown to narrow the table to one class.

Override Quota button — top right. Opens a small modal where you can change the school-wide Max Internal and Max External values. This is the same quota the admin sets under Quota Settings. Changes take effect immediately.

This page is read-only for monitoring purposes. Approving or rejecting individual exeat requests is handled by the responsible teacher or housemaster from their view.`,
  },

  // ── Student entries ───────────────────────────────────────────────────────────

  {
    feature_area: 'exeat',
    applicable_roles: ['student'],
    title: 'Requesting an Exeat',
    body: `An exeat is a formal permission to leave school premises. You submit your own exeat requests through the Exeat section of the student portal, and your housemaster or a responsible teacher reviews and approves or rejects them.

To submit a request, tap the Request button at the top right of the Exeat page.

The request form asks for the following:

Exeat Type — choose between Internal (a few hours away during the day) or External (overnight or a longer trip). If you have already used up all your allowed exeats for one type, that option appears greyed out and shows Quota reached. If both types are at the limit, the form shows an All Quotas Reached message and you cannot submit a new request — contact your housemaster for an exception.

Destination — required. Where you are going (for example, Kumasi — family home).

Reason — required. The purpose of the trip (for example, Medical appointment).

Parent / Guardian Contact — your guardian's phone number, pre-filled from your student record. Edit it if the contact number for this trip is different.

Departure Date and Time — the date and time you plan to leave. The earliest allowed departure date is today.

Expected Return Date and Time — when you plan to return. The return date must be on or after the departure date.

Additional Notes — optional. Any extra information for your housemaster.

Tap Submit Request to send it for approval. The new request appears immediately in your request list with a Pending Approval status. You will need to wait for your housemaster to approve it before you leave.`,
  },

  {
    feature_area: 'exeat',
    applicable_roles: ['student'],
    title: 'Tracking Your Exeat Requests',
    body: `The Exeat page in the student portal shows your quota usage and a list of every exeat request you have made this semester.

Quota cards — two cards at the top of the page show your Internal and External usage. Each card shows how many you have used out of the allowed maximum and a progress bar. The bar turns amber when you are close to the limit and red when you have reached it. When a quota is full, the card shows "Quota reached — contact your housemaster". If no quota has been set by the school, the card shows the count you have used with "No limit set".

Request cards — each exeat request appears as a card in the list below the quota cards, newest first. Each card shows:

A type pill — Internal (green) or External (tan).
A status badge showing the current state of the request.
The destination, reason, departure date and time, and expected return date and time.
The name of the person who approved it, once it has been approved.
The actual return date once you have been checked back in.

The possible statuses are:

Pending Approval — your request has been submitted and is waiting for your housemaster to review it. Do not leave before it is approved.
Approved — Out — your request has been approved and you are currently recorded as off campus.
Overdue — your expected return time has passed and you have not been checked back in yet. A red notice on the card says "You have not returned by the expected time. Please report to your housemaster." Return and check in immediately.
Returned — you have returned and been checked back in successfully.
Rejected — your request was not approved. A red panel on the card shows the reason your housemaster provided. You may submit a new request if appropriate.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} exeat help entries…\n`);
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
