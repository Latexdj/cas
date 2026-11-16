'use strict';
/**
 * Past Questions help entries: the offline quiz for students, and the shared
 * question bank for school admins.
 * Run: node backend/seed-help-entries-past-questions.js
 * Safe to re-run: an existing global entry with the same title is updated.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false } });

const ENTRIES = [
  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'Practising past questions (Past Questions)',
    body: `Past Questions lets you practise WASSCE and BECE questions, even with no internet. Open it from the first screen of the student app (no login needed) or from More after you log in.

Choose a subject, then one of these:
- Practice: mixed objective questions. Pick a year and how many questions. Each answer is marked straight away, with an explanation.
- Full paper: one real paper, timed at one minute a question, marked at the end with a review of every question.
- Theory: read the question, write your answer on paper, then tap Show marking scheme and mark yourself Got it, Partly or Missed.
- Retry my mistakes: only the questions you got wrong last time.

Your scores are kept on that tablet only. Clear progress, at the bottom of a subject, starts the subject again.

New questions arrive by themselves when the tablet is online: open Past Questions, or tap the refresh button.

On a tablet with no internet, load them from a USB flash drive: plug in the drive holding the Past Questions .zip file, open Past Questions, tap Choose file under Load from USB drive, and pick the .zip on the drive. When it says the questions are loaded you can remove the drive. If the tablet already has the same or newer questions it tells you, and Load it anyway loads the file regardless.

When you are logged in, Pasco (in LMS) also includes these questions alongside your school's own.`,
  },
  {
    feature_area: 'lms',
    applicable_roles: ['admin'],
    title: 'Shared past questions in Pasco and on student tablets',
    body: `CAS adds a shared bank of past questions (WASSCE, BECE and others) that every school gets.

In the student app, Past Questions works without login or internet. Each tablet downloads new questions by itself whenever it is online.

For tablets that never go online: ask CAS support for the latest Past Questions pack (a .zip file) and copy it onto a USB flash drive without unzipping it. Plug the drive into the tablet (most tablets need a USB OTG adapter), open Past Questions in the student app, tap Choose file under Load from USB drive, and pick the .zip. The same drive can be used tablet after tablet. setup-tablet.bat can also copy an unzipped Past Questions folder, as before.

The shared objective questions also appear in your students' Pasco practice, next to the questions your school adds in LMS › Pasco. They do not appear in your LMS › Pasco list and can't be edited there.`,
  },
];

async function run() {
  console.log(`Seeding ${ENTRIES.length} Past Questions help entries…\n`);
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
