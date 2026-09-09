'use strict';
/**
 * Inventory seed: 7 help entries —
 *   6 admin  (Overview, Items, Categories, Transactions, Sign List, Report)
 *   1 teacher (HOD Dept Inventory — 3-tab: Items, Issue, Return)
 * Run once: node backend/seed-help-entries-inventory.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin — Inventory Overview ────────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['admin'],
    title: 'Inventory Overview',
    body: `The Inventory Overview page is the home page of the inventory module. Open it from Inventory in the left navigation.

Page subtitle: "Track school assets, equipment, and books."

Six stat tiles are shown at the top:

Total Items — the number of distinct item records in the system.
Total Units — total physical units across all items.
Available Units — units that are currently not issued to anyone.
Items Issued — number of distinct items that have at least one unit currently out.
Damaged — number of items whose condition is Damaged.
Activity Today — number of transactions (issues, returns, condition changes) recorded today.

Below the tiles, a Quick Actions panel provides shortcuts:

View All Items — goes to the full items list.
Add Item — goes to the items list and opens the Add Item form directly.
Manage Categories — goes to the Categories page.
Transaction Log — goes to the full transaction history.`,
  },

  // ── Admin — Inventory Items ───────────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['admin'],
    title: 'Inventory — Items',
    body: `The Inventory Items page lists all inventory items and is where admins manage stock, issue items, and record returns. Open it from Inventory → View All Items or "Add Item."

Page subtitle shows the current item count (e.g. "14 items").

Filters:

Four filter controls appear at the top:
Search — type a name, serial number, or asset tag to filter the list instantly.
Ownership — filter by General (managed by store officer) or Departmental (assigned to a specific department).
Category — filter by an inventory category (populated from the Categories page).
Type — filter by Equipment, Book, or Asset.
Condition — filter by Good, Damaged, or Written Off.

Item table:

Columns:
Name — item name (bold) with type and category below in small text, plus serial number and asset tag if set.
Ownership — "General" (grey badge) or the department name (purple badge).
Condition — "Good" (green), "Damaged" (amber), or "Written Off" (red) badge.
Units — shows available / total (e.g. "8 / 10") with "(2 out)" in amber if some are issued.
Location — the physical storage location, or "—."
Actions — context-sensitive buttons.

Action buttons per row:
Issue — appears when the item is not Written Off and has available units. Opens the Issue modal.
Return — appears when at least one unit is currently issued. Opens the Return modal.
Condition — always visible. Opens the Update Condition modal.
Edit — opens the Edit Item form.
Delete — permanently deletes the item and all its transaction history. A confirmation dialog appears.

Adding an item:

Click "+ Add Item." The Add Item modal opens with:
Name (required), Type (Equipment / Book / Asset), Category (optional, from Categories list), Ownership / Department (General — managed by store officer, or a specific department — managed by the HOD), Description, Serial Number, Asset Tag (auto-generated if left blank, e.g. "AST-0001"), Quantity (number of units being added; only shown when adding, not editing), Location, Acquired Date, Notes.

Click "Add Item" to save. The item appears in the table immediately.

Editing an item:

Click "Edit" on any row. The Edit Item modal opens pre-filled. All fields except Quantity are editable (to adjust units, use Issue/Return instead). Click "Save Changes."

Issue modal:

Opened from the "Issue" button on an item row. The modal shows the item name and available unit count.

Step 1 — Issuing To: choose one of three recipient types:
Student — enter the student ID (student code) and click "Find." The student's name, code, and class are shown in a green card. If not found, a red error appears.
Staff Member — type the recipient's full name and their role/position (e.g. "Lab Technician").
Department — type the department or section name (e.g. "Science Department").

Step 2 — Quantity: number of units to issue (maximum: available units).
Step 3 — Notes: optional.

Click "Confirm Issue." The available unit count decreases immediately and a transaction is logged.

Return modal:

Opened from the "Return" button. Shows item name and how many units are currently out.

Fields: Quantity Returned (maximum: units issued), Returned Condition (Good or Damaged), Notes (optional).

Click "Confirm Return." Available units increase and a transaction is logged. If the item is returned as Damaged, its condition updates accordingly.

Update Condition modal:

Opened from the "Condition" button. Shows the current condition.

New Condition options:
Good / Working — item is functional.
Damaged / Under Repair — item needs repair.
Written Off / Disposed — item is permanently removed from circulation. Warning: this sets available units to 0 and the item can no longer be issued.

Notes field — state the reason for the change (e.g. "Broken screen").

Click "Update Condition." The condition badge in the table updates immediately and a transaction is logged.`,
  },

  // ── Admin — Inventory Categories ─────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['admin'],
    title: 'Inventory — Categories',
    body: `The Inventory Categories page is where admins create and manage the categories used to organise inventory items. Open it from Inventory → Manage Categories.

Page subtitle: "Organise items by category."

The category table shows: Name, Description, Items (the number of items currently using this category), and Edit / Delete actions.

Creating a category:

Click "+ Add Category." The New Category modal opens with two fields: Name (required, e.g. "Electronics," "Lab Equipment") and Description (optional). Click "Create" to save.

Editing a category:

Click "Edit" on any row. The modal pre-fills with the current name and description. Make changes and click "Save."

Deleting a category:

Click "Delete" and confirm. You can only delete a category if no items are currently assigned to it. If items are using the category, an error is shown and the category is not deleted — reassign or delete those items first.

Categories appear in the Category dropdown when adding or editing an inventory item.`,
  },

  // ── Admin — Transaction Log ───────────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['admin'],
    title: 'Inventory — Transaction Log',
    body: `The Transaction Log is a full audit trail of all inventory activity. Open it from Inventory → Transaction Log.

Page subtitle: "Full history of all inventory activity."

Filter:

A dropdown at the top lets you filter by transaction type:
All Activity (default), Issued, Returned, Damaged, Repaired, Written Off, Added.

A "Refresh" button reloads the current page of results.

Transaction table:

Columns:
Date — date and time of the transaction (e.g. "5 Sep 2026 14:32").
Item — item name and category.
Action — a coloured badge showing the transaction type:
  Issued (blue), Returned (green), Damaged (amber), Repaired (teal), Written Off (red), Added / Adjusted (grey).
Qty — number of units involved.
Recipient — name and role/position of the person or department the item was issued to. "—" if not applicable.
Notes — any notes recorded at the time.
By — name of the user who performed the transaction.

Pagination:

Records are shown 50 per page. Use "← Prev" and "Next →" buttons to navigate. The footer shows the current range (e.g. "1–50") or the page number when a full page is shown.`,
  },

  // ── Admin — Sign List Generator ───────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['admin'],
    title: 'Inventory — Sign List Generator',
    body: `The Sign List Generator creates a printable distribution sheet that recipients sign when items are handed out. Open it from Inventory → Sign List (or a sub-link under Inventory).

Page subtitle: "Generate a printable sign sheet for students or staff to sign when items are distributed."

The page is divided into two panels: a configuration form on the left and a Preview panel on the right.

Document Details (left panel):

Document Title (required) — the heading that appears at the top of the printed sheet (e.g. "Exercise Books — Term 2 Issue").
Item / Reference — the name of the item being distributed (e.g. "3 in 1 Exercise Books"). Printed on the sheet as the item being issued.
Issue Date — defaults to today. Can be changed.
Quantity per Person — how many units each recipient receives (default: 1). Printed in each row.
Notes (optional) — a short note printed at the top of the sheet (e.g. "Collect from store room B").

Recipients & Filters (left panel):

Two tabs let you choose the recipient type:

Students — the sign list includes students. Available filters:
  Class — narrow to one class or leave on "All Classes."
  Program — filter by academic programme.
  Year Batch — filter by year of admission (e.g. "2023 Batch").
  Gender — Male, Female, or all.
  Residential Status — Day Students Only, Boarding Students Only, or both.

Teachers / Staff — the sign list includes teachers. Available filters:
  Department — filter to one department or all.
  Gender — Male, Female, or all.

Preview panel (right):

A live count updates as you change filters, showing how many recipients match the current selection. The preview also lists what the printed document will contain: school logo and header, document title and item details, numbered recipient rows, a signature column per person, and a store officer sign-off footer at the bottom.

Generating the sign list:

Click "Generate & Print." The system fetches the matching recipients and opens the sign list as a formatted HTML page in a new browser tab. The browser's print dialog opens automatically (or press Ctrl+P / Cmd+P). You can print to paper or save as a PDF.

If "Document Title" is empty, a red error message appears before generating. If pop-ups are blocked in your browser, an error is shown — allow pop-ups for the admin portal and try again.

Tip: the sign list opens in a new tab. If the print dialog does not open automatically, press Ctrl+P (Windows) or Cmd+P (Mac).`,
  },

  // ── Admin — Inventory Report ──────────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['admin'],
    title: 'Inventory — Report',
    body: `The Inventory Report page gives a high-level summary of all stock broken down by ownership type. Open it from Inventory → Report (or Inventory Overview → Report link if present).

Page subtitle: "Asset summary by ownership type and department."

Summary tiles at the top show school-wide totals:

Total Items — distinct item records.
Total Units — total physical units.
Available — units not currently issued.
Good — items in Good condition.
Damaged — items in Damaged condition.
Written Off — items that have been written off.

General Assets table:

Shows all items with General ownership in one aggregated row. Columns: Group, Items, Total Units, Available (green), Issued (amber), Good, Damaged, Written Off.

Departmental Assets table:

Shows one row per department that has items assigned to it. Same columns as above, with the Department name in the first column. This lets HODs and admin see at a glance which departments hold how many items and in what condition.

The report is read-only. All counts update in real time from the live database.`,
  },

  // ── HOD — Dept Inventory ──────────────────────────────────────────────────────

  {
    feature_area: 'inventory',
    applicable_roles: ['teacher'],
    title: 'HOD — Dept Inventory',
    body: `The Dept Inventory page in the teacher portal is available to teachers who are heads of department. It lets HODs view, issue, and record returns for items assigned to their department. Open it from the HOD Dashboard → Inventory section (or directly from the teacher portal navigation if listed).

Page subtitle: "Items assigned to your department."

If you head multiple departments, a department switcher dropdown appears below the page header. Select the department to view its items.

Three tabs are available: Items, Issue Item, and Return Item.

Items tab:

Lists all inventory items assigned to your department. Each card shows: item name, asset tag (monospace), category, location (if set), a condition badge (Good/green, Damaged/amber, Written Off/red), and three counts:
Available — units currently in stock (green if > 0, red if 0).
Total — total units in the system for this item.
Issued — units currently out with someone (amber).

A "Refresh" button reloads the list from the server.

If no items are assigned to your department, a message reads "No inventory items assigned to your department. Contact admin to assign departmental items."

Issue Item tab:

Issue a unit from your department's stock to a staff member, student, or another department/section.

Select an item from the dropdown (only items with available units are listed). Choose who you are issuing to using the Issue to selector:

Staff — enter the staff member's full name and their optional role/title (e.g. "Lab Technician").
Student — enter the student code and click "Find." The student's name and class are shown in a green card if found.
Department — enter the department or section name (e.g. "Science Lab").

Enter the quantity and any optional notes (e.g. expected return date, purpose). Click "Issue Item." A green success message confirms the issue and the Items tab count updates.

Return Item tab:

Record an item being returned to department stock.

Select an item from the dropdown (only items with units currently issued are listed — shown as "X issued"). Enter the quantity returned and the condition the item was returned in (Good or Damaged). Add optional notes about the item's state. Click "Record Return." A green success message confirms the return and the available count updates.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} inventory help entries…\n`);
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
