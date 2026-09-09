'use strict';
/**
 * Fees / Accounts seed: 8 help entries —
 *   6 admin  (Overview, Fee Items, Schedules, Collections, Expenditure, Arrears Report)
 *   1 management/principal (Financial Overview — read-only)
 *   1 student (My Fee Statement)
 * Run once: node backend/seed-help-entries-fees.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin — Accounts & Fees Overview ─────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['admin'],
    title: 'Accounts & Fees Overview',
    body: `The Accounts & Fees page is the central hub for all financial management in the school. Open it from Fees or Accounts in the left navigation. It is available in both the main admin portal and the primary school admin portal, where it operates identically.

Page header: "Accounts & Fees"
Page subtitle: "Manage fee schedules, record payments, and track outstanding balances."

Five stat tiles appear at the top of the page when data is present:

Fees Collected — total payments recorded across all students (green).
Total Expenses — total expenditure recorded (red).
Surplus / Deficit — net financial position: Fees Collected minus Total Expenses. Green if positive (surplus), red if negative (deficit).
Fees Outstanding — total amount owed but not yet paid across all student accounts (amber if > 0, green if cleared).
Students Billed — the number of students who have at least one bill on their account (purple).

Below the stat tiles, five tabs give access to every aspect of fee management:

Fee Items — define the categories of fees charged (e.g. "School Fees," "PTA Levy," "Sports Fees").
Schedules — set amounts per class and term, then generate bills for all matching students with one click.
Collections — look up individual student accounts to record payments and view bills.
Expenditure — record and track school expenses, with a date-range Income vs. Expenditure summary.
Arrears Report — generate a list of all students with outstanding balances, filterable by year, term, and class.`,
  },

  // ── Admin — Fee Items ─────────────────────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['admin'],
    title: 'Accounts & Fees — Fee Items',
    body: `The Fee Items tab defines the categories of fees that can be charged to students. Open it from Accounts & Fees → Fee Items.

Page description: "Define categories of fees charged to students."

Fee items are the building blocks of the fee system. Every schedule and payment is linked to a fee item. Examples: "School Fees," "PTA Levy," "Library Fine," "Sports Fee."

Fee Items table:

Columns: Name, Description, Status (Active / Inactive badge), and Edit / Delete actions.

Creating a fee item:

Click "+ Add Fee Item." The New Fee Item modal opens with:
Name (required) — the fee category name (e.g. "School Fees").
Description — optional detail (e.g. "Termly tuition fees").
Active checkbox — active items appear in the fee schedule and payment dropdowns; inactive items are hidden from those lists but their historical records are preserved.

Click "Save."

Editing a fee item:

Click "Edit" on any row. The modal opens pre-filled. All fields including the Active toggle are editable. Click "Save."

Deleting a fee item:

Click "Delete" and confirm. If the item has schedules, bills, or payments linked to it, the system will reject the deletion and show an error — remove or reassign those records first.

Tip: inactive fee items no longer appear in the Fee Schedule dropdown when creating new schedules, nor in the fee type dropdown when recording payments. Use inactive status to retire a fee type without losing historical data.`,
  },

  // ── Admin — Fee Schedules ─────────────────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['admin'],
    title: 'Accounts & Fees — Schedules',
    body: `The Schedules tab is where admins set how much each class owes per term for each fee type, and then generate the actual bills for students. Open it from Accounts & Fees → Schedules.

Page description: "Set fee amounts per class and term, then generate bills for students."

Schedules table:

Columns: Fee Item, Class, Year / Term, Amount (GH₵), Due Date, and action buttons.

The Class column shows "All Classes" (grey) for schedules that apply to every class.

Creating a schedule:

Click "+ Add Schedule." The New Fee Schedule modal opens with:
Fee Item (required) — select from active fee items.
Academic Year — leave on "Any Year" for a standing schedule, or pin to a specific year.
Term / Semester — Term 1, Term 2, Term 3, or "Any Term."
Class — select one class or leave on "All Classes" to apply to every class.
Amount (GH₵) (required) — the amount owed per student matching this schedule.
Due Date — optional. If set, it appears on the student's bill and triggers overdue tracking.

Click "Save."

Editing a schedule:

Click "Edit" on any row to update the schedule. Existing bills generated from this schedule are not retroactively changed — only new bills generated after the edit will use the updated amount.

Generating bills:

Click "⚡ Generate Bills" on any schedule row. A confirmation dialog appears: "Generate bills for all matching active students? Existing bills for this schedule will be skipped."

Click OK. The system creates one bill per matching student (students whose class matches the schedule's class filter, and who are enrolled in the current academic year). A green success message appears: "X bills generated, Y skipped (already had bills)." The Fees Collected and Students Billed stat tiles update.

Important: "Generate Bills" is safe to run multiple times — students who already have a bill for this schedule are skipped automatically.

Deleting a schedule:

Click "Delete" and confirm. This deletes the schedule definition only — bills already generated from it are not removed.`,
  },

  // ── Admin — Collections ───────────────────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['admin'],
    title: 'Accounts & Fees — Collections',
    body: `The Collections tab is where the bursar records fee payments for individual students and views their full account. Open it from Accounts & Fees → Collections.

How to find a student:

Type the student's name or student ID into the search box at the top. A dropdown of matches appears after two characters. Click a name to load that student's full account.

Student account view:

Once a student is selected, four summary cards appear:
Student name and ID (in a beige info card).
Total Billed — the total of all bills on their account (blue).
Total Paid — the total of all payments recorded (green).
Outstanding — Total Billed minus Total Paid (red if > 0, green if fully paid).

A "+ Record Payment" button appears beside the summary cards.

Bills table:

Shows all bills on the student's account. Columns: Description, Amount, Paid (so far), Outstanding (red if > 0), Due Date, Delete.
Click "Delete" on a bill row to permanently remove that bill and adjust the balance. A confirmation dialog appears.

Payment History table:

Shows all payments recorded for this student. Columns: Date, Amount, Method, Receipt No. (monospace), Reference, Recorded By, Void.
Click "Void" to permanently reverse a payment. A confirmation dialog appears: "Void this payment? This cannot be undone."

Recording a payment:

Click "+ Record Payment." The Record Payment modal opens with:
Apply to Bill (optional) — select a specific outstanding bill from the dropdown. The outstanding amount auto-fills in the Amount field. If left on "General Payment," the payment is not tied to a specific bill.
Fee Type (optional) — appears only when no bill is selected; lets you tag the payment to a fee category without linking it to a bill.
Amount (GH₵) (required).
Payment Date (required) — defaults to today.
Payment Method (required) — Cash, Mobile Money, Bank Transfer, Cheque, or POS.
Reference / Transaction ID — optional; use for mobile money transaction codes, cheque numbers, etc.
Notes — optional.

Click "Record Payment." The payment is saved, a receipt number is auto-generated, and the student's Outstanding balance updates immediately.`,
  },

  // ── Admin — Expenditure ───────────────────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['admin'],
    title: 'Accounts & Fees — Expenditure',
    body: `The Expenditure tab is where school expenses are recorded and tracked. Open it from Accounts & Fees → Expenditure.

Filter controls:

From / To — date range for the expense list. Leave blank to show all.
Category — filter by expense category.
Click "Filter" to apply. The table reloads with matching records.

"📊 Income vs. Expenditure" button:

Click this button to load a summary panel above the table showing:
Total Income (Fees Collected), Total Expenditure, and Surplus or Deficit (net position).
Below the three tiles, "Expenditure by Category" shows each category used in the current date range with its total spend.
Click the × button to dismiss the summary.

Expense table:

Columns: Date, Category (grey badge), Description, Paid To, Method, Amount (red), Edit / Delete.
A Total row in the footer sums all amounts in the current filtered view.

Adding an expense:

Click "+ Add Expense." The Record Expense modal opens with:
Category (required) — choose from: Salaries & Wages, Utilities, Stationery & Supplies, Maintenance & Repairs, Transport & Fuel, Food & Catering, Medical & Health, Printing & Copying, Sports & Activities, Petty Cash, Other.
Description (required) — e.g. "Electricity bill for January."
Amount (GH₵) (required).
Date (required) — defaults to today.
Payment Method — Cash, Mobile Money, Bank Transfer, Cheque, or POS.
Paid To (Vendor / Recipient) — optional; name of the supplier or payee.
Reference / Voucher No. — optional; enter an invoice or voucher number for audit purposes.
Notes — optional.

Click "Save."

Editing an expense:

Click "Edit" on any row. The modal opens pre-filled. All fields are editable. Click "Save."

Deleting an expense:

Click "Delete" and confirm. The record is permanently removed and the Surplus / Deficit tile updates.

Tip: expenses are included in the Surplus / Deficit calculation shown in the top-level stat tiles and in the principal's Financial Overview page. Keep records up to date so the financial position is accurate.`,
  },

  // ── Admin — Arrears Report ────────────────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['admin'],
    title: 'Accounts & Fees — Arrears Report',
    body: `The Arrears Report tab generates a list of all students with outstanding fee balances. Open it from Accounts & Fees → Arrears Report.

Description: "Select filters above and click Generate Report."

Filter controls:

Academic Year — filter to a specific year, or leave on "All Years."
Term — Term 1, Term 2, Term 3, or "All Terms."
Class — a specific class or "All Classes."

Click "Generate Report." The system queries all students with a positive outstanding balance matching the selected filters.

Report results:

If no students have outstanding balances under the selected filters, a message reads: "No outstanding balances found."

If there are results, a red summary banner appears at the top: "Total Outstanding: GH₵ X,XXX.XX" and a count of students with arrears (e.g. "23 student(s) with arrears").

Students are grouped by class. Each class group shows a header with the class name, the number of students in arrears, and the total outstanding for that class (e.g. "Form 2A — 5 student(s) — GH₵ 4,200.00").

Within each class group, a table shows: Student (full name), ID (student code), Total Billed, Total Paid (green), Outstanding (red).

Pagination controls appear below the full results when there are many students.

Use this report to identify students who need to settle outstanding balances before term end, exams, or clearance.`,
  },

  // ── Principal — Financial Overview ───────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['management'],
    title: 'Financial Overview — Principal View',
    body: `The Financial Overview page in the principal portal gives a read-only summary of the school's fee collections and expenditure. Open it from Fees or Accounts in the principal portal navigation.

Page header: "Financial Overview"
Page subtitle: "Read-only summary of fee collections and school expenditure."

If the Accounts & Fees module has not been activated for the school, the page shows: "Accounts & Fees Not Enabled — This module has not been activated for your school."

Summary stat cards:

Six cards appear at the top showing the school-wide totals:
Total Billed — total amount billed to all students (blue).
Fees Collected — total payments received (green).
Collection Rate — percentage of billed fees collected, colour-coded: green (≥ 80%), amber (50–79%), red (< 50%).
Outstanding Fees — unpaid balance across all students (amber if > 0, green if none).
Total Expenditure — total school expenses recorded (red).
Surplus / Deficit — net position (Fees Collected minus Total Expenditure): green if surplus, red if deficit.

Fee Collection by Class table:

One row per class. Columns (all sortable):
Class, Students Billed, Total Billed, Collected (green), Outstanding (amber if > 0), Collection Rate.

The Collection Rate column shows a horizontal bar: green (≥ 80%), amber (50–79%), red (< 50%).

A Total footer row summarises all classes.

Income vs. Expenditure section:

Two horizontal bars compare Total Income (Fees Collected) and Total Expenditure, scaled so the larger of the two fills its bar fully.

Below the bars, a Surplus / Deficit card shows the net position.

An "Expenditure by Category" sub-section lists each expense category with its total spend and its share of total expenditure as a percentage bar.

This page is read-only — no data can be edited here. Contact the bursar or admin to update fee records.`,
  },

  // ── Student — My Fee Statement ────────────────────────────────────────────────

  {
    feature_area: 'fees',
    applicable_roles: ['student'],
    title: 'My Fee Statement',
    body: `The Fees page shows your personal fee statement — all bills raised against your account and all payments recorded for you. Open it from Fees or My Fees in the student portal navigation.

If the Accounts & Fees module is not enabled for your school, the page shows: "Fee statements are not available for your school."

Outstanding balance alert:

If you have an unpaid balance, a red banner appears at the top of the page:
"Outstanding Balance — GH₵ X,XXX.XX"
Below the amount: "Unpaid balances may affect your clearance and exam eligibility."

Fee Statement summary card:

A coloured card shows your account at a glance:
Total Billed — the total amount charged to your account.
Total Paid — the total amount recorded as paid.
Outstanding — the balance remaining (red if you owe money, green if fully paid).

A Payment Progress bar below the three figures shows the percentage of your total bill that has been paid. The bar turns green when 100% is reached.

Two tabs let you explore your account:

Bills tab:

Shows all fee bills raised on your account. Each bill appears as a card with:
Bill name (fee type, e.g. "School Fees," or the schedule name).
Status badge: Paid (green) — balance is zero. Part Paid (amber) — some payment received but not fully settled. Unpaid (red) — no payment received.
Billed — the total amount charged.
Paid — amount received so far (green).
Balance — amount still owed (red if > 0, green if nil).
Due Date — the date by which the bill should be settled, if set.
A mini progress bar showing the proportion paid.

Payments tab:

Shows all payments recorded against your account. Each payment appears as a card with:
A green tick icon.
Fee label (the fee type or bill the payment was applied to).
Amount paid (green, right-aligned).
Date, payment method, and receipt number (if any).
Notes from the bursar, if any.

You cannot record or delete payments yourself — contact the accounts office if a payment is missing or incorrect.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} fees help entries…\n`);
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
