'use strict';
/**
 * Inventory seed (admin): returnable items and loans, tag-tracked units,
 * bulk issue and issue records. These features were added after the
 * original inventory entries were written.
 * Run: node backend/seed-help-entries-inventory-loans.js  (or node backend/seed-help-all.js)
 * Safe to re-run: inserts new entries and updates existing ones by title.
 */
const { runSeed } = require('./help-seed-runner');

const A = ['admin'];

const ENTRIES = [
  {
    feature_area: 'inventory', applicable_roles: A,
    title: 'Returnable Items and Loans (Admin)',
    body: `Some items are used up (pens, A4 sheets, sanitary pads) and some must come back (textbooks, drawing boards, tablets). When adding or editing an item under Inventory → Items, tick Returnable for things that must come back.

Issuing a returnable item: tap Issue on the item, choose Student or Teacher, find the person by name or ID, set the quantity and an optional due date, and confirm. The item is now on loan to that person. Items that are used up can still be issued to a student, teacher, staff member or department as before.

Inventory → Loans (or Manage Loans on the item's row) lists everything currently lent out: the borrower, the item, when it was issued and when it is due. Search by borrower or item, or tick overdue only to see what is late; a loan is overdue once its due date has passed. A loan with no due date is never overdue.

When an item comes back, tap Return on its loan and choose its condition: Good, Damaged, or Lost (not coming back). The available count goes back up, and a Damaged return marks the item Damaged. An item with loans on record cannot be deleted.`,
  },
  {
    feature_area: 'inventory', applicable_roles: A,
    title: 'Tablets, Laptops and Other Tag-Tracked Items (Admin)',
    body: `For valuable items, tick "Track each unit by tag number and IMEI" when adding the item (tablets, laptops, calculators). CAS then records each person against the exact unit they receive.

After you save, the Units window opens. Download the template, fill in each unit's tag number, IMEI and serial number, and upload it (or paste the columns in), check the list and save. You can open Units again from the item's row at any time to add units or see where each one is: in store, or on loan and to whom.

When issuing a tracked item, also choose the unit being handed over. On the Loans page, type a tag number or IMEI to find who has that unit.`,
  },
  {
    feature_area: 'inventory', applicable_roles: A,
    title: 'Bulk Issue and Issue Records (Admin)',
    body: `Inventory → Bulk Issue gives the same item to a whole class, year group or set of teachers in one go, such as exercise books, sanitary pads or test books.

1. Choose the item, the quantity per person, and a due date if the item must come back.
2. Choose Students or Teachers and filter them (class, programme, year, gender, day or boarding for students; department and gender for teachers). Tap Load list. Everyone is ticked; untick anyone who is absent.
3. Give the record a title. Tap Print sign sheet for a list of names to sign as they collect.
4. Tap Issue. A confirmation appears in the page with the total and how much stock will be left; tap "Yes, issue to …" to go ahead.

Inventory → Issue Records keeps every bulk issue. Open a record to see who received the item, upload the signed sheet (PDF or photo), replace or remove it (each asks you to confirm in the page), and use "+ Add late collectors" for students who were absent on the day.`,
  },
];

runSeed('inventory (loans and bulk issue)', ENTRIES).catch(err => { console.error(err); process.exit(1); });
