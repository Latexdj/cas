'use strict';
/**
 * Phase 3 seed: management-role help entries for the principal portal.
 * Run once: node backend/seed-help-entries-phase3.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/db');

const entries = [
  {
    feature_area: 'letter-approvals-general',
    title: 'Approving General Letters',
    applicable_roles: ['management'],
    body: `General letters written by teachers require principal or vice-principal approval before they are issued to students or parents.

To approve a general letter:
1. Open the Principal Portal and select "General Letters" from the ACTIONS section in the left sidebar.
2. You will see a list of letters pending your approval, each showing the student name, letter type, and the teacher who drafted it.
3. Click on a letter card to open its detail view. Read the letter content carefully.
4. If the letter is ready, click "Approve & Issue Letter". The letter PDF is generated immediately and becomes available to the student.
5. If the letter needs changes, contact the teacher who drafted it — you cannot edit the letter text from the approval screen; the teacher must revise and resubmit.

Note: A warning "No PDF generated yet" means the letter has been approved in the system but the PDF render is still processing. Refresh after a few seconds.`,
  },
  {
    feature_area: 'letter-approvals-discipline',
    title: 'Approving Discipline Letters',
    applicable_roles: ['management'],
    body: `Disciplinary letters (Warning, Final Warning, Suspension, Dismissal) require principal approval before they are finalized and issued.

To approve a disciplinary letter:
1. Open the Principal Portal and select "Discipline Approvals" from the ACTIONS section.
2. Pending letters appear as cards showing the student name, infraction type, and letter category (Warning / Final Warning / Suspension / Dismissal).
3. Click a card to open the detail view. Review the incident details and letter content.
4. Click "Approve & Issue Letter" to finalize. The PDF is generated at this point and the letter becomes part of the student's conduct record.
5. Dismissal letters also trigger the relevant clearance and records processes — make sure the decision is confirmed before approving.

All approvals are logged with your name and timestamp in the audit trail.`,
  },
  {
    feature_area: 'leave-approvals',
    title: 'Approving or Rejecting Leave Requests',
    applicable_roles: ['management'],
    body: `Teachers submit leave requests that must be approved or rejected by the principal or vice-principal.

To manage leave requests:
1. Select "Leave Requests" from the left sidebar in the Principal Portal.
2. Pending requests appear as cards with the teacher name, leave type, dates, and reason.
3. To approve: click the "Approve" button on the card. The teacher is notified automatically.
4. To reject: click "Reject". You will be prompted to enter a reason — this reason is shown to the teacher and is required.
5. Approved leaves are reflected in attendance and timetable systems automatically.

You can page through past requests using the navigation at the bottom of the list.`,
  },
  {
    feature_area: 'exeat-management',
    title: 'Managing Student Exeat Quotas',
    applicable_roles: ['management'],
    body: `The Exeat section lets you monitor and control how many students are allowed off-campus at a given time (internal vs external exeats).

To view and manage exeats:
1. Select "Exeats" from the left sidebar in the Principal Portal.
2. The main view shows a quota table: each house or class row displays the current count of internal and external exeats against the configured maximum, visualized as progress bars.
3. To change the quota for a house or class, click "Override Quota". A modal opens with input fields for the maximum internal and external exeat counts. Enter the new limits and confirm.
4. Students exceeding their quota will not be able to submit new exeat requests until existing ones are returned or the quota is raised.

Changes to quotas take effect immediately.`,
  },
  {
    feature_area: 'principal-dashboard',
    title: 'Principal Dashboard Overview',
    applicable_roles: ['management'],
    body: `The principal dashboard gives a real-time summary of key school metrics and provides quick access to pending actions.

Key sections on the dashboard:
- Teacher Attendance Rate: today's attendance percentage across all teaching staff. Click through to see a breakdown by department.
- Pending Leave Requests: the number of leave requests awaiting your decision. Click to go directly to the Leave Requests list.
- Active Exeats: how many students are currently off-campus.
- Academic Results Pipeline: shows where the school stands in the results submission cycle (e.g. how many classes have submitted scores, how many are pending).
- Quick Actions: shortcut buttons for the most common approval tasks — General Letters, Discipline, and Leaves.

The dashboard refreshes on page load. To get the latest figures without a full reload, use the browser refresh button.`,
  },
];

async function seed() {
  let inserted = 0;
  for (const e of entries) {
    const { rows } = await pool.query(
      `SELECT id FROM help_entries WHERE school_id IS NULL AND title = $1 AND applicable_roles @> $2::TEXT[]`,
      [e.title, e.applicable_roles]
    );
    if (rows.length) {
      console.log(`  SKIP (exists): ${e.title}`);
      continue;
    }
    await pool.query(
      `INSERT INTO help_entries (school_id, feature_area, applicable_roles, title, body, is_active)
       VALUES (NULL, $1, $2, $3, $4, true)`,
      [e.feature_area, e.applicable_roles, e.title, e.body]
    );
    console.log(`  INSERT: ${e.title}`);
    inserted++;
  }
  console.log(`\nDone. Inserted ${inserted}/${entries.length} entries.`);
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
