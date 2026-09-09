'use strict';
/**
 * Library seed: 10 help entries —
 *   8 admin  (Overview, Book Catalog, Loans, Overdue, Digital Resources, Library Staff, Loan Settings, Reports)
 *   1 teacher (Library — 5-tab: Overview, Issue, Return/Loans, Overdue, Catalogue)
 *   1 student (Library — 3-tab: Books, My Loans, Resources)
 * Run once: node backend/seed-help-entries-library.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin — Library Overview ──────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library Overview',
    body: `The Library Overview page is the home page of the library module for admins. Open it from Library in the left navigation.

Page subtitle: "Overview of books, loans, and digital resources."

Six stat tiles are shown at the top:

Total Books — the number of distinct book titles in the catalogue.
Total Copies — total physical copies across all titles.
Available — copies that are currently in the library and can be borrowed.
Active Loans — books currently out on loan (including overdue ones).
Overdue — loans whose due date has passed and have not been returned.
Digital Resources — number of uploaded e-books, past questions, and notes files.

Below the tiles, a Quick Links panel provides shortcuts to each section:

Manage Book Catalog — add, edit, and manage physical books and copies.
View All Loans — full loan history with status filter.
Overdue Books — list of all currently overdue loans.
Digital Resources — upload and manage PDFs available for students to download.
Manage Librarians — create librarian accounts and assign teachers to library duty.
Loan Settings — set the loan period, fine per day, and maximum loans per student.`,
  },

  // ── Admin — Book Catalog ──────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Book Catalog',
    body: `The Book Catalog page is where admins manage all physical books in the library. Open it from Library → Book Catalog (or the Quick Links on the overview page).

The page displays the total number of book titles in the subtitle (e.g. "42 book(s) in catalog").

Searching the catalog:

Type in the search box at the top to filter the list by title or author in real time.

Book table:

The main table has four sortable columns: Title (with author below in small text), Subject, Copies (total), and Avail. (available). Click any column header to sort. Clicking a row opens the Copies panel for that book on the right.

Adding a book:

Click "+ Add Book" in the top right. The Add Book modal opens with the following fields:

Title (required), Author, Publisher, ISBN (optional), Edition (e.g. "3rd"), Year Published (e.g. 2019), Subject, Level / Class, Category (General / Textbook / Reference / Fiction / Non-Fiction / Past Question / Local Author), Language (English, Twi, Ga, Ewe, Dagbani, Hausa, French, Other), Cover URL (optional, links to a cover image).

Click "Add Book" to save. The book appears in the table sorted alphabetically.

Editing a book:

Click "Edit" on any row to open the Edit Book modal pre-filled with the book's details. Change any fields and click "Save Changes."

Deleting a book:

Click "Delete" on any row. A confirmation dialog asks "Delete this book and all its copies?" — confirm to permanently remove the book and all its physical copies from the system.

Copies panel:

Click any book row to open the Copies panel on the right side. The panel shows the book title and total copy count.

Each copy card shows: Copy number (e.g. "#001"), Condition (Good / Fair / Poor), shelf location, borrower name if currently on loan, and a status badge:
In (green) — available in the library.
Out (amber) — currently on loan.
Lost / Damaged / Withdrawn (red / orange / grey) — not in circulation.

To delete a copy, click the × button on copies that are not currently on loan. Copies that are Out cannot be deleted until they are returned.

Adding a copy:

At the bottom of the Copies panel, fill in the "Add Copy" form: Copy # (e.g. "002"), Condition (Good / Fair / Poor), and Shelf location (e.g. "A-3, Row 2"). Click "Add Copy." The total and available counts update immediately.`,
  },

  // ── Admin — Loans ─────────────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Loans',
    body: `The Loans page shows all book loans in the system (the most recent 200). Open it from Library → Loans.

Page subtitle: "All book loans (latest 200)."

Filters:

Search — type a student name, student ID, or book title to filter the list in real time.
Status — filter by loan status: All statuses (default), Active (book is out), Returned (book has been brought back), Lost (book reported as lost).

Loan table:

Columns: Student (name + student ID and class), Book (title + author), Copy (#), Issued (date), Due (date — shown in red if overdue), Returned (date or "—"), Fine (GHS amount with paid status), Status (badge).

Status badges:
Active (blue) — book is currently out.
Returned (green) — returned on time or late.
Overdue (red) — active loan past its due date.
Lost (amber) — book reported as lost.

All labeled column headers are sortable. Click any header to sort the table.

Fines:

If a loan has a fine, it appears in the Fine column as "GHS X.XX" and shows "(paid)" in green if settled, or in red if outstanding. Fines are calculated automatically based on the daily fine rate configured in Loan Settings.

The Loans page is read-only from an admin perspective — to issue or return books, use the teacher or librarian portal.`,
  },

  // ── Admin — Overdue Books ─────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Overdue Books',
    body: `The Overdue Books page lists every currently overdue loan — books that are still out and past their due date. Open it from Library → Overdue Books.

Page subtitle shows the total number of overdue loans (e.g. "7 overdue loan(s)").

The table shows: Student (name + student ID + class), Book (title), Copy (#), Due Date (in red), Days Overdue (red badge, e.g. "5d"), and Fine (GHS amount if a fine has accrued, otherwise "—").

All column headers are sortable.

If there are no overdue loans, the table shows "No overdue books."

To process a return or waive a fine for an overdue loan, use the Return / Loans tab in the teacher/librarian portal (Return Book section).`,
  },

  // ── Admin — Digital Resources ─────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Digital Resources',
    body: `The Digital Resources page is where admins upload and manage downloadable files (e-books, past questions, notes) that students can access from their portal. Open it from Library → Digital Resources.

Page subtitle: "E-books, past questions, and notes."

Type filter:

Four filter pills at the top: All, E-Book, Past Question, Notes, Other. Click a pill to filter the list to that type.

Resource table:

Columns: Title, Type (coloured badge), Subject, Year (academic year), Level, Size, Downloads (count), and a View / Delete action column.

View — opens the file in a new browser tab.
Delete — permanently removes the resource. A confirmation dialog appears before deletion.

Uploading a resource:

Click "+ Upload Resource." The Upload Resource modal opens with:

Title (required) — the name shown to students.
Subject — the subject the resource is for (optional).
Type — E-Book, Past Question, Notes, or Other.
Academic Year — e.g. "2024" (optional).
Level / Class — e.g. "Form 1" (optional).
File (PDF) — click to select a PDF from your computer. Maximum file size: 6 MB. If the file is larger, an error is shown and you must choose a smaller file.

Click "Upload." The upload may take several seconds for larger files — wait for the success confirmation. The resource appears in the table immediately after upload.

Students access digital resources from their Library portal under the Resources tab.`,
  },

  // ── Admin — Library Staff ─────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Library Staff',
    body: `The Library Staff page is where admins manage dedicated librarian accounts and assign teachers to library duty. Open it from Library → Manage Librarians.

Page subtitle: "Manage dedicated librarian accounts and teachers assigned to library duty."

The page has two sections: Librarian Accounts (top) and Library Teachers (below).

Librarian Accounts:

Dedicated librarian accounts are for non-teaching staff who manage the library through the staff portal. The table shows Name, Email, Status (Active / Inactive), and Edit / Delete actions.

To add a new librarian, click "+ New Librarian." A form appears with fields: Full Name, Email address, and Password. Click "Create Account."

To edit a librarian, click "Edit" on their row. An inline edit form replaces the row with Name, Email, a "New password" field (leave blank to keep the existing password), and an Active checkbox. Click "Save" or "Cancel."

To delete a librarian, click "Delete" and confirm. This removes their login access.

Library Teachers:

Teachers can also operate the library through their teacher portal (the Library tab). To assign a teacher to library duty, type their name or teacher code in the "Assign a Teacher" search box on the right side. Click a result to assign them instantly. Assigned teachers appear in the "Library Teachers" list on the left.

To remove a teacher from library duty, click "Remove" on their row. This removes their library access but does not delete their teacher account.

A person assigned to library duty sees the Library tab in their portal with full issue, return, overdue, and catalogue management capabilities.`,
  },

  // ── Admin — Loan Settings ─────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Loan Settings',
    body: `The Loan Settings page configures the default rules for book lending. Open it from Library → Loan Settings.

Page subtitle: "Configure default loan rules and fines."

Three settings are available:

Loan Period (days) — the number of days before a borrowed book is due. Default: 14 days. Minimum: 1, Maximum: 90.

Fine Per Day (GHS) — the amount charged for each day a book is overdue. Set to 0 to disable fines entirely. Default: 0.50.

Max Active Loans per Student — the maximum number of books a student can have on loan at one time. Default: 3. Minimum: 1, Maximum: 20.

Click "Save Settings" to apply changes. A green confirmation message appears: "Settings saved successfully."

These settings take effect for new loans issued after the settings are saved. Existing loans keep their original due dates.`,
  },

  // ── Admin — Library Reports ───────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Library — Reports',
    body: `The Library Reports page gives circulation statistics, a most-borrowed titles ranking, and a full overdue loans list with fine totals. Open it from Library → Reports (if present in the navigation).

Page subtitle: "Circulation statistics, popular titles, and overdue tracking."

Date filter:

A "From" and "To" date picker at the top lets you narrow the circulation statistics to a specific period. Click "Apply Filter" to refresh the summary. Click "Clear" to return to all-time figures. The Most Borrowed Titles section shows "(filtered period)" or "(all time)" in the heading to indicate which range applies. The Current Overdue Loans list at the bottom is always live and is not affected by the date filter.

Circulation Summary:

Six stat tiles:
Total Issues — number of loans issued in the selected period.
Total Returns — number of books returned.
Currently Out — books currently on active loan.
Currently Overdue — active loans that are past their due date.
Fines Assessed — total fine amount calculated in the period (GH₵).
Fines Collected — total fine amount marked as paid (GH₵).

If there are outstanding (unpaid) fines, an amber banner shows the outstanding total.

Overdue Aging:

A horizontal bar chart shows the distribution of overdue loans by severity:
Mild (1–7 days) — amber bar.
Moderate (8–21 days) — orange bar.
Severe (>21 days) — red bar.

Each bar shows the number of loans in that range. If there are no overdue loans, "No overdue loans" is shown.

Most Borrowed Titles:

A ranked table showing each title, its author, and its borrow count for the selected period. A small green bar under each title shows its proportion relative to the most-borrowed book. Rank numbers appear on the left (1, 2, 3…).

Current Overdue Loans:

A full table of every currently overdue loan, showing Book (title + copy number + author), Student (name + student ID + class), Due Date, Days Overdue (colour-coded badge: amber for mild, orange for moderate, red for severe), and Fine (GH₵, with paid/waived status). The table footer shows total fines outstanding across all overdue loans. Severe loans (>21 days) have a red row background.`,
  },

  // ── Teacher — Library ─────────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['teacher'],
    title: 'Library — Teacher View',
    body: `The Library tab in the teacher portal is available to teachers who have been assigned to library duty by an admin. It has five tabs: Overview, Issue Book, Return / Loans, Overdue, and Catalogue.

Overview tab:

Five stat tiles: Total Books, Available, Active Loans, Overdue, and Returned Today. These reflect the current state of the whole library.

Issue Book tab:

Issue a book to a student in three steps:

Step 1 — Student: Enter the student ID (student code) in the input and click "Find" (or press Enter). The student's name, class, and number of active loans are shown in a green confirmation banner. If not found, a red error message appears.

Step 2 — Book: Type the book title, author, or ISBN in the search box. Available books appear in a dropdown as you type. Click a result to select it — selected book is shown in a green banner. If you clear the search, the selection is cleared.

Step 3 — Copy: After selecting a book, a dropdown shows all available copies with their copy number, condition, and shelf location. Select a copy. An optional Notes field is available. Click "Issue Book." On success, a green banner confirms "Book issued to [Student Name]" and all fields reset for the next issue.

If the book has no available copies, a red message is shown and the "Issue Book" button does not appear.

Return / Loans tab:

Shows all active loans. Use the search box to filter by student name or ID. Each loan card shows: book title, copy number, student name and ID, class, due date (shown as "OVERDUE" in red if past due), renewal count, and any outstanding fine.

Actions per card:
Return — marks the book as returned. If the book is overdue, a green confirmation banner shows the fine amount and days overdue. The loan disappears from the list.
Renew — extends the loan by the standard loan period. A confirmation banner shows the new due date.
Mark Fine Paid — appears when there is an unpaid fine. Marks the fine as paid in the system.
Waive Fine — appears when there is an unpaid fine. A reason input field appears; type the reason and click "Waive." The fine is waived and the banner confirms.

Overdue tab:

Shows only the loans that are currently past their due date. Each card is red-bordered and shows book title, copy number, student name/ID/class, days overdue, due date, and any outstanding fine. This is a read-only view — use the Return / Loans tab to process returns for overdue books.

Catalogue tab:

The same book catalogue as the admin Book Catalog page. Librarians can:
Search books by title, author, or ISBN.
Add a new book with full details (Title, Author, Publisher, ISBN, Edition, Year, Subject, Level, Category, Language).
Edit or delete existing books.
Manage copies for any book (view all copies, add new copies, mark copies as lost, or delete available copies).

Available copy count is shown as a green/red badge (e.g. "2/5" — available / total).`,
  },

  // ── Student — Library ─────────────────────────────────────────────────────────

  {
    feature_area: 'library',
    applicable_roles: ['student'],
    title: 'Library — Student View',
    body: `The Library page in the student portal lets you browse physical books, track your own loans, and download digital resources. Open it from Library in the student portal navigation.

Page subtitle: "Browse books, view your loans, and access digital resources."

Three tabs are available: Books, My Loans, and Resources.

Books tab:

The Books tab shows the library's entire physical catalogue. Use the search box at the top to filter by title, author, or subject.

Each book card shows: title, author, subject and level tags, a cover image (or a book icon if none is set), and an availability badge:
"X available" (green) — there are copies in the library right now.
"All out" (red) — every copy is currently on loan. An estimated return date ("Back ~[date]") appears below if available.

To borrow a book, bring the book card to the library staff or librarian — they will issue the copy through their system.

My Loans tab:

The My Loans tab shows your borrowing history. The tab label shows the count of active loans (e.g. "My Loans (2)") when you have books out.

Active Loans section — books you currently have borrowed:
Each card shows book title, author, copy number, issue date, renewal count (if renewed), due date (in red if overdue), and a "OVERDUE" or "Active" badge.
If not overdue, a "Renew" button appears — click it to extend your loan by the standard period. A green banner confirms the new due date.
If you have a fine, it is shown in red ("Fine: GH₵ X.XX — unpaid — please visit the library") or green (if paid or waived).

Return History section — books you have returned:
Each item shows the book title and the return date. If a fine was applied, its amount is shown.

Resources tab:

The Resources tab lists digital files uploaded by the library — e-books, past questions, and notes — that you can open and read online.

Filter pills at the top narrow the list: All, E-Books, Past Questions, Notes. Click a pill to filter.

Each resource card shows: the file icon, title, type badge, subject, academic year, and file size. Click "Open" to open the PDF in a new browser tab. The download count increments each time a resource is opened.

If no resources are available, a message reads "Resources are uploaded by your school. Check back later or try a different filter."`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} library help entries…\n`);
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
