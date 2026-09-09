'use strict';
/**
 * Students seed: 10 admin help entries covering the Students list, Student Profile,
 * Batch ID Card generation, and Admission Year Review pages.
 * Run once: node backend/seed-help-entries-students.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Students List Overview',
    body: `The Students page lists every student record in your school. Go to Students in the left menu to open it.

The table shows each student's photo (or initial if no photo has been uploaded), Student ID, full name, class, program, status, and notes.

Columns can be sorted by clicking their header: ID, Name, Class, Program, and Status all support sorting.

Four controls at the top filter the list:

Search — type any part of a student's name or Student ID. The list filters as you type.

Class filter — select a specific class to show only students in that class. The dropdown is populated from your existing classes.

Status filter — defaults to Active. Switch to Graduated, Inactive, or All Statuses to see other groups.

Program filter — shown only if programs are configured. Select one to narrow the list to students in that program.

The list paginates when there are many students. Use the page controls and the rows-per-page dropdown at the bottom to navigate.

An amber alert banner appears at the top if any active students have no year of admission assigned. Click it to open the Admission Years review page and fix the gaps.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Adding and Editing a Student',
    body: `Click Add Student (top right) to create a new student record. Click Edit on any row to modify an existing one. The same form is used for both and is divided into five sections.

Basic Information section:
Student ID — leave blank to have CAS generate one automatically. You can also type a custom ID.
Name — required.
Class — required. Selected from the dropdown of defined classes.
Status — Active (default), Graduated, or Inactive.
Program — optional. Select from the programs defined in your school.
Residential Status — Day or Boarding.
House — selected from the houses defined in your school.
Aggregate — the student's BECE aggregate score (6–36).
JHS Index Number — the student's Junior High School index number.
Year of Admission — the calendar year the student was admitted (e.g. 2024).

Personal Information section:
Gender, Date of Birth, Mobile Number, Ghana Card Number, NHIA Number, Hometown, Residential Address.

Religion section:
Religion and Religious Denomination.

Parent / Guardian section:
Guardian Name, Occupation, and Mobile Number.

Notes section:
Free-text field for any internal notes.

Click Save to create or update the record. Name and Class are required before the form will submit.

Student Portal Access (edit only): At the bottom of the edit form is a PIN section. It shows whether the student currently has a PIN set. You can type a new PIN in the field and click Set PIN, or leave the field blank and click Reset to reset it to the default (Student123). The student uses this PIN to log into the student portal.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Student Profile Page',
    body: `Click Profile on any student row to open their full profile page.

At the top you see the student's photo (or initial), their name, Student ID, class, and program as a heading. A quick-info card below shows their status, house, residential status, program, and age.

The rest of the page is divided into sections: Personal Information, Parent / Guardian, ID Card, and Scan History.

Edit Profile button — top right. Clicking it switches every section into editable fields. Make changes across any section, then click Save Changes. Click Cancel to discard and return to the read-only view.

Photo upload — a small upload button appears on the student's photo. Click it to select an image. Photos must be 30 KB or smaller. The photo appears in the student list and on the student's ID card.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Student ID Card — Generating and Downloading',
    body: `The ID Card section appears on every student profile page when you are not in edit mode.

If the student has no active card, the section shows a "No active card" message and a Generate ID Card button.

If the student already has a card, the section shows: the issue number, the date it was generated, the expiry date (or "No expiry" if none was set), and a short preview of the card token. Three buttons are shown.

Download PDF — downloads the existing card as a PDF. If no card exists yet, this button is labelled Generate ID Card and mints a new card first before downloading.

Download PNG — downloads the card as a PNG image. Only available when an active card already exists.

Reissue Card — revokes the current active card immediately and mints a new one with an incremented issue number, then downloads it as a PDF. A confirmation dialog appears before anything is revoked. Use this when a card is lost or damaged.

Issue Date and Valid Until fields appear above the buttons. These dates are pre-filled from the card's stored dates if one exists. They only take effect when a new card is being minted — an existing active card keeps its own dates until it is reissued.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Student ID Card Scan History',
    body: `The Scan History section at the bottom of every student profile page shows a log of every time that student's ID card QR code has been scanned.

Each row in the table shows:

Time — the date and time the scan happened.

Result — a colour-coded badge showing the outcome of the scan. Valid means the card was accepted. Revoked means a card that had already been revoked was presented. Expired means the card had passed its expiry date. Unknown token means the scanned code did not match any card in the system.

Card — the issue number of the card that was scanned, and its status at the time (if it was not active, this shows in amber).

Scanned by — the name of the user who performed the scan, or "public" if the scan was done through the unauthenticated public verification link.

IP — the IP address of the device that performed the scan. Shown as "purged" if the address has been removed from the log.

If no scans have been recorded for this student, the section shows "No scans recorded yet."`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Resetting a Student Portal Password',
    body: `Students log into the CAS student portal using their Student ID and a password. If a student forgets their password, you can reset it from the Students list.

Find the student in the list and click Reset Pwd on their row. The button turns green briefly and shows a tick to confirm the reset was successful. The password is immediately reset to the default (Student123). No dialog or confirmation is required.

For more control over the password — for example, to set a specific value — open the student's edit form and use the Student Portal Access section at the bottom. Type the new password in the field and click Set PIN, or leave it blank and click Reset to return to the default.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Bulk Uploading Students from a Spreadsheet',
    body: `Click Import Students at the top of the Students page to add many students at once from a spreadsheet.

The expected column format is:

Column A — Student ID. Leave blank to auto-generate.
Column B — Name. Required.
Column C — Class.
Column D — Program.
Column E — Status. Leave blank for Active.
Column F — Notes.

The first row can be a header or the first data row. A Reference sheet in the template lists valid values for Program and Status.

To get a blank template, click the Download template link inside the upload modal. A dialog lets you choose between an empty template (headers only) or a pre-filled one (your existing students already filled in). For the pre-filled version you can filter by class and by status. Click Download to save the file.

Fill in your data and save as .xlsx, .xls, or .csv. Then click the upload area in the modal to select the file. The import starts immediately after you select the file — there is no separate Import button.

After the upload runs, the modal shows how many students were added and lists any rows that failed with a reason. Students that already have the same ID are not overwritten by the upload.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Bulk Updating Existing Student Records',
    body: `Click Update Records at the top of the Students page to update fields across many students at once from a spreadsheet.

Column A must be the Student ID — this is how CAS identifies which record to update. Any other column you leave blank is skipped; only cells you fill in are changed.

The column layout matches the import template:
A: Student ID (required) — B: Name — C: Class — D: Program — E: Status — F: Notes — then additional profile fields for gender, date of birth, mobile, Ghana Card, NHIA number, hometown, residential address, religion, denomination, house, residential status, JHS index, aggregate, guardian name, guardian occupation, guardian mobile.

Click the Download template link in the update modal and choose the pre-filled option to download your existing student data into the spreadsheet. Edit only the cells you want to change, then upload the file by clicking the upload area in the modal.

After the update, the modal shows how many records were changed, how many Student IDs were not found (listed by row number and ID), and any rows with validation errors.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Promoting and Graduating Students',
    body: `Two workflow buttons at the top of the Students page handle end-of-year class transitions.

Promote Class — moves students from one class to another. Click the button, then choose the source class in the From Class dropdown. A list of all active students in that class appears with all of them checked by default. Uncheck any student who should repeat the year and not be moved. Type or select the destination class in the To Class field. Click Promote to move all checked students. The student count in the button label updates as you check and uncheck names.

Graduate Class — marks students as Graduated without moving them to another class. Click the button, choose the class to graduate, and review the student list. Uncheck anyone who should not yet graduate. Click Graduate to mark all checked students. A browser confirmation appears before the action runs. All historical attendance and assessment data for graduated students is preserved.

Both actions only affect active students. Students already marked Graduated or Inactive are not shown in the selection lists.`,
  },

  {
    feature_area: 'students',
    applicable_roles: ['admin'],
    title: 'Admission Year Review',
    body: `The Admission Years page lets you verify and correct the year-of-admission assigned to each class of students. Open it by clicking the Admission Years button at the top of the Students page, or by clicking the amber alert banner that appears when students are missing this value.

The page title is "Year of Admission — Review and Manage."

The main table lists every class with three columns: the class name, the total number of students, and the year currently assigned to most students in that class (the dominant year). A progress counter at the top right shows how many classes are fully verified.

Classes with students that have no year assigned are highlighted in amber and show an Assign button (amber). Classes that already have a year show a Change button. Classes with students spanning more than one admission year show a "mixed" label — this can happen when students are transferred between classes from different intakes.

To assign or change a year: click Assign or Change on a class row. A number input appears in the Year Assigned column. Type the correct four-digit year and click Save. The year is applied to all students in that class who do not yet have one, and any students who did have a year will have it updated to match.

The Year Batches panel on the right shows a summary: how many active students are in each admission year batch, and how many are still unassigned.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} student help entries…\n`);
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
