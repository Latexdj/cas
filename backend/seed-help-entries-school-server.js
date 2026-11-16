'use strict';
/**
 * CAS School Server help entry for school admins.
 * Run: node backend/seed-help-entries-school-server.js
 * Safe to re-run: an existing global entry with the same title is updated.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false } });

const ENTRIES = [
  {
    feature_area: 'lms',
    applicable_roles: ['admin'],
    title: 'CAS School Server: updating tablets over the school Wi-Fi',
    body: `The CAS School Server lets student tablets get new past questions and new versions of the CAS Student app over the school's own Wi-Fi, with no internet.

It runs on one Windows PC that stays on at school, connected by cable to the main router that your Wi-Fi access points use. Ask CAS support for the CAS-School-Server folder, then on that PC:
1. Give the PC a fixed address (on the router, or in Windows network settings). The setup guide in the folder shows how.
2. Right-click install.bat and choose Run as administrator. The server starts, and starts again by itself whenever the PC starts.
3. Its page opens at http://localhost:8787 (it only opens on that PC). Load the past questions: Check online now if the PC has internet, or Load pack from file with the .zip from CAS. Load the student app with Load app from file and the CAS Student .apk.

Tablets on the school Wi-Fi find the server by themselves when the CAS Student app opens:
- New past questions download automatically. Past Questions shows "Connected to [school] at [address]" and "Updated from the school server".
- When the server has a newer app, the tablet shows "A newer CAS Student app is ready" with Install. Android asks once to allow installs from CAS Student.
If a tablet doesn't find the server, open Past Questions, School server, Enter address, and type the address shown on the server page (for example 192.168.88.10).

Whenever the PC has internet, the server fetches new past questions by itself every 30 minutes. The server page lists every tablet that has connected, with its app and past-questions versions, so you can see which still need updating.`,
  },
];

async function run() {
  console.log(`Seeding ${ENTRIES.length} School Server help entries…\n`);
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
