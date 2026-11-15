'use strict';
/**
 * Budgets seed: help entries for the Department Budgets workflow.
 *   admin      — overview, budget units, acting at every stage
 *   teacher    — drafting and submitting a department or unit budget, the exam calculator
 *   management — Assistant Heads reviewing and compiling; the Head approving
 * (The accountant's school budget and staff unit heads are in seed-help-entries-staff-portal.js.)
 * Run: node backend/seed-help-entries-budgets.js  (or node backend/seed-help-all.js)
 * Safe to re-run: inserts new entries and updates existing ones by title.
 */
const { runSeed } = require('./help-seed-runner');

const ENTRIES = [
  {
    feature_area: 'department_budgets', applicable_roles: ['admin'],
    title: 'How Budgets Work in CAS',
    body: `Budgets follow the school's approval chain:

1. Each head of department, and each head of a non-academic unit (for example Stores, the Clinic, Sports or a housemaster), drafts a budget for the academic year and submits it.
2. The Assistant Head (Academic) reviews department budgets, and the Assistant Head (Administration) reviews unit budgets. They can accept, send back for changes, or reject each one, then compile the accepted budgets and submit the compiled budget to the Head.
3. The Head (principal) approves or returns each compiled budget.
4. The accountant combines the approved budgets, adds school-wide lines such as electricity, and finalises the school budget, which then locks.

If no Assistant Head is assigned, the principal reviews that track. Administrators can act at every stage and are the only ones who can reopen a finalised school budget.

Find it under Finances → Budgets, with tabs for Department and unit budgets, Compiled budgets, School budget and Budget units. The Department Budgets module must be enabled for your school.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: ['admin'],
    title: 'Setting Up Budget Units',
    body: `Departments already have budgets through their heads of department. For non-academic units (for example Stores, Clinic, Sports, Entertainment or the Senior Housemaster), open Finances → Budgets → Budget units and click Add unit.

Enter the unit's name, choose where its budget goes (Assistant Head (Administration) or Assistant Head (Academic)), and choose the head of the unit: a teacher or a staff-portal account, or No head yet. Save.

The unit head then sees Budgets in their portal (teacher portal or staff portal) and can draft the unit's budget. Remove a unit with Remove and then Confirm remove.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: ['teacher'],
    title: 'Drafting and Submitting Your Department Budget',
    body: `Heads of department and heads of budget units find Budgets under Responsibilities in the teacher portal.

1. Choose the academic year and tap Create budget, then Create draft (your department or unit is already chosen).
2. Tap Add item for each line: the item (for example Answer booklets), an optional description, the quantity and the unit price. CAS adds up the total.
3. Tap Save changes as you go. Export Excel and Export PDF download the budget at any time.
4. When it is complete, tap Submit for review.

The History at the bottom shows each step. You can Withdraw submission while it is still waiting for review. If the reviewer sends it back for changes or rejects it, their note is shown; edit the lines and submit again. If the reviewer changes a line, you will see what you requested next to what was approved.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: ['teacher'],
    title: 'Calculating Exam Paper for a Budget',
    body: `On your budget, tap "Calculate whole exam" to work out how much paper the department needs for an examination. Choose the classes, then for each subject enter the pages per paper; CAS uses the number of students, sheets per ream and a buffer percentage to give the total sheets and reams. Give the line a name and add it to your budget as a normal line you can still edit.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: ['management'],
    title: 'Reviewing and Compiling Budgets (Assistant Heads)',
    body: `Assistant Heads find Budgets in the principal portal menu. Department and unit budgets lists the budgets in your track (Academic or Administration) with their status.

Open a submitted budget to review it. You can edit lines (quantity and price), add or remove lines, then:
- Accept: accept it into the compiled budget.
- Send back for changes: say what needs to change; the head of department or unit edits and resubmits.
- Reject: give a reason.
Reopen for review takes an accepted budget back if you need to change it before compiling.

When the budgets are in, open Compiled budgets. Your track's compiled budget shows every accepted budget and the total, and lists any that are not yet accepted (these are left out). Tap Compile and submit, then Submit to the Head, with an optional note.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: ['management'],
    title: 'Approving Compiled Budgets (Head)',
    body: `When an Assistant Head submits a compiled budget, the principal's Budgets page shows "… budget awaiting your approval". Open Compiled budgets and tap Review and approve on that budget.

You will see each department or unit included, with its lines and total, and the history. Tap Approve (with an optional note) to send it to the accountant for the school budget, or Return for changes and say what needs to change. Once approved, it can no longer be changed by the reviewer.

If no Assistant Head is assigned for a track, the principal also reviews that track's department and unit budgets. The Vice Principal can view budgets but not approve them.`,
  },
];

runSeed('budgets', ENTRIES).catch(err => { console.error(err); process.exit(1); });
