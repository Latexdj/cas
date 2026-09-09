'use strict';
/**
 * Admissions seed: 5 help entries — all admin
 *   Applications, Placement List, Prospectus Files, Reports, Portal Settings
 * Run once: node backend/seed-help-entries-admissions.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin — Applications ──────────────────────────────────────────────────────

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Admissions — Applications',
    body: `The Applications page is the central hub for managing all admission applications submitted through the school's public admission portal. Open it from Admissions → Applications in the left navigation.

Page header: "Applications"
Page subtitle: "Manage admission applications from prospective students."

Pipeline stat bar:

Seven stat tiles across the top show the full admission pipeline:
Placed — total students on the CSSPS placement list.
Registered — students who have registered on the portal (claimed their form link).
Pending — applications where the student has not yet completed the form.
Completed — students who have submitted all form steps (personal, academic, guardian, documents, review).
Reported — students marked as having physically reported to the school.
Migrated — students whose application has been converted into a full student account.
Total Apps — total applications in the system.

Filters:

Search — type a name, index number, or admission number to filter instantly.
Status dropdown — All Statuses, Pending, Completed, Reported, or Migrated.

Applications table:

Columns: Admission No. (monospace), Name, Index No. (monospace), Program, House, Status (coloured badge), Date (application date), and Actions.

Status badges:
Pending (grey) — form not yet completed.
Completed (blue) — form submitted; awaiting physical reporting.
Reported (green) — student has physically reported to the school.
Migrated (purple) — student has been moved to the main student roster.

Clicking any row opens the Application Detail modal.

Row action buttons (context-sensitive):
"Reported" — appears for Completed applications. Click to mark the student as having physically reported.
"Migrate" — appears for Reported applications. Click to open the Migrate modal for this individual student.
"Del" — permanently deletes the application. A confirmation dialog appears.

Application Detail modal:

Opens when you click any row. Shows the student's photo (if uploaded), full name, admission number, and status badge.

Fields displayed: Index Number, Gender, Date of Birth, Program, House, Residential Status, Mobile, Hometown, Ghana Card, NHIA No., Religion, Aggregate, Guardian name, Guardian relationship, Guardian mobile, Applied date.

A "View BECE Results Slip" link appears if a document was uploaded.

Action buttons in the modal:
"Mark as Reported" — changes status from Completed to Reported.
"Migrate to Students" — opens the Migrate modal for this student.
"Delete Application" — permanently removes the record.

Migrating applicants to students:

Migration converts a Reported application into a full student account in the main Students module.

Individual migration: Click "Migrate" on a Reported row (or "Migrate to Students" in the detail modal). The Migrate modal opens.

Bulk migration: Click "Migrate Reported → Students" at the top-right of the page (enabled only when at least one application is in Reported status). The Migrate modal opens showing how many reported students will be migrated.

In the Migrate modal:
Default Class Assignment — enter the class the new students should be placed into (e.g. "1A" or "Form 1"). Students can be moved to specific classes afterwards in the Student roster.
Students receive login credentials automatically. Default password: Student123.

Click "Migrate Student" (single) or "Migrate All Reported" (bulk). A green result panel shows how many were migrated, how many were skipped (already migrated), and any errors.

Pagination:

Results load 50 per page. Prev / Next buttons appear when there are more pages.`,
  },

  // ── Admin — Placement List ────────────────────────────────────────────────────

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Admissions — Placement List',
    body: `The Placement List page is where the school uploads the CSSPS (placement authority) Excel file so that the system knows which students are eligible to apply. Open it from Admissions → Placement List.

Page header: "Placement List"
Page subtitle: "Upload the CSSPS placement Excel file. Columns: IndexNo, FullName, DOB, Gender, Aggregate, Programme, ResidentialStatus"

How it works:

The placement list is the master list of students assigned to your school by CSSPS. Only students whose index number appears on this list can successfully submit an application through the public admission portal. When a prospective student enters their index number on the Check Placement page, the system looks them up here.

Uploading the placement file:

The file must be in Excel format (.xlsx, .xls) or CSV (.csv). The required column headers are: IndexNo, FullName, DOB, Gender, Aggregate, Programme, ResidentialStatus.

Steps:
1. Click "Choose File" (or the file input field) and select the Excel/CSV file.
2. Click "Upload Excel."
3. A green result panel appears: "X records uploaded." If any rows were skipped (duplicate index numbers or missing required fields), the skipped count and per-row error messages are shown.

Uploaded data is added to the existing list — running the upload multiple times with the same file is safe because duplicate index numbers are skipped.

Placement list table:

Columns: Index No. (monospace), Name, Gender, Aggregate, Programme, Residential (Day/Boarding), Status, and Remove.

Status badges:
Registered (green) — the student has already registered on the portal (claimed their admission form).
Pending (grey) — the student has not yet registered.

Only Pending students can be removed. Click "Remove" and confirm to delete a student from the placement list. Students who have already registered cannot be removed.

Search:

Type an index number or name in the search box to filter the list instantly.

Tip: upload the CSSPS placement file before opening the admission portal. If you open the portal first, prospective students will not be able to verify their placement.`,
  },

  // ── Admin — Prospectus Files ──────────────────────────────────────────────────

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Admissions — Prospectus Files',
    body: `The Prospectus Files page lets admins upload PDF prospectus documents that are automatically delivered to applicants after they complete their admission form. Open it from Admissions → Prospectus.

Page header: "Prospectus Files"
Page subtitle: "Upload prospectus PDFs by program, gender, and residential status. Students will be matched to the most specific prospectus available."

Uploading a prospectus:

Use the Upload New Prospectus form at the top. Three dropdowns let you target the file:
Program — select a specific programme, or leave on "All Programs" for a generic prospectus.
Gender — Male, Female, or All.
Residential Status — Boarding, Day, or All.

Then select a PDF file from your computer and click "Upload Prospectus."

You can upload multiple prospectus files with different targeting combinations. For example:
"General Arts · Female · Boarding" — a prospectus specific to female boarding students in General Arts.
"All Programs · All · All" — a fallback prospectus for any student who does not match a more specific file.

Prospectus fallback order:

When a student downloads their prospectus after completing the form, the system picks the best match using this priority order:
1. Exact match: specific program + specific gender + specific residential status.
2. Program + gender + All residential.
3. Program + All gender + All residential.
4. All Programs + All gender + All residential (the general fallback).

If no prospectus file is uploaded at all, applicants will not receive one after submitting their form.

Prospectus table:

Columns: Applies To (e.g. "General Arts · Female · Boarding"), File Name (a clickable link to view the PDF), Uploaded date, Delete.

Click "Delete" and confirm to permanently remove a prospectus file.

Tip: always upload at least one general (All Programs · All · All) prospectus as a fallback so that all applicants receive a document, even if no specific one matches their profile.`,
  },

  // ── Admin — Admission Reports ─────────────────────────────────────────────────

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Admissions — Reports',
    body: `The Admission Reports page gives a visual overview of the current admission cycle's progress and applicant breakdown. Open it from Admissions → Reports.

Page header: "Admission Reports"
Page subtitle: "Overview of the current admission cycle."

Pipeline stat tiles:

Seven tiles at the top mirror the Applications page: Placed, Registered, Pending, Completed, Reported, Migrated, and Total. Each shows the count for the current cycle in its colour-coded label.

Admission Pipeline funnel:

A horizontal bar chart below the tiles shows the admission funnel — each stage as a proportion of the students placed by CSSPS:

Placed by CSSPS (grey) — the total on the placement list (the denominator for all percentages).
Registered (blue) — students who have visited the portal and registered.
Completed Form (green) — students who have submitted all form steps.
Reported (purple) — students who have physically come to the school.
Migrated (dark purple) — students fully converted to student accounts.

Each bar is labelled with the count and scales relative to the "Placed" total.

Breakdown charts:

Four horizontal bar charts appear below the funnel, each showing the distribution of applications across a dimension:

Applications by Program — how many applicants per academic programme.
Applications by House — how many applicants per boarding/day house.
Applications by Gender — male vs. female.
Applications by Residential Status — boarding vs. day.

In each chart, the bar for the category with the highest count fills the full width; all other bars are shown proportionally. The count appears at the right end of each bar.

All data on this page reflects the live database and updates immediately as applications come in or statuses change.`,
  },

  // ── Admin — Admission Portal Settings ────────────────────────────────────────

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Admissions — Portal Settings',
    body: `The Admission Portal Settings page is where admins configure and brand the public-facing admission website that prospective students use to apply. Open it from Admissions → Settings.

Page header: "Admission Portal Settings"
Page subtitle: "Configure the public admission portal for your school."

Portal Access section:

A toggle switch opens or closes the admission portal.
Portal is Open — prospective students can submit their forms. The portal's landing page shows an "Apply Now" button.
Portal is Closed — the landing page shows an "Applications Are Closed" notice. No new form submissions are accepted.

When the portal has a slug configured, a green banner shows the public URL (e.g. /admissions/st-augustines) with a Copy button.

Admission Number section:

Portal URL Slug (required) — a short identifier that forms the last part of the public URL (e.g. "st-augustines" → /admissions/st-augustines). Use only letters, numbers, and hyphens. Must be unique across all schools.
Prefix (required) — a short code prepended to each admission number (e.g. "SASHTS").
Admission Year (2-digit, required) — the year suffix on each admission number (e.g. "25" for 2025).
Application Deadline — optional date. Shown on the portal landing page if set.

Example: Prefix "SASHTS" + Year "25" → admission numbers like SASHTS000125, SASHTS000225, etc.

Website Content section:

Portal Title — the main heading on the landing page (e.g. "St. Augustine's College Admissions 2025").
Tagline — a short subtitle shown below the title on the landing page.
Welcome Message — a longer paragraph shown in a dedicated section when the portal is open.
Primary Colour / Accent Colour — hex colour pickers that theme the portal's buttons, gradients, and highlights. Use your school's brand colours.

School Identity section:

Vision Statement, Mission Statement, and Core Values — text that appears on the school's admission website. These fields also appear in report cards and certificates, so they apply school-wide.
Click "Save Identity" to save these separately from the rest of the portal settings.

Images section:

Banner Image — a photo that appears as a background overlay in the portal hero section (recommended: wide landscape image).
Portal Logo — the school crest or logo displayed in the navbar and hero (recommended: square, transparent background).
Both images are uploaded directly from your computer.

Contact Information section:

Email, Phone, and Address — shown in a "Contact Us" section at the bottom of the portal landing page. Leave blank to hide that section.

Saving:

Click "Save Settings" at the bottom of the page to apply all changes (except School Identity, which has its own Save button). A green confirmation banner appears on success.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} admissions help entries…\n`);
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
