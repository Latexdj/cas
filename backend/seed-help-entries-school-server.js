'use strict';
/**
 * CAS School Server help entries: the server, offline class tests (admin, teacher, student).
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
    body: `The CAS School Server lets student tablets get new past questions, learning materials and new versions of the CAS Student app over the school's own Wi-Fi, with no internet. It also runs class tests offline.

It runs on one Windows PC that stays on at school, connected by cable to the main router that your Wi-Fi access points use. Ask CAS support for the CAS-School-Server folder, then on that PC:
1. Give the PC a fixed address (on the router, or in Windows network settings). The setup guide in the folder shows how.
2. Right-click install.bat and choose Run as administrator. The server starts, and starts again by itself whenever the PC starts.
3. Its page opens at http://localhost:8787 (it only opens on that PC). Load the past questions (Check online now, or Load pack from file), the student app (Load app from file), and learning materials (Upload files, Upload a folder, or Copy from this PC).

Tablets on the school Wi-Fi find the server by themselves when the CAS Student app opens. New past questions and learning materials download automatically, and a newer app shows "A newer CAS Student app is ready" with Install. If a tablet doesn't find the server, open Past Questions, Get new questions, Enter address, and type the address shown on the server page (for example 192.168.88.10).`,
  },
  {
    feature_area: 'lms',
    applicable_roles: ['admin'],
    title: 'Connecting the school server to CAS for offline class tests',
    body: `To let teachers give tests on the school Wi-Fi without internet, connect the school server to CAS once:
1. Here in CAS, open LMS, School Server, and click Make a pairing code. The code works once, for 15 minutes.
2. On the school server PC (which needs internet for this step), open http://localhost:8787, find Connect to CAS, type your school code and the pairing code, and click Connect.

The server then copies the active students and teachers (with their passwords in protected form) and the published LMS quizzes, and keeps them up to date every 10 minutes whenever it has internet. Tests made on the school network, and every result, come back into CAS LMS, so teachers can use Sync to CA as usual.

LMS, School Server lists connected servers and when each was last in touch. Disconnect stops a server syncing; connect it again with a new pairing code.`,
  },
  {
    feature_area: 'lms',
    applicable_roles: ['teacher'],
    title: 'Giving a class test on the school Wi-Fi (no internet)',
    body: `If your school has a CAS School Server, you can give tests on the school Wi-Fi even when there is no internet.

1. On a laptop or phone connected to the school Wi-Fi, open the address your admin gives you, ending in /teacher (for example http://192.168.88.10:8787/teacher), and sign in with your CAS teacher code and password.
2. Click New test. Give it a title, choose the class and subject, and set a time limit if you want one. Add objective questions (with the correct option) and short-answer questions (which you mark), or click Add from Past Questions to pick questions from the past-question bank.
3. Click Save and open for students. Students in that class see it under Class tests in the CAS Student app.
4. Click Results to watch who has started and submitted, mark short answers, and download a CSV. Close the test when time is up; unfinished answers are submitted.

LMS quizzes you published in CAS also appear on that page and can be opened there. Results reach your CAS LMS automatically when the school server next has internet, and you can then use Sync to CA.`,
  },
  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'Taking a class test on the school Wi-Fi',
    body: `When your teacher opens a test on the school network, it appears in the CAS Student app under Class tests (on the first screen, or in More).

1. Make sure the tablet is on the school Wi-Fi.
2. Open Class tests and sign in with your CAS student ID and password.
3. Tap Start test. Answer each question; your answers save as you go. If a timer shows, the test submits itself when time runs out.
4. Tap Finish test, then Submit. You see your score, and your teacher marks any written answers.

If the Wi-Fi drops, your answers stay on the tablet and are sent when it reconnects. When you finish, tap Sign out so the next student can use the tablet.`,
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
