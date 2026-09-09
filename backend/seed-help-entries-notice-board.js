'use strict';
/**
 * Notice Board seed: 4 admin help entries covering every section of the Notice Board page.
 * Run once: node backend/seed-help-entries-notice-board.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  {
    feature_area: 'notice-board',
    applicable_roles: ['admin'],
    title: 'Notice Board Overview',
    body: `The Notice Board is where you create and manage announcements for the school. Go to Notice Board in the left menu to open it.

Any notice you publish here appears immediately on the dashboard of every user in the school — teachers, students, and admins all see the notice feed. There is no audience selection; notices go to everyone.

The admin view shows all notices including expired ones. Teachers and students only see active notices — those that have not passed their expiry date.

There are no categories, folders, or search filters on this page. All notices are displayed in a single list, newest first.`,
  },

  {
    feature_area: 'notice-board',
    applicable_roles: ['admin'],
    title: 'Creating a Notice',
    body: `Click the New Notice button at the top right of the Notice Board page to open the create form.

Fill in the following fields:

Title — required. A short headline for the notice.

Body — required. The full text of the notice. You can type across multiple lines; line breaks are preserved exactly as you type them when the notice is displayed.

Priority — choose one of three levels. Normal shows a blue badge and border. Important shows an amber badge and border. Urgent shows a red badge and border. The priority badge is visible to all users who see the notice on their dashboard.

Expires — optional. Set a date if the notice should stop appearing after a certain day. Once that date passes, the notice disappears from teacher and student dashboards but remains visible on the admin Notice Board page with an Expired badge. If you leave this blank, the notice never expires automatically.

Pin this notice — tick this checkbox to add a gold pin icon to the notice card. This is a visual marker only; it does not change the order notices appear in the list.

Click Save Notice to publish. The notice goes live immediately and appears at the top of the list. The Save Notice button is disabled until both Title and Body have content.

To discard the form without saving, click Cancel.`,
  },

  {
    feature_area: 'notice-board',
    applicable_roles: ['admin'],
    title: 'Editing and Deleting Notices',
    body: `Every notice card on the Notice Board page has two action buttons on the right side.

Edit — click Edit to open the notice in an inline edit form that replaces the card. All the original values are pre-filled. Make your changes and click Save Notice to update the notice, or Cancel to put the card back without saving. Only one form can be open at a time; opening a different edit form or the create form closes any form that is already open.

Delete — click Delete to remove a notice permanently. A confirmation dialog appears asking you to confirm before anything is deleted. Once confirmed, the notice is removed from the list and is no longer visible to any user. Deletion cannot be undone.

Expired notices remain on the admin list with an Expired badge and reduced opacity. You can still edit or delete them from there.`,
  },

  {
    feature_area: 'notice-board',
    applicable_roles: ['admin'],
    title: 'How Notices Appear to Teachers and Students',
    body: `Teachers and students see notices in a feed on their dashboard. The feed shows up to 5 of the most recent active notices — those that have not passed their expiry date.

Each notice in the feed shows the priority badge, a pin icon if the notice is pinned, the title, the body text (truncated to 2 lines with a read-more option), and a small footer with the author name and the date it was posted.

Expired notices are hidden from teacher and student dashboards automatically once the expiry date passes. You do not need to delete them for them to disappear from user views.

If you want a notice to stop appearing before its expiry date, you can either edit the notice and set an earlier expiry date, or delete it entirely.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} notice board help entries…\n`);
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
