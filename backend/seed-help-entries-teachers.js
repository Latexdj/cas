'use strict';
/**
 * Teachers seed: 8 admin help entries covering the Teachers list and Teacher Profile pages.
 * Run once: node backend/seed-help-entries-teachers.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Teachers List Overview',
    body: `The Teachers page lists every teacher account in your school. Go to Teachers in the left menu to open it.

The table shows each teacher's photo (or initial if no photo is uploaded), Teacher ID, full name, email address, department, weekly period count, role (Teacher or Admin), and status (Active or Inactive).

Columns can be sorted by clicking their header: ID, Name, Department, and Status all support sorting. An arrow beside the column name shows the current sort direction.

Four controls at the top let you narrow the list:

Search — type any part of a teacher's name, Teacher ID, email, or department. The list filters as you type.

Status filter — show All Statuses, Active only, or Inactive only.

Department filter — populated automatically from your existing teachers. Select one department to limit the list to that department.

Role filter — show all teachers, only those with Teacher role, or only those with Admin role.

The teacher list paginates when there are many records. Use the page controls at the bottom to move between pages, and the rows-per-page dropdown to change how many records show at once.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Adding and Editing a Teacher',
    body: `Click Add Teacher (top right of the Teachers page) to open the teacher form. The same form is used when you click Edit on an existing teacher row. It is divided into six sections.

Account section:
Teacher ID — leave blank when creating and CAS will generate one automatically (T001, T002, and so on). You can also type a custom ID. On an edit, the ID is pre-filled and not shown here.
Full Name — required.
Email and Phone — used for credential emails and staff communications.
Department — the teacher's department.
Password — required when creating. Leave blank on an edit to keep the existing password.
Status — Active or Inactive.
Admin role — tick this to give the teacher admin access to the portal in addition to their teacher access.

Personal Information section:
Gender, Date of Birth, Hometown, Residential Address, Religion, Religious Denomination, Ghana Card Number.

Professional Information section:
Government Staff ID, GES Rank (selected from a full GES rank list from Pupil Teacher to Director), Registered Number, NTC Number, SSF Number, Academic Qualification, Professional Qualification, Additional Responsibility, Association (GNAT, NAGRAT, CCT, and others).

Banking section:
Bank name, Branch, and Account Number. Stored for HR records.

Emergency Contact section:
Name and phone number of the person to contact in an emergency.

Notes section:
Free-text field for any internal notes about the teacher.

Responsibilities section:
Checkboxes for any responsibilities defined in Setup. Assigning a responsibility links the teacher to that responsibility in attendance and workflow tracking.

Click Save to create or update the record. Required fields (Name on create, Password on create) must be filled before the form will submit.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Teacher Profile Page',
    body: `Click Profile on any teacher row in the list to open their full profile page. The profile shows all information stored for the teacher, organised into the same sections as the form: personal, professional, banking, emergency contact, and documents.

At the top of the profile you see the teacher's photo (or initial), their name, Teacher ID, rank, and department as a heading. Below that, a summary card shows their status, whether they have admin access, their total timetabled periods per week, email, and phone. The phone number has a call icon beside it — clicking it opens a phone call directly from the browser.

Edit Profile button — appears at the top right. Clicking it switches every section into editable fields. Make your changes across any section, then click Save Changes to apply them all at once. Click Cancel to discard changes and return to the read-only view.

Photo upload — on the profile page, a small upload button appears on the teacher's photo circle. Click it to select an image file. The photo updates immediately and is shown in the teacher list as well.

Documents section — at the bottom of the profile. You can upload the teacher's academic certificate here (PDF, DOC, or DOCX). If a certificate is already on file, a link to it is shown and you can replace it. The certificate is stored securely and accessible only to admins.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Resetting a Teacher PIN',
    body: `Teachers log into the CAS teacher app using their Teacher ID and a numeric PIN. If a teacher forgets their PIN, you can reset it from the Teachers list page.

Find the teacher in the list and click the PIN button on their row. A dialog opens showing the teacher's name and a field for the new PIN.

You can either type a specific PIN (4 to 8 digits) or leave the field blank. If you leave it blank, the PIN is reset to the school's default PIN.

Click Reset PIN. The dialog then shows the new PIN so you can share it with the teacher directly.

If the teacher has an email address on file, an option to email the credentials appears immediately after the reset. Click Send Email to send the new PIN along with their Teacher ID to their email address. A confirmation message appears when the email has been sent.

Click Done to close the dialog.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Sending Login Credentials to Teachers',
    body: `CAS provides two ways to send a teacher their login details by email: one at a time, or all active teachers at once.

Sending to one teacher: find the teacher in the list and click the Login button on their row (shown in blue). This button is only active if the teacher has an email address stored. A confirmation dialog opens showing the teacher's name and email address, and warns you that their current PIN will be replaced. Click Send Credentials to proceed. A new PIN is generated, the teacher receives an email with their Teacher ID and new PIN, and you are shown the new PIN as a backup. The teacher must use the new PIN from this point forward.

Sending to all teachers at once: click Email All at the top of the Teachers page. The button shows how many active teachers with email addresses will receive the email. A browser confirmation appears before anything is sent. Once confirmed, CAS generates a new PIN for every eligible teacher and emails each one their details. A result banner appears showing how many emails were sent, how many were skipped (no email on file), and how many failed. Any failures are listed by name.

Use the bulk send when onboarding staff at the start of a term or after a system reset. Use the individual send when a specific teacher has been locked out or needs their credentials resent.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Bulk Uploading Teachers from a Spreadsheet',
    body: `If you need to add many teachers at once, use the Upload Excel feature instead of adding them one by one.

Click Upload Excel at the top of the Teachers page. The upload modal opens and shows the expected spreadsheet format:

Column A — Teacher ID. Leave blank to have CAS generate one automatically.
Column B — Full Name. Required.
Column C — Email.
Column D — Phone.
Column E — Department.
Column F — Is Admin. Type Yes or No. Default is No if left blank.
Column G — Notes.

The first row can be a header row with column labels, or it can be your first data row — CAS handles both.

To get a blank template, click "Download template" in the modal. A dialog asks whether you want an empty template (just column headers, no data) or a pre-filled template (your existing teachers already filled in, useful for cross-referencing). For the pre-filled version you can filter by Active or Inactive teachers. Click Download to save the file.

Fill in the spreadsheet and save it as .xlsx, .xls, or .csv. Then use the file picker in the Upload modal to select it, and click Import.

After the upload runs, the modal shows how many teachers were added successfully and lists any rows that were skipped (for example, a Teacher ID that already exists or a row with a missing name). Teachers that already exist are never overwritten by the upload — edit those individually.

All newly uploaded teachers receive the school's default PIN. Use the Email All button or the individual Login button on each row to send credentials.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Bulk Updating Existing Teacher Records',
    body: `The Update Records feature lets you update fields across many teachers at once using a spreadsheet. Unlike the Upload feature (which only adds new teachers), Update Records modifies existing ones.

Click Update Records at the top of the Teachers page. The update modal opens.

The spreadsheet must have Teacher ID in Column A — this is how CAS identifies which record to update. Every other column is optional: leave a cell blank to keep the existing value, or fill it in to overwrite it.

The full column layout is:
A: Teacher ID (required) — B: Name — C: Email — D: Phone — E: Department — F: GES Rank — G: Gov Staff ID — H: Gender — I: Date of Birth — J: Registered Number — K: NTC Number — L: SSF Number — M: Academic Qualification — N: Professional Qualification — O: Additional Responsibility — P: Bank — Q: Branch — R: Account Number — S: Religion — T: Religious Denomination — U: Hometown — V: Residential Address — W: Association — X: Ghana Card Number — Y: Emergency Contact Name — Z: Emergency Contact Phone — AA: Is Admin — AB: Notes — AC: Status

To make this easier, click "Download populated template" in the modal. This downloads a spreadsheet pre-filled with your existing teachers and all their current field values. Edit only the cells you want to change, delete any rows for teachers you are not updating, then upload the file.

After uploading, the modal shows how many records were updated, how many Teacher IDs were not found (listed by row), and any rows with errors. Nothing is deleted or reset by this process — only the cells you filled in are changed.`,
  },

  {
    feature_area: 'teachers',
    applicable_roles: ['admin'],
    title: 'Printing the Teacher List',
    body: `Click Print List at the top of the Teachers page to open a printer-friendly version of the teacher list in a new browser tab. The printed page shows a clean table with these columns: Teacher ID, Name, Email, Phone, Department, Periods, Role, and Status.

The print page reflects whatever filters and search terms are currently active. If you have filtered by department, status, or role, or searched for a name, only the matching teachers appear in the printed list. The filter summary line at the top of the page describes which filters are applied (for example, "Department: Science") so the printed copy is self-explanatory.

The page count and the date of generation are shown in the footer.

Use your browser's print dialog to send it to a printer or save it as a PDF. The browser's standard Print / Save as PDF option works for both.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} teacher help entries…\n`);
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
