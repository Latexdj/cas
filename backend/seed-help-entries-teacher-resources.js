'use strict';
/**
 * Teacher Resources help entries: the Subject App launcher for teachers,
 * and managing subject apps for admins.
 * Run: node backend/seed-help-entries-teacher-resources.js
 * Safe to re-run: an existing global entry with the same title is updated.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false } });

const ENTRIES = [
  {
    feature_area: 'teacher_resources',
    applicable_roles: ['teacher'],
    title: 'Opening a Subject App (Teaching Resources)',
    body: `Resources in the teacher portal (under Academics, or in More on a phone) holds tools to help you plan and teach. The first is Subject apps: AI teaching assistants for each subject, built on Playlab.

To open one:
1. Choose your Form or curriculum, for example Form 1, Form 2 or New SHS Curriculum (All Forms).
2. Choose the Subject. The list only shows subjects for the form you picked, from A to Z. Changing the form clears the subject.
3. Tap Launch app. The app opens on Playlab in a new tab.

Your last choice is remembered on that device, and the apps you opened most recently appear under Recent so you can open them again with one tap.

If the page says "No subject apps have been added yet", your school has none switched on; ask your admin.`,
  },
  {
    feature_area: 'teacher_resources',
    applicable_roles: ['admin'],
    title: 'Managing Subject Apps (Teacher Resources)',
    body: `TEACHING › Teacher Resources lists the subject apps teachers can open from Resources in the teacher portal, grouped by form.

Shared apps come from CAS and appear for every school. You can't edit them, but you can Hide any your school doesn't use (and Show it again later). Hidden apps disappear from your teachers' list only.

Your own apps: click Add app, then enter the Form or curriculum (pick an existing one or type a new one; a new one goes at the end), the Subject, and the Playlab link. Links must start with https:// and be on playlab.ai. Teachers never see the link itself. Use Edit to change an app, Turn off to take it out of the teachers' list for a while, or Delete to remove it.

Open tests an app's link. Launches shows how many times your teachers have opened each app.`,
  },
];

async function run() {
  console.log(`Seeding ${ENTRIES.length} Teacher Resources help entries…\n`);
  let inserted = 0;
  let skipped  = 0;

  for (const e of ENTRIES) {
    const { rowCount } = await pool.query(
      `WITH upd AS (
         -- Existing global entry with this title: bring its text up to date
         UPDATE help_entries
            SET feature_area = $1, applicable_roles = $2, body = $4, is_active = true, updated_at = now()
          WHERE school_id IS NULL AND title = $3
            AND (body IS DISTINCT FROM $4 OR feature_area IS DISTINCT FROM $1 OR applicable_roles IS DISTINCT FROM $2::text[])
         RETURNING 1
       )
       INSERT INTO help_entries (school_id, feature_area, applicable_roles, title, body, is_active)
       SELECT NULL, $1, $2, $3, $4, true
       WHERE NOT EXISTS (
         SELECT 1 FROM help_entries WHERE school_id IS NULL AND title = $3
       )`,
      [e.feature_area, e.applicable_roles, e.title, e.body]
    );
    if (rowCount > 0) {
      inserted++;
      console.log(`  ✓  [${e.applicable_roles[0].padEnd(10)}]  ${e.title}`);
    } else {
      skipped++;
      console.log(`  –  [${e.applicable_roles[0].padEnd(10)}]  ${e.title} (already up to date or updated)`);
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
