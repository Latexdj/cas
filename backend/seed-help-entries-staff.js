'use strict';
/**
 * Support Staff seed: 7 admin help entries covering the Support Staff management page
 * and the three sections of the Staff Portal (Clearance, Library, Inventory).
 * Run once: node backend/seed-help-entries-staff.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'Support Staff Overview',
    body: `The Support Staff page is where you create and manage accounts for non-teaching staff who use the CAS Staff Portal. Go to Support Staff in the left menu to open it.

Support staff are people who perform operational roles in the school but do not teach: clearance officers who process end-of-term student clearance, librarians who issue and return books, and store officers who manage school inventory items. They log in at the Staff Portal — a separate login page from the admin and teacher portals.

The table shows each staff member's name, email address, roles (shown as coloured pills), status (Active or Inactive), and the date the account was created.

Columns can be sorted by clicking their header: Name, Email, Status, and Created all support sorting.

Each row has three action links: Edit, Send Login, and Delete.

There is no search or filter bar on this page. If you have a large number of support staff accounts the list paginates — use the page controls at the bottom to navigate.`,
  },

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'Adding and Editing a Support Staff Account',
    body: `Click Add Staff (top right) to create a new support staff account. Click Edit on any row to modify an existing one.

The form has the following fields:

Full Name — required. The name displayed in the staff portal and in the account list.

Email — required. Used as the staff member's login username and for receiving credentials. Must be a valid email address.

Password — required when creating a new account. When editing, leave this blank to keep the existing password. Type a new password only if you want to change it.

Roles — at least one role must be selected. Tick the checkboxes for the sections this staff member should have access to in the Staff Portal:
  Clearance — lets the staff member process student clearance items at the end of term.
  Library — lets the staff member issue and return books and view the library dashboard.
  Inventory — lets the staff member issue and return school inventory items and generate sign lists.

A staff member can hold more than one role. If they have multiple roles, a section switcher bar appears at the top of their staff portal so they can move between sections.

When creating a new account, a note in the form confirms that login credentials will be emailed to the staff member automatically. The email contains their email address and password so they can log in immediately.

Click Create Account (when adding) or Save Changes (when editing) to save. Click Cancel to close without saving.`,
  },

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'Managing Support Staff Account Status and Credentials',
    body: `Three actions are available on each row of the Support Staff list.

Toggling Active or Inactive: click the Status badge (the green Active or red Inactive pill) directly on the row to switch it. There is no confirmation dialog — the badge flips immediately and the change takes effect at once. An inactive staff member cannot log into the Staff Portal.

Send Login: click Send Login on a row to reset the staff member's password and email them new credentials. A browser confirmation dialog appears first asking you to confirm, because this replaces their current password. Once confirmed, a new password is generated and emailed to the staff member. A success alert appears after the email is sent.

Delete: click Delete to permanently remove the staff account. A confirmation dialog appears first. Once confirmed, the account is deleted and the staff member can no longer log in. Any clearance, library, or inventory actions they previously took are preserved in the respective records — only their login account is removed.`,
  },

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'Staff Portal: Clearance Section',
    body: `A staff member with the Clearance role uses the Clearance section of the Staff Portal to process end-of-term student clearance. This is what they see and do in that section.

The section opens to the Pending tab, which lists every student who has a clearance item waiting for action at this staff member's office. Each row shows the student's photo, name, Student ID, class, current status badge, and an Action button.

Clicking Action opens a decision modal. The staff member chooses one of two outcomes: Cleared or Not Cleared. If they choose Not Cleared, a reason is required before they can confirm. After confirming, the pending list and the history update automatically.

The Student Lookup tab lets the staff member search for any student by Student ID. Typing the ID and pressing Search shows the student's photo, name, and class, then lists all clearance items for this staff member's office with their current status. Each item also has an Action button so the staff member can update the status directly from the lookup result.

The History tab shows a log of all clearance actions this staff member has previously taken — student name, ID, class, outcome (Cleared or Not Cleared), any notes recorded, and the date of the action.

If the staff member is assigned to more than one clearance office, a filter dropdown above the Pending list lets them narrow the view to one office at a time.`,
  },

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'Staff Portal: Library Section',
    body: `A staff member with the Library role uses the Library section of the Staff Portal to manage book loans. There are four tabs.

Dashboard tab: shows five summary figures — Total Books (in the library catalogue), Available (copies not currently on loan), Active Loans, Overdue (loans past their due date), and Returned Today.

Issue Book tab: the librarian types a Student ID and clicks Find to look up the student. After the student is confirmed, the librarian selects a book title from the dropdown (only titles with available copies are listed). After selecting a title, a second dropdown appears listing the available individual copies by copy number and condition. The librarian selects a copy, optionally adds a note, and clicks Issue Book to record the loan. The dashbaord counters update automatically.

Return Book tab: the librarian types a Student ID and clicks Find to look up the student. The student's active loans are listed. Each loan shows the book title, copy number, and due date. If the loan is overdue, the due date appears in red with an OVERDUE label. The librarian clicks Return on the relevant loan to record the return. If a fine applies (the book was returned late), a green confirmation panel shows the fine amount and the number of days overdue. If the student has no active loans, the section says so.

Overdue tab: lists every book currently overdue across all students, not just the ones the librarian has looked up. Each row shows the book title, copy number, student name, student code, class, due date, and how many days overdue it is. The count in the tab label updates to show the number of overdue books.`,
  },

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'Staff Portal: Inventory Section',
    body: `A staff member with the Inventory role uses the Inventory section of the Staff Portal to issue and return school items, and to generate printed sign lists. There are four tabs.

Items tab: shows the full list of inventory items. Each row shows the item name, category or type, asset tag (if any), available quantity out of the total quantity, and the condition (Good, Damaged, or Written Off). Items currently issued show how many units are out.

Issue tab: the store officer types a Student ID and clicks Find to confirm the student. After the student is confirmed, they select an item from the dropdown (only items with available stock and not Written Off are shown). They then set the quantity and add optional notes, then click Issue Item to record the issue. The item list updates automatically to reflect the reduced available quantity.

Return tab: the store officer selects the item being returned from a dropdown (only items currently out are shown). They set the quantity being returned, select the returned condition (Good or Damaged), and add optional notes. Clicking Confirm Return records the return and updates the available quantity.

Sign List tab: generates a printable paper sign list for distributing items to a large group. The store officer enters a document title (required) and optionally an item name, quantity per person, issue date, and notes. They then choose whether recipients are Students or Teachers and apply filters — for students: class, program, year batch, gender, and residential status; for teachers: department and gender. A live counter shows how many people match the current filters. Clicking Generate and Print opens a formatted print-ready sheet in a new browser tab with all the recipients listed and a signature column. Pop-ups must be enabled in the browser for this to work.`,
  },

  {
    feature_area: 'staff',
    applicable_roles: ['admin'],
    title: 'How Support Staff Log In',
    body: `Support staff do not log in through the same login page as teachers or admins. They have a separate Staff Portal login.

When you create a support staff account, CAS automatically emails the staff member their login credentials — their email address and an initial password.

The Staff Portal login URL is different from the admin portal URL. If a staff member asks where to log in, tell them to go to the Staff Portal link for your school. If you are unsure of the URL, check the address bar when you are on the Support Staff page — the Staff Portal is on the same domain but at a different path (typically /staff-portal).

If a staff member forgets their password or is locked out, use the Send Login button on their row in the Support Staff list. This resets their password and emails them a new set of credentials.

If a staff member should no longer have access, click the Active badge on their row to set their status to Inactive. This immediately prevents them from logging in without deleting their account history.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} support staff help entries…\n`);
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
