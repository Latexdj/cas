'use strict';
/**
 * Discipline seed: 6 help entries covering the admin discipline page (both tabs)
 * and the principal discipline (letters pending approval) page.
 * Run once: node backend/seed-help-entries-discipline.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'discipline',
    applicable_roles: ['admin'],
    title: 'Discipline & Conduct Overview',
    body: `The Discipline & Conduct page is where you manage formal disciplinary correspondence for both teachers and students. Go to Discipline in the left menu to open it.

The page has two tabs:

Teacher Queries — formal written queries addressed to teaching staff, typically used to request an explanation for an absence, misconduct, or performance issue. These are internal staff-management documents.

Student Letters — formal disciplinary letters issued to students (and their parents or guardians), ranging from warnings to suspensions and dismissals.

Both tabs share the same page. Click either tab label to switch between them. Selecting a row in either table opens a detail panel inline below that row, where you can view the full document, track its progress, and take action. Selecting the same row again collapses the panel.

Both tabs include summary stat cards at the top, live filters, and an Issue button that opens the form for creating a new document.`,
  },

  {
    feature_area: 'discipline',
    applicable_roles: ['admin'],
    title: 'Teacher Queries — Issuing and Managing',
    body: `The Teacher Queries tab handles formal written queries issued to teaching staff.

Six stat cards appear at the top: Total (all queries), Open (issued but not yet resolved), Overdue (past the response deadline and not yet responded to), Responded, Resolved, and Escalated.

Three live filters narrow the list as you type or select: a teacher name filter, a Category dropdown (Absenteeism, Misconduct, Insubordination, Negligence of Duty, Poor Performance, Other), and a Status dropdown.

The table columns are: Teacher, Category, Subject (truncated if long), Issued date, Deadline (or a dash if none set), and a colour-coded Status badge. Overdue queries show a red Overdue badge when the response deadline has passed and the teacher has not yet responded.

Click any row to expand the query detail panel below it. The detail panel shows:

Timeline — a four-step progress indicator: Issued, Acknowledged, Responded, Resolved. Each step fills in as the query advances. An Escalated step appears in red if the query has been escalated instead of resolved.

Query body — the full text of the query.

PDF — a Generate PDF button produces a printable version of the query letter. Once generated, a Download PDF link appears. Click Regenerate PDF to produce a fresh version at any time.

Teacher Response — if the teacher has submitted a written response (through the teacher app), it appears here with the submission date. Any attached file appears as a download link.

Resolution or Escalation Notes — shown once the query is resolved or escalated.

Actions — two action panels appear at the bottom of the detail when the query is still open. Mark Resolved lets you add optional resolution notes and close the query. Escalate lets you flag the issue for further action with an optional escalation note. Both actions are permanent once confirmed.

Issuing a query: click Issue Query (top right). The form requires you to select a teacher (searchable by name or department), choose a category, write a subject line, and fill in the query body. You can optionally set a response deadline and link the query to an academic year. Click Issue Query to create the record.`,
  },

  {
    feature_area: 'discipline',
    applicable_roles: ['admin'],
    title: 'Student Disciplinary Letters — Issuing',
    body: `Click Issue Letter (top right of the Student Letters tab) to open the disciplinary letter form.

The form has these fields:

Student — search by name, Student ID, or class name. Click a result to select the student. A green confirmation bar appears showing the student's name, class, and ID.

Letter Type — choose from: Warning, Final Warning, Suspension, Dismissal, or Other. The letter type determines the severity, the badge colour on the record, and whether headmaster approval is required (see below).

Offense Category — choose from: Lateness / Absenteeism, Fighting / Assault, Exam Malpractice, Substance Use, Insubordination, Theft / Property Damage, Bullying / Harassment, Indecent Behavior, Vandalism, or Other. Selecting Other reveals a free-text field to specify the offense.

Subject — required. A short headline for the letter, for example "Warning Letter — Fighting Incident".

Letter Body — required. The full text of the letter. A Draft with AI button appears beside the label — click it to open the AI Draft Assistant (see the "AI Draft Assistant" help entry). The AI option is not available for Suspension, Dismissal, or the Other offense category; write those letters manually.

Issued Date — defaults to today. Adjust if you are backdating the letter.

Academic Year — optional. Links the letter to a specific academic year for records.

Semester — optional. Select Semester 1 or 2.

Approval required: if you select Final Warning, Suspension, or Dismissal as the letter type, a purple notice appears in the form: "This letter type requires headmaster approval before it is issued to the student." These letters are saved with a Pending Approval status after you click Issue Letter. They do not go to the student until the principal reviews and approves them. See the "Approving Disciplinary Letters" help entry for how the principal handles this step.`,
  },

  {
    feature_area: 'discipline',
    applicable_roles: ['admin'],
    title: 'Student Disciplinary Letters — Tracking and Actions',
    body: `The Student Letters tab shows all disciplinary letters issued to students.

Eight stat cards appear at the top: Total, Pending Approval (purple — letters awaiting headmaster sign-off), Active (issued but not yet resolved), Resolved, Warning, Final Warning, Suspension, and Dismissal.

Four live filters narrow the list: Class (text filter), Student name (text filter), Type dropdown, and Status dropdown (Pending Approval, Issued, Acknowledged, Resolved).

The table columns are: Student, Class, Type (colour-coded badge), Subject (truncated), Issued date, and Status badge.

Status badge colours: Pending Approval is purple. Issued is amber. Acknowledged is green. Resolved is bright green.

Click any row to expand the letter detail panel. The panel shows:

Letter body — full text in a formal serif layout.

PDF — click Generate PDF to create a print-ready version of the letter. A Download PDF link appears once generated. For letters still in Pending Approval, the generated PDF is a watermarked draft. Once the principal approves, the final signed PDF is generated automatically.

Approval info — for letters that have been approved by the principal, a purple banner shows who approved them and on what date.

Acknowledgement info — once a letter has been acknowledged, a green banner shows who acknowledged it and on what date.

Resolution notes — shown once the letter is marked resolved.

Actions available depend on the letter's current status:

Pending Approval — a purple "Approve and Issue" button allows the admin to approve the letter directly if needed. Approval sets the status to Issued and generates the final signed PDF. This is the same approval action that the principal performs from the principal portal.

Issued — two action panels appear side by side. Acknowledge Receipt: choose who acknowledged (Admin, Student, Parent, or Form Teacher) and click Mark Acknowledged. Mark Resolved: add optional resolution notes and click Resolve.

Acknowledged — only the Mark Resolved panel is shown.

Resolved — no further actions are available.

Print — a Print button in the panel header opens a print-ready version of the letter formatted for paper.`,
  },

  {
    feature_area: 'discipline',
    applicable_roles: ['admin'],
    title: 'AI Draft Assistant for Discipline Documents',
    body: `Both the Issue Query and Issue Letter forms include a Draft with AI button beside the body field. This opens the AI Draft Assistant, an in-panel chat that helps you write the formal letter or query body.

When you click Draft with AI, the assistant starts a new session grounded in your school's discipline policy. The grounding panel at the top of the chat shows which policy clauses were retrieved. If a green bar appears, the AI is working from specific policy passages. If an amber bar appears, no matching clauses were found and the AI is responding without policy grounding — review the output carefully.

After the session starts, a structured intake form appears with guided questions specific to the document type. Fill in the details (the incident date, what happened, what the teacher or student has already been told, and so on) and click Submit. The AI uses your answers to produce a first draft of the body text in the appropriate formal register.

If you prefer not to fill in the intake form, click Skip to go directly to the chat prompt.

The latest AI response always shows a "Use this draft" button. Clicking it copies the text into the letter body field and closes the chat panel. You can edit the copied text freely before submitting the form.

To refine the draft, type a follow-up in the chat input — for example, "Make the tone more formal" or "Add a paragraph about prior warnings" — and press Enter or click Send. The AI responds with a revised version.

Limitations: AI drafting is not available for Suspension or Dismissal letter types, or when the offense category is set to Other. Write those documents manually. The AI is a drafting aid — always review the generated text before issuing a document.`,
  },

  // ── Management entry ──────────────────────────────────────────────────────────

  {
    feature_area: 'discipline',
    applicable_roles: ['management'],
    title: 'Approving Disciplinary Letters (Principal)',
    body: `The Discipline page in the principal portal shows all student disciplinary letters that are waiting for headmaster approval. Go to Discipline in the principal navigation to open it.

Letters that require approval are those of type Final Warning, Suspension, or Dismissal. After the admin issues one of these letters, it is saved with a Pending Approval status and appears in this list. The letter is not delivered to the student until you approve it.

The list shows each pending letter as a card with the letter type (in red), the reference number, the student's name and class, the subject line, and the issue date. If there are no pending letters, the page shows a confirmation that all letters have been reviewed.

Click any card to open the letter detail. The detail shows:

Reference number, issue date, offense category, and the name of the admin who issued the letter.

Subject line and the full letter body.

Draft PDF — if the admin has already generated a draft PDF, a link appears: "Open watermarked PDF." This opens the draft in a new tab for you to review on screen. The watermark on the draft disappears once you approve and the final PDF is generated. If no PDF has been generated yet, the panel says "No PDF generated yet — the issuer must generate the draft PDF before approval." Contact the issuing admin to generate it before you approve.

Approval panel — a purple section at the bottom states "Headmaster Approval Required" and warns that approving will set the status to Issued and generate the final signed PDF. This action cannot be undone.

Click Approve & Issue Letter to approve. The letter moves to Issued status, the final signed PDF is generated, and the letter card disappears from your pending list. A green confirmation message appears in the modal.

Close the modal to return to the pending list and continue reviewing other letters.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} discipline help entries…\n`);
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
