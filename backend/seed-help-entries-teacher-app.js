'use strict';
/**
 * CAS Teacher app (phone) help entries: lesson reminders, what the app does,
 * results on the phone, and the duties that appear for responsibilities.
 * Run: node backend/seed-help-entries-teacher-app.js
 * Safe to re-run: an existing global entry with the same title is updated.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false } });

const ENTRIES = [
  {
    feature_area: 'timetable',
    applicable_roles: ['teacher'],
    title: 'Lesson reminders: a bell on your phone before each lesson',
    body: `The CAS Teacher app on your phone can ring a bell a few minutes before each lesson on your timetable, and before remedial lessons you have scheduled.

1. In the app, open More, Lesson reminders, and switch reminders on. Allow notifications when your phone asks.
2. Choose how early: 2, 5, 10 or 15 minutes before.
3. Choose the sound: the long bell (about 25 seconds) or a short chime. Tap Test reminder to hear it.
4. Choose lessons, remedials, or both.

Tapping a reminder opens Submit attendance for that lesson. Reminders work without internet once set; the app refreshes them for the next 7 days each time you open it, and skips holidays and closed days on the school calendar. If reminders stop, open the app once, and check that notifications are allowed for CAS Teacher in your phone settings.`,
  },
  {
    feature_area: 'dashboard',
    applicable_roles: ['teacher'],
    title: 'What you can do in the CAS Teacher app on your phone',
    body: `The CAS Teacher app (version 1.1 and later) has everything in the web teacher portal. The tabs along the bottom are Today, Timetable, Marks, Absences and More.

Today shows the lesson that is on now or next, with Submit attendance, the rest of today's lessons, meetings and notices.

More lists everything else in sections: your responsibilities first (Form Class, My Department, Budgets, My House, Roll Call, Resumption Register, Library, Clearance), then Attendance, Students, Academics (Results, My Courses, Resources), Administrative (Leave, Conduct, Memos, My Letters, Clinic, Scan ID Card, My Observations) and your Account. You only see the items your school uses and the duties you hold.

Messages appear as a bar across the top of the screen; tap the cross to close one. Files such as PDFs and Excel sheets open in your phone's share menu, so you can save them or send them on WhatsApp.`,
  },
  {
    feature_area: 'assessments',
    applicable_roles: ['teacher'],
    title: 'Entering marks and submitting results from your phone',
    body: `In the CAS Teacher app, open Marks and choose a subject and class.

- Add class tests, exercises and projects with New assessment, then tap one to enter scores.
- Tap End-of-semester exam to enter exam scores, set the highest score, and add subject remarks for each student (Draft with AI suggests one; read it before you use it).
- To work in Excel, tap CA template or Excel template; the file opens in your share menu. Fill it in, then tap Upload CA sheet or Upload filled sheet and choose the file.
- When everything is in, tap Submit to HOD. The app checks that the exam and every assessment are complete and lists anything missing.

Once submitted, scores are locked. If your HOD sends the results back, the reason shows at the top, and you can change the scores and submit again.`,
  },
  {
    feature_area: 'teachers',
    applicable_roles: ['teacher'],
    title: 'Duties in the CAS Teacher app: form teacher, HOD, housemaster, library and clearance',
    body: `If you hold a duty at school, its pages appear at the top of More in the CAS Teacher app.

- Form Class: your class's students, attendance and results, report-card remarks (with AI drafts), and students flagged for discipline.
- My Department (heads of department): overview, results waiting for your approval, class results, classes, teachers and missed lessons. Department Inventory, Department Observations and Budgets open from there.
- My House (housemasters): rooms, students and exeats. Senior housemasters also get Roll Call and the Resumption Register.
- Library: issue and return books, renew loans, fines and the catalogue.
- Clearance: students waiting for your office, and your decisions.

On the phone you can scan an item's barcode when issuing tagged equipment, take evidence photos during a lesson observation, and share reports as PDF or Excel.`,
  },
];

async function run() {
  console.log(`Seeding ${ENTRIES.length} teacher app help entries…\n`);
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
