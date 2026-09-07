'use strict';
// Run once to seed the 12 initial global help entries for the admin role.
// Safe to re-run: uses INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [
  // ── Entries 1-5: researched from codebase ─────────────────────────────────

  {
    feature_area:     'academic_years',
    applicable_roles: ['admin'],
    title: 'Managing Academic Years',
    body: `Academic Years controls the calendar years and semesters that other features rely on (attendance records, results, discipline letters). Find it under SCHEDULING → Academic Years in the left sidebar.

To add a new year: click "+ Add Academic Year", enter the year name (e.g. 2025/2026), set the start and end dates, choose the current semester (First Semester or Second Semester), and tick "Is Current" if this is the active year. Click Save.

To edit a year: click the edit button on its row. To see the semesters associated with a year, click the expand arrow on the left of the row.

Only one year should be marked as current at a time — CAS uses this to determine which records and reports are active.`,
  },

  {
    feature_area:     'students',
    applicable_roles: ['admin'],
    title: 'Adding and Managing Students',
    body: `Student records are managed under PEOPLE → Students. The page shows all students, filterable by class, program, and status (Active, Graduated, Inactive).

To add a single student: click "+ Add Student" and fill in the student code, name, class, and any other details. Click Save.

To edit an existing student: click their row to open their full record form.

For bulk enrolment: click "Download Template" to get the Excel import file, fill in the student rows, then upload the file. Use "Promote" to move a whole class up to the next year level, or "Graduate" to mark a group of students as graduated. The "Update Records" action lets you bulk-edit fields for existing students using a filled-in spreadsheet.`,
  },

  {
    feature_area:     'teachers',
    applicable_roles: ['admin'],
    title: 'Adding and Managing Teachers',
    body: `Teacher records are managed under PEOPLE → Teachers. The list shows each teacher's name, department, status, and whether they have admin access.

To add a teacher: click "+ Add Teacher", fill in their name, email, department, and a temporary password. To edit an existing teacher: click their row to open the record. The "Is Admin" toggle on a teacher's record grants them access to the admin portal.

For bulk import: click "Download Template" to get the Excel file, fill it in, then upload it. Use "Send Credentials" on a teacher's row to email them their login PIN. The "Update Records" action lets you bulk-update teacher fields from a spreadsheet.`,
  },

  {
    feature_area:     'attendance',
    applicable_roles: ['admin'],
    title: 'Viewing Teacher Attendance Records',
    body: `Teacher Attendance (ATTENDANCE → Teacher Attendance) shows attendance records that teachers submit themselves through the teacher app. Teachers check in by taking a classroom photo — admins do not enter teacher attendance manually from this page.

As an admin you can: filter records by date range or by teacher, click "View Photo" to inspect the submitted classroom photo and GPS location, revoke a record if it was submitted incorrectly (a written reason is required), or delete a record entirely.

If a teacher's attendance is not appearing, they need to submit it through their own teacher portal. It cannot be entered retroactively by admin from this page.`,
  },

  {
    feature_area:     'fees',
    applicable_roles: ['admin'],
    title: 'Managing Fees and Expenses',
    body: `The fees module is at FINANCES → Accounts & Fees. It has five tabs:

Fee Items: define fee categories (e.g. Tuition, Boarding, PTA Levy). Click "+ Add Fee Item" to create one.

Schedules: set the amount for a fee item per class, semester, and academic year. Click "+ Add Schedule", select the fee item, class, semester, and amount. Use "Generate Bills" to create bills for all matching students at once.

Collections: search for a student by name or ID, view their outstanding bills and payment history, and click "Record Payment" to add a payment entry.

Expenditure: record school expenses by category (Salaries, Utilities, Maintenance, etc.). Click "+ Add Expense", select the category, and enter the amount and date. Click "Income vs. Expenditure" to see the school's net financial position.

Arrears Report: select filters and click "Generate Report" to see all students with outstanding balances, grouped by class.`,
  },

  // ── Entries 6-12: confirmed from codebase review ──────────────────────────

  {
    feature_area:     'discipline',
    applicable_roles: ['admin'],
    title: 'Issuing Teacher Query Letters',
    body: `Teacher query letters are issued under PEOPLE → Discipline. Go to the Teacher Queries tab at the top of the page. Click "+ New Query", select the teacher, choose the issue category, enter the subject line and a response deadline, then click "Draft with AI" to open the AI drafting assistant, or write the letter body manually.

Once submitted, the query letter is issued to the teacher. They can submit a written response through their teacher portal. Track the response status (Issued, Acknowledged, Responded, Resolved) in the query list and mark it resolved once the matter is addressed.`,
  },

  {
    feature_area:     'discipline',
    applicable_roles: ['admin'],
    title: 'Issuing Student Disciplinary Letters',
    body: `Student disciplinary letters are issued under PEOPLE → Discipline. Go to the Disciplinary Letters tab. Click "+ Issue Letter", select the student, choose the offense category and letter type (Warning or Final Warning), enter the subject, then click "Draft with AI" or write the body manually.

Warning and Final Warning letters are issued directly. Suspension and Dismissal letters cannot be AI-drafted — compose those manually. Letters of type Suspension or Dismissal require principal approval before they are issued and will show as Pending Approval until the principal acts in the management portal.`,
  },

  {
    feature_area:     'general_letters',
    applicable_roles: ['admin'],
    title: 'Creating General Letters (Correspondence)',
    body: `General letters are managed under PEOPLE → Correspondence. Click "+ New Letter" to open the form.

Select a classification (Parent Communication, External/Official, Internal Administrative, or Other), choose the recipient type (student, teacher, parent, or external organisation), select or enter the recipient, add the subject, then write the body or click "Draft with AI".

Mark the letter as sensitive if it concerns health, bereavement, or other personal matters — sensitive letters disable AI drafting and require principal approval before issuing.

External/Official letters and sensitive letters both require principal approval. Their status shows as Pending Approval until the principal approves via the management portal.`,
  },

  {
    feature_area:     'policy_documents',
    applicable_roles: ['admin'],
    title: 'Uploading Policy Documents for AI Letter Grounding',
    body: `Policy Documents are managed under SETTINGS → Policy Documents (in the left sidebar under SETTINGS). These documents are used by the AI drafting assistant when writing discipline letters and teacher queries — the AI cites relevant policy clauses when drafting.

To add a document: click "+ Add Document", give it a title, set the document type (GES Teacher Code, GES Student Code, or School Rules), and save.

To add individual clauses: click "Add Clause" on the document row. Each clause needs a section reference, the clause text, which letter type it applies to (teacher query or student letter), and which offense categories it covers.

For full-document AI search: use "Upload for AI" on a document row to enable RAG-based grounding, where the AI searches the complete uploaded text rather than only manually tagged clauses.`,
  },

  {
    feature_area:     'results',
    applicable_roles: ['admin'],
    title: 'Generating AI Report Card Remarks',
    body: `Report card remarks are generated under ASSESSMENT → Results. Find the student's result record, open it, and click "Generate Remarks" to have the AI write the class teacher's remarks and the headmaster's remarks based on the student's performance data.

You can edit the generated remarks before finalising. The remarks are saved to the result record and are included when printing or generating the report card PDF.`,
  },

  {
    feature_area:     'general_letters',
    applicable_roles: ['admin'],
    title: 'Why a Letter Shows "Pending Approval"',
    body: `A letter shows Pending Approval instead of Issued when it requires principal sign-off before it can be issued. This happens automatically in two cases:

1. The letter is classified as External/Official — letters sent to official bodies outside the school always require approval.
2. The letter is marked as Sensitive — letters concerning personal matters such as health, bereavement, legal proceedings, or safeguarding require approval.

The letter is waiting for the principal to log in to the management portal and approve it. Once approved, the status changes to Issued. This requirement cannot be bypassed — it is enforced by the system.`,
  },

  {
    feature_area:     'general_letters',
    applicable_roles: ['admin'],
    title: 'How the Principal Approves Letters',
    body: `Principals approve pending letters through the management portal, which is separate from the main admin portal. The principal logs in using their management credentials and navigates to Letter Approvals in the left sidebar.

From there they can read the pending letter body and click "Approve & Issue Letter" to issue it. The letter status then changes to Issued and a PDF can be generated.

If the principal cannot access the management portal, check that their management account exists — management accounts are set up separately from teacher accounts under Settings → Management Users in the admin portal.`,
  },
];

async function run() {
  console.log('Ensuring tables exist…');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS help_entries (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id        UUID        REFERENCES schools(id) ON DELETE CASCADE,
      feature_area     TEXT        NOT NULL,
      applicable_roles TEXT[]      NOT NULL DEFAULT '{}',
      title            TEXT        NOT NULL,
      body             TEXT        NOT NULL,
      is_active        BOOLEAN     NOT NULL DEFAULT true,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_help_entries_roles ON help_entries USING GIN(applicable_roles)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS help_chat_sessions (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      created_by UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      role       TEXT        NOT NULL,
      messages   JSONB       NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '4 hours'
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_help_chat_sessions_school ON help_chat_sessions(school_id, created_at DESC)`);
  console.log('Tables ready.');

  console.log(`Seeding ${ENTRIES.length} help entries…`);
  let inserted = 0;

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
      console.log(`  –  ${e.title} (already exists, skipped)`);
    }
  }

  console.log(`\nDone. ${inserted} new entries inserted.`);
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
