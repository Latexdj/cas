'use strict';
/**
 * Houses seed: 3 admin help entries covering the Houses page.
 * Run once: node backend/seed-help-entries-houses.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'houses',
    applicable_roles: ['admin'],
    title: 'Houses Overview',
    body: `The Houses page is where you define and manage the residential houses in your school. Go to Houses in the left menu to open it.

Four summary cards appear at the top of the page when at least one house exists:

Houses — the total number of houses defined.
Total Students — the combined number of students currently assigned to any house.
Boarding — the total number of boarding students across all houses.
With Housemaster — how many houses have at least one housemaster assigned.

The table below the cards lists every house with the following columns:

House — the house name. Click the column header to sort alphabetically.

Housemaster — the name of the teacher or staff member assigned as housemaster. If no housemaster has been assigned yet, an amber Unassigned pill appears instead. Click the column header to sort by housemaster name.

Students — the total number of active students currently in the house. Click the column header to sort by student count.

Gender — two mini progress bars showing the split between male (blue) and female (pink) students, with the count beside each bar.

Residential — two mini progress bars showing the split between boarding (indigo) and day (amber) students, with the count beside each bar.

Notes — any optional notes you have recorded for the house. Long notes are truncated in the table. A dash appears if no notes were added.

Actions — Edit and Delete buttons for each house.

On smaller screens, the table switches to a card layout. Each card shows the house name, housemaster (or a no-housemaster notice), and three count tiles for Total, Boarding, and Day students, plus Male and Female pills with counts.

The list paginates when there are many houses. Use the page controls at the bottom to navigate.`,
  },

  {
    feature_area: 'houses',
    applicable_roles: ['admin'],
    title: 'Adding and Editing a House',
    body: `Click Add House (top right of the Houses page) to create a new house. Click Edit on any row to modify an existing house. Both actions open the same small modal form.

House Name is required. This is the name that appears in the house list, in student records when assigning a student to a house, and in reports and exports.

Notes is optional. Use it for any internal description or information about the house — for example, its capacity, its location on campus, or any special notes. Notes are visible only to admins and are truncated in the table view if they are long.

Click Add House (when creating) or Save Changes (when editing) to save. Click Cancel to close without saving.

A note inside the form reminds you that housemasters are not assigned here. To link a teacher to a house as housemaster, go to Clearance, then Offices and Staff, and create or edit a clearance office of type Housemaster, selecting this house. See the "Assigning a Housemaster to a House" help entry for the full steps.

To delete a house, click Delete on its row. A confirmation dialog appears before anything is removed. Once deleted, the house is permanently removed and the house name will no longer appear in student records as an option. Students who were already assigned to that house retain the house name in their historical records, but the house will not be available when creating or editing student records going forward.`,
  },

  {
    feature_area: 'houses',
    applicable_roles: ['admin'],
    title: 'Assigning Students and Housemasters to Houses',
    body: `Assigning a student to a house and assigning a housemaster to a house are both done outside the Houses page itself.

To assign a student to a house:
Go to Students in the left menu. Find the student in the list and click Edit on their row. In the Basic Information section of the student form, select the house from the House dropdown. Click Save to apply. The student will appear in the house counts on the Houses page once saved.

You can also assign houses in bulk by using the Update Records spreadsheet on the Students page. The house column in the update template accepts the house name exactly as it appears in the Houses list.

To assign a housemaster to a house:
Go to Clearance in the left menu, then select Offices and Staff. Click Add Office or edit an existing office. Set the Office Type to Housemaster and select the house you want to link it to. Then assign a teacher or staff member to that office. Once saved, the teacher's name appears in the Housemaster column on the Houses page.

A house can have more than one housemaster. If multiple staff are assigned to the same house office, all their names appear in the Housemaster column separated by commas.

If the Housemaster column for a house shows Unassigned (amber pill), it means no clearance office of type Housemaster has been created and linked to that house yet.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} houses help entries…\n`);
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
