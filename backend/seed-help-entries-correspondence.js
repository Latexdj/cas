'use strict';
/**
 * Correspondence seed: 6 help entries covering the admin general-letters page
 * and the principal general-letters (pending approval) page.
 * Run once: node backend/seed-help-entries-correspondence.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'general_letters',
    applicable_roles: ['admin'],
    title: 'Correspondence Overview',
    body: `The Correspondence page is where you issue and track general letters — formal written communication addressed to parents, students, teachers, or external organisations. Go to Correspondence in the left menu to open it.

This page handles letters that do not belong to the discipline or exeat workflows: parent notifications, letters to the District Education Office or other external bodies, internal administrative memos, and similar correspondence.

The table lists every letter that has been created. Each row shows:

Ref — the auto-assigned reference number for the letter.
Classification — what category the letter falls into: Parent Communication, External / Official, Internal Administrative, or Other.
Recipient — the name of the person or organisation the letter is addressed to. For external letters, their organisation appears on a sub-line.
Subject — the letter subject line. If the letter is marked sensitive, a red Sensitive badge appears beside the subject.
Date — the issued date of the letter.
Status — a colour-coded badge showing the letter's current state.

The four possible statuses are: Draft (grey — the letter was started but not yet finalised), Pending Approval (amber — waiting for principal approval before being issued), Issued (green — the letter has been approved and issued), and Archived (grey — the letter has been archived).

Two filters appear above the table: a Status dropdown and a Classification dropdown. Both take effect immediately when you change them — no Apply button is needed. Select any combination to narrow the list.

Two buttons appear in the top right: Saved Contacts (opens the contacts book for external recipients) and + New Letter (opens the letter creation form).`,
  },

  {
    feature_area: 'general_letters',
    applicable_roles: ['admin'],
    title: 'Creating a General Letter',
    body: `Click + New Letter (top right of the Correspondence page) to open the letter creation form.

Classification — required. Choose from: Parent Communication, External / Official, Internal Administrative, or Other. Choosing External / Official triggers the approval workflow (see below).

Sensitivity — a checkbox below the classification field. Tick "This letter concerns a sensitive personal matter" if the letter relates to health, bereavement, family legal proceedings, safeguarding, or any matter the subject would not expect to be shared widely. Ticking this also triggers the approval workflow and disables AI drafting — sensitive letters must be written manually.

Approval notice — an amber banner appears when the letter will require principal approval before it is issued. This happens when the classification is External / Official or when the sensitivity checkbox is ticked. When either condition is met, the submit button changes from "Issue Letter" to "Submit for Approval" and the letter is saved with Pending Approval status after you submit.

Recipient Type — required. Choose one of four options (shown as a 2×2 grid of radio buttons):

Student — search by name or Student ID. A typeahead list appears as you type; click a student to select them. A green confirmation shows the selected student's name and ID.

Teacher — search by name. A typeahead list appears; click a teacher to select them.

Parent (free text) — enter the parent's or guardian's name in a plain text field.

External Organisation — enter the recipient's name (required), organisation or body name (optional), and postal address (optional). A "Pick from saved contacts" link opens your saved contacts list so you can fill these fields from a contact record rather than retyping. You can also add a new contact from within this picker using the form at the bottom of the contacts list.

Subject — required. The subject line of the letter.

Letter Body — required. The main content of the letter. Write only the body text — the salutation, letterhead, and signature block are added when you generate the PDF or use Print Preview. If the letter is not marked sensitive, a "Draft with AI" button appears beside this label (see the help entry for AI drafting).

Issued Date — defaults to today. Edit to backdate if needed.

Click Submit for Approval (when approval is required) or Issue Letter (when it is not) to save. Click Cancel to close without saving.`,
  },

  {
    feature_area: 'general_letters',
    applicable_roles: ['admin'],
    title: 'Saved External Contacts',
    body: `Saved Contacts is a reusable address book for external recipients — organisations, government bodies, district offices, and other external parties you write to regularly. Saving a contact means you do not have to retype their name, organisation, and address each time you issue a letter to them.

To view all saved contacts, click Saved Contacts (top right of the Correspondence page). A modal opens listing every contact's name, organisation, and address.

To add a contact while creating a letter, select External Organisation as the recipient type in the New Letter form. A "Pick from saved contacts" link appears below the address fields. Click it to open the contacts picker. If the contact you want is listed, click their row to fill the recipient fields automatically. If they are not listed yet, scroll to the "Add new saved contact" section at the bottom of the picker, enter a name (required), an organisation, and an address, then click Save & pick. The contact is saved to the book and the recipient fields are filled in one step.

The contacts book is shared across all admin users on the school. Contacts you add while creating a letter are available to all admins for future letters.`,
  },

  {
    feature_area: 'general_letters',
    applicable_roles: ['admin'],
    title: 'AI Draft Assistant for General Letters',
    body: `When creating a general letter, a "Draft with AI" button appears beside the Letter Body label — provided the letter is not marked as sensitive. Clicking it opens the AI Draft Assistant, which helps you write the letter body in the appropriate formal register.

Before clicking Draft with AI, you must fill in at least the Classification, Recipient Type, Subject, and the recipient details. The assistant uses this information to personalise the draft (for example, addressing the recipient by name and referencing the subject).

After you click Draft with AI, the assistant pre-creates the letter as a draft record in the system, then starts a chat session grounded in your school's policies. A structured intake form appears first with guided questions about the purpose and context of the letter. Fill in the details and click Submit. The AI uses your answers to generate a first draft of the letter body.

If you prefer to skip the intake form, click Skip to go straight to the chat. The assistant will still produce a draft based on the information already in the form.

When you are satisfied with the AI's draft, click "Use this draft" to copy the text into the body field. You can then edit it freely before submitting the letter. Alternatively, if you click Submit for Approval or Issue Letter while the chat panel is still open, CAS automatically captures the last AI response as the body — you do not need to click "Use this draft" separately.

To refine the draft, type a follow-up in the chat input — for example, "Make this more concise" or "Add a paragraph mentioning the school's upcoming event" — and click Send.

The AI is a drafting aid. Always read the draft carefully before issuing the letter. AI drafting is never available for letters marked as sensitive.`,
  },

  {
    feature_area: 'general_letters',
    applicable_roles: ['admin'],
    title: 'Viewing and Managing a Letter',
    body: `Click View on any letter row in the Correspondence table to open the letter detail modal.

The detail modal shows:

A meta grid with: Classification, Status (as a colour-coded badge), Recipient type, Issued date, the name of the admin who issued it, and the date the record was created.

Recipient details — for external letters, the recipient's name and organisation appear in a separate panel below the meta grid.

Sensitive notice — if the letter is marked sensitive, a red "Sensitive" banner appears. Handle this letter with extra discretion and restrict its distribution.

Pending Approval notice — an amber banner appears when the letter is still waiting for principal approval. No action is needed from you here; the principal approves from their portal (or from this modal — see below).

Approved notice — a green banner appears once the letter has been approved, showing who approved it and on what date.

Letter body — the full text of the letter.

PDF actions — three buttons manage the letter's PDF:

Generate PDF / Regenerate PDF — creates or recreates the formatted letter as a PDF. Once generated, a "Download PDF" link appears (labelled "Download Draft PDF (Watermarked)" for letters still in Pending Approval status). The watermark disappears once the principal approves and the final PDF is generated.

Print Preview — opens an on-screen preview of the letter formatted on letterhead, with salutation and signature block. Use this to check the layout before printing.

Approve & Issue — visible only when the letter's status is Pending Approval. Clicking it approves the letter immediately, sets the status to Issued, and generates the final signed PDF. This is the same action the principal performs from the principal portal, so admins can also approve if needed.

Close the modal to return to the correspondence list.`,
  },

  // ── Management entry ──────────────────────────────────────────────────────────

  {
    feature_area: 'general_letters',
    applicable_roles: ['management'],
    title: 'General Letters Pending Approval (Principal)',
    body: `The General Letters page in the principal portal lists all general letters that are waiting for your approval before they are issued. Go to General Letters in the principal navigation to open it.

Letters reach this list when an admin issues a letter of type External / Official, or when an admin marks a letter as sensitive. Both conditions require principal sign-off. The letter is held at Pending Approval status and is not distributed until you approve it.

The list shows each pending letter as a card. Each card displays:

A classification badge (amber) showing the letter type — for example, External Official or Parent Communication.
A Sensitive badge (red) if the admin marked the letter as sensitive.
The reference number (if assigned).
The recipient's name in bold.
The subject line and issued date on a sub-line.

Click any card to open the letter detail. The detail shows:

A header row with the classification badge, a purple PENDING APPROVAL badge, and the Sensitive badge if applicable.
The recipient's name and their class, department, or organisation.
A meta grid: Ref Number, Issued Date, the name of the admin who issued the letter, and the Recipient Type.
The subject line (underlined uppercase).
The full letter body.
Draft PDF — if the admin has already generated a draft PDF, a purple panel shows a link: "Open watermarked PDF →". Open it to read the formatted letter before approving. If no PDF has been generated yet, a dashed notice says "No PDF generated yet — the issuer must generate the draft PDF before approval." Contact the issuing admin to generate it first.

Approval panel — a purple section at the bottom says "Headmaster Approval Required" and warns that approving will set the status to Issued. This action cannot be undone.

Click Approve & Issue Letter to approve. The letter's status changes to Issued, the final PDF is generated, and the card disappears from the pending list. A green confirmation appears in the modal.

Close the modal to continue reviewing other pending letters.

If no letters are pending, the page shows a green checkmark and the message "No letters pending approval — All general letters have been reviewed."`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} correspondence help entries…\n`);
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
