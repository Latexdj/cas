'use strict';
/**
 * Staff portal seed: help entries for the 'staff' role (non-teaching staff:
 * accountant and accounts clerk, store officer and inventory clerk, school
 * nurse, clearance officer, librarian, and staff who head a budget unit).
 * Before this seed the staff role had no help entries at all.
 * Run: node backend/seed-help-entries-staff-portal.js  (or node backend/seed-help-all.js)
 * Safe to re-run: inserts new entries and updates existing ones by title.
 */
const { runSeed } = require('./help-seed-runner');

const S = ['staff'];

const ENTRIES = [
  // ── Getting started ─────────────────────────────────────────────────────────
  {
    feature_area: 'staff_portal', applicable_roles: S,
    title: 'Signing In to the Staff Portal',
    body: `When your school administrator creates your staff account, CAS sends you an email called "Your Staff Portal Login". It contains your school code, your email address, your password, and a link to the staff portal sign-in page.

To sign in: open the link (or go to the staff portal address), enter the school code, your email address and your password, and tap Sign In.

You can change your password after signing in, from Account at the top of the page. Keep the email private. If you did not receive it, or have forgotten your password, ask your school administrator to reset it.`,
  },
  {
    feature_area: 'staff_portal', applicable_roles: S,
    title: 'Your Staff Portal Home Page and Menu',
    body: `Your home page ("Your Desk") shows a summary for each job you have been given, for example students waiting for your clearance decision, money collected and fees outstanding, items in stock and overdue loans, or who is in the clinic now.

On a phone, tap Menu (top left) to open the menu. Each of your roles has its own group: Clearance, Stores or Inventory, Accountant or Accounts, Clinic, Library, Letters and Budgets. Tap a group to open its tabs, then tap a tab. If a group is already open, tapping its name closes it.

You only see the sections for the roles your administrator has given you. If something you need is missing, ask the administrator to add the role to your account.`,
  },

  // ── Accountant / Accounts ──────────────────────────────────────────────────
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Accounts Dashboard (Staff Portal)',
    body: `Open Menu → Accountant (or Accounts) → Dashboard. It shows the total collected (use the drop-down to narrow it to a period), what was collected today, and the most recent payments, each with its student, date, method and receipt number.

Your home page also shows money collected today and in total, outstanding fees, expenses recorded, and collected minus expenses.`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Collecting a Fee Payment',
    body: `Open Menu → Accountant → Collect Payment. Search for the student by name or ID and tap them. You will see their total billed, total paid and outstanding balance, each bill with what is still owed, and their payment history.

Tap "+ Record Payment". In the form:
- Apply to Bill (optional): choose the bill this payment pays, or leave it as General Payment.
- Fee Type (optional), Amount (required) and Payment Date.
- Payment Method: Cash, Mobile Money, Bank Transfer, Cheque, Card or Other.
- Reference / Transaction ID, for example the mobile money reference, and optional Notes.

Tap Record Payment. CAS gives the payment a receipt number and updates the student's balance straight away.`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Voiding a Payment Entered by Mistake',
    body: `In Collect Payment, open the student and find the payment under Payment History. Tap Void next to it. A confirmation appears in the page showing the amount: tap "Yes, void it" to confirm, or Cancel.

Voiding cannot be undone. The amount goes back onto the student's balance, so record the correct payment afterwards if needed.`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Fee Items (Accountant)',
    body: `Fee Items are the kinds of fees your school charges, for example School Fees, Boarding Fees, PTA Dues, Examination Fees or an ICT Levy. Open Menu → Accountant → Fee Items.

To add one, tap "+ Add Fee Item", enter the name and an optional description, and tap Save. Use Edit to change one.

To delete a fee item, tap Delete, then tap it again ("Tap again to delete") to confirm. A fee item that already has schedules, bills or payments cannot be deleted; CAS shows the reason above the list.

Fee Items, Schedules, Expenditure, Arrears and Maintenance are available to the full Accountant role. The Accounts (bill collector) role has Dashboard, Collect Payment and Reports.`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Fee Schedules and Generating Bills',
    body: `A schedule says how much a class pays for a fee item in a term. Open Menu → Accountant → Schedules.

Tap "+ New Schedule". Choose the fee item, type the class name (leave it blank to bill the whole school), choose the academic year and semester, enter the amount and the due date, and tap Save. If a similar schedule already exists, CAS warns you and you can tap Create Anyway.

To bill the students, tap Generate Bills on the schedule. CAS creates a bill for every student it covers and tells you how many new bills were made. Generating again only adds bills for students who do not have one yet.

To delete a schedule, tap Delete and then "Tap again to delete".`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Recording Expenditure',
    body: `Open Menu → Accountant → Expenditure to record the school's spending. Tap "+ Add Expense", choose the category (for example Utilities, Maintenance or Supplies), enter the description, the amount, the date, who was paid and an optional reference, and save.

Expenses appear on your home page ("Expenses recorded" and "Collected minus expenses") and in the principal's Financial Overview. To delete an expense, tap Delete and then "Tap again to delete".`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Arrears (Students Who Owe Fees)',
    body: `Open Menu → Accountant → Arrears. It lists every student with an outstanding balance, largest first, with the total outstanding at the top. Filter by year, semester or class (type the class name, for example 3 Science A) to see who to follow up. Open a student in Collect Payment to see their bills.`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Fee Reports (Staff Portal)',
    body: `Open Menu → Accountant → Reports. The tabs give collections by fee schedule, a statement for one student, and a summary of everything billed. Choose the filters and the report updates.

Printing opens the report in a new window. If your browser blocks it, CAS says so at the top of the page: allow pop-ups for the site and try again.`,
  },
  {
    feature_area: 'fees', applicable_roles: S,
    title: 'Billing Maintenance (Missing Bills and Clean-up)',
    body: `Open Menu → Accountant → Maintenance.

Missing Bills lists schedules where some students were never billed, for example students who joined after the bills were generated. Tap Generate to bill them.

Unscheduled Bill Cleanup lists bills that are not linked to a schedule. Delete Unpaid removes the unpaid ones in a group: tap it, then tap again to confirm. Paid bills are never removed.

Needs Review lists bills whose amount no longer matches their schedule. Tap Sync to Schedule on a row to bring it in line.`,
  },
  {
    feature_area: 'general_letters', applicable_roles: S,
    title: 'Writing to Parents (Letters)',
    body: `The accountant can write letters to parents and guardians, for example fee reminders. Open Menu → Letters and tap "+ New Letter". Enter the parent or guardian's name (and optionally an organisation and address), the subject, the issue date and the letter, then tap Send Letter.

The letter is issued straight away on the school's letterhead. Tap PDF next to it to download it to print or share. You only see the letters you have written.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: S,
    title: 'Finalising the School Budget (Accountant)',
    body: `When the head approves a compiled budget (for example the Academics budget from the Assistant Head, Academic), it comes to the accountant. Open Menu → Budgets → School budget.

The summary shows each approved compiled budget and its total, any budget not yet approved (not counted), your school-wide lines, and the grand total. You can Adjust prices on department lines if needed.

To add a school-wide cost, such as electricity or maintenance, fill in Add a line (item, description, quantity and unit price) and tap Add.

When everything is in, tap "Finalise school budget", add an optional note, and tap "Finalise at GH₵ …". The final budget is locked; only an administrator can reopen it. Use Export Excel or Export PDF to share it.`,
  },
  {
    feature_area: 'department_budgets', applicable_roles: S,
    title: 'Drafting a Budget for Your Unit (Staff)',
    body: `If your administrator has made you head of a budget unit (for example Stores or the Clinic), you can draft that unit's budget. Open Menu → Budgets, choose the year and tap Create budget, then Create draft.

Tap Add item for each thing you need: the item, an optional description, the quantity and the unit price. CAS adds up the total. Save as you go, then tap Submit for review. The budget goes to the Assistant Head your unit reports to (or the head if none is assigned). If it is sent back with changes, you will see their note and can resubmit.`,
  },

  // ── Store officer / Inventory ──────────────────────────────────────────────
  {
    feature_area: 'inventory', applicable_roles: S,
    title: 'Stores: Items and Categories',
    body: `Store officers (the Stores role) manage every item in the school. Open Menu → Stores → Items. Each item shows how many are available out of the total. Use the search box (name, tag or location) and the category and condition filters to find items.

To add an item, tap "+ Add Item": enter the name, type and category; tick Returnable for things that must come back (textbooks, drawing boards) and leave it unticked for things that are used up (pens, A4 sheets); choose General (Stores) or a department; enter the quantity, condition and location; and tap Add Item.

To change an item, tap Edit. Setting the condition to Damaged or Written Off is recorded in the Transaction Log. Categories (Menu → Stores → Categories) group your items: tap "+ Add Category", type a name, and Save.

The Inventory (clerk) role can issue and return general items; the Stores role has full access, including departmental items, categories, the log and the asset report.`,
  },
  {
    feature_area: 'inventory', applicable_roles: S,
    title: 'Tablets and Other Tag-Tracked Items',
    body: `For valuable items like tablets and laptops, tick "Track each unit by tag number and IMEI" when adding the item. CAS then records exactly which unit each person receives.

Tap Units next to the item to see every unit, whether it is in store or on loan, and who has it. To add units, tap Add units and paste the tag number, IMEI and serial columns (or download the Excel template, fill it in and upload it), check the list, then save.

When issuing a tracked item, you also choose the tag number of the unit you are handing over.`,
  },
  {
    feature_area: 'inventory', applicable_roles: S,
    title: 'Issuing an Item (Staff Portal)',
    body: `Open Menu → Stores (or Inventory) → Issue and choose the item.

For an item that is used up, choose who receives it: a student, a teacher, a member of staff (type their name and role) or a department (type the department or section). Enter the quantity and tap Issue Item.

For a returnable item, choose a student or a teacher, find them by name or ID, and optionally set a due date. For a tag-tracked item, also choose the unit's tag number.

A green message confirms the issue, for example "Issued 2 × Football to Sports Department.", and the available count updates. Returnable items are then tracked under Loans until they come back.`,
  },
  {
    feature_area: 'inventory', applicable_roles: S,
    title: 'Bulk Issue, Sign Sheets and Issue Records',
    body: `To give the same item to a whole class (for example textbooks at the start of the year), open Menu → Stores → Bulk Issue.

1. Choose the item and the quantity per person (and a due date if it must come back).
2. Choose Students or Teachers, filter by class, programme, year, gender or day/boarding, and tap Load list. Everyone is ticked; untick anyone who is absent.
3. Give the record a title. Tap Print sign sheet for a list of names to sign as they collect.
4. Tap Issue to … . A confirmation appears in the page showing the total and how much stock will be left; tap "Yes, issue to …".

Later, open Issue Records, open the record and tap "Upload signed sheet (PDF or photo)". Replacing or removing a sheet asks you to confirm in the page. "+ Add late collectors" adds students who were absent. Your home page reminds you of records still missing a signed sheet.`,
  },
  {
    feature_area: 'inventory', applicable_roles: S,
    title: 'Loans and Returns (Staff Portal)',
    body: `Everything lent out is under Menu → Stores → Loans. Search by borrower, item, tag or IMEI, or tick Overdue only to see what is late. Under Find a unit, type a tag number or IMEI to see who has that unit.

When a returnable item comes back, tap Return on the loan, choose its condition (Good, Damaged, or Lost if it is not coming back) and confirm.

For items that are not lent to a person (used-up stock that came back), open Return, choose the item, the quantity and the condition, and tap Confirm Return.`,
  },
  {
    feature_area: 'inventory', applicable_roles: S,
    title: 'Sign Lists, Transaction Log and Asset Report',
    body: `Sign List (Menu → Stores → Sign List) prints a blank signature sheet for any group without issuing anything. Enter a title, the item and quantity per person, choose students or teachers, filter them (the matching count updates as you filter), and tap Generate & Print.

Transaction Log lists everything issued, returned, added, damaged, repaired or written off, with who received it and who handed it out. Search it, or filter by activity type.

Asset Report summarises everything the school owns: item counts, units available and issued, and their condition, for the general store and each department.`,
  },

  // ── Clearance officer ──────────────────────────────────────────────────────
  {
    feature_area: 'clearance', applicable_roles: S,
    title: 'Clearing Students (Clearance Officers)',
    body: `If you are assigned to a clearance office (for example Stores, Accounts Office or Library), open Menu → Clearance → Pending to see every student waiting for your office.

Before clearing, check the student has nothing outstanding: for the stores, check Loans; for accounts, check their balance in Collect Payment.

Tap Action next to the student. Choose Cleared, or Not Cleared and type the reason (required), then tap Confirm.

Student Lookup finds any student by ID and shows their clearance with every office, including any items they still have not returned. History lists the students your office has already dealt with.`,
  },

  // ── School nurse / Clinic ──────────────────────────────────────────────────
  {
    feature_area: 'clinic', applicable_roles: S,
    title: 'Recording a Clinic Visit',
    body: `Open Menu → Clinic → New Visit. Choose Student (or Teacher for a member of staff), find the person by name or code, type the reason for the visit, choose the severity (Minor, Moderate or Serious) and tap Log visit.

Students sent by a teacher appear in Open by themselves, with the teacher's name shown on the visit record.

Your home page shows who is in the clinic now, visits today and serious cases today.`,
  },
  {
    feature_area: 'clinic', applicable_roles: S,
    title: 'Treating a Patient and Closing the Visit',
    body: `Open Menu → Clinic → Open, which lists everyone in the clinic now. Tap "Open visit" to see the full record.

Enter the temperature, blood pressure and pulse, your diagnosis notes, the treatment given and any notes, and tap Save.

To give medicine, choose the item and quantity under Dispensed items and tap Add. CAS takes it off your stock and records it against the visit. (On the Open list you can also give an item quickly with Give.)

When the patient leaves, choose the outcome (Returned to class, Sent home, Referred to hospital, Admitted in clinic, or Other) and tap Close visit. If the visit was serious, or the student was referred to hospital or admitted, the parent is sent an SMS. Your administrator can choose to send one after every visit.

Only an administrator can reopen a closed visit.`,
  },
  {
    feature_area: 'clinic', applicable_roles: S,
    title: 'Student Health Profiles',
    body: `Open Menu → Clinic → Health Profiles. Search for the student and tap them. The profile holds their blood group, genotype, known allergies, known conditions and current medications. Enter what you know and tap Save.

Check the profile before giving medicine, for example for a penicillin allergy. Students can see their own profile in the student portal.`,
  },
  {
    feature_area: 'clinic', applicable_roles: S,
    title: 'Clinic History and Visit Slips',
    body: `Open Menu → Clinic → History to see every closed visit with its outcome. Tap a visit to see the full record. Tap Print slip for a visit slip the student can take home or to the hospital. If your browser blocks the print window, CAS says so at the top of the record: allow pop-ups and tap Print slip again.`,
  },
  {
    feature_area: 'clinic', applicable_roles: S,
    title: 'Clinic Stock and Inventory Report',
    body: `Open Menu → Clinic → Inventory to see your medicines and supplies with the quantity on hand, batch number, expiry date and low-stock status.

- Add item: enter the name, category (Medication or Consumable), unit and reorder level.
- Restock: enter the quantity received, batch number and expiry date.
- Write off: for expired or damaged stock, enter the quantity and the reason.

On a phone the table scrolls sideways; swipe left to reach Restock and Write off.

Inventory Report (Menu → Clinic → Inventory Report) shows what was restocked, dispensed and written off for any dates, and can be exported to CSV.`,
  },
  {
    feature_area: 'clinic', applicable_roles: S,
    title: 'Clinic Reports',
    body: `Open Menu → Clinic → Reports and choose the dates. You will see the total visits, how many were minor, moderate or serious, and the outcomes and patient types. Tap Export CSV to download the visits, for example for a termly report to the head.`,
  },

  // ── Librarian ──────────────────────────────────────────────────────────────
  {
    feature_area: 'library', applicable_roles: S,
    title: 'Library Desk (Staff Portal)',
    body: `Librarians use Menu → Library. Issue Book: find the student, choose the book and issue it; it is tracked as a loan with a due date. Return Book: find the student and return the books they bring back. Overdue lists books past their due date, so you can follow up.

The library office can also clear students in Menu → Clearance once they have returned all their books.`,
  },
];

runSeed('staff portal', ENTRIES).catch(err => { console.error(err); process.exit(1); });
