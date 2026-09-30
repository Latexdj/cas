'use strict';
// Backfills subscriptions.student_limit for every REAL school (excludes the two
// known test schools, CAS002 "Test Primary School" and CAS004 "Test SHS School").
//
// Rule: round the school's current live active-student count up to the next
// multiple of 500, then add one more full 500-block as headroom:
//   student_limit = (ceil(active_count / 500) + 1) * 500
// e.g. 548 active students -> ceil(548/500)=2, +1=3, *500 = 1500 (≈3x current usage).
//      0 active students   -> ceil(0/500)=0,   +1=1, *500 = 500  (floor).
// This guarantees every real school starts with at least one full 500-seat
// block of headroom beyond its next round-number tier, so nothing is anywhere
// near the new cap on day one — matching the non-disruptive posture the
// original `inventory` module backfill used (default generous, never
// retroactively punish existing schools for a policy that didn't exist when
// they signed up).
//
// Idempotent: only touches subscriptions where student_limit IS NULL, so it's
// safe to rerun (e.g. after a new real school is added) without clobbering a
// value a super-admin has since set manually via PATCH /api/schools/:id/student-limit.
//
// Usage:
//   node run-migration-student-limit-backfill.js          -> dry run (prints only)
//   node run-migration-student-limit-backfill.js --write   -> actually writes

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TEST_SCHOOL_CODES = ['CAS002', 'CAS004']; // Test Primary School, Test SHS School

function computeLimit(activeCount) {
  return (Math.ceil(activeCount / 500) + 1) * 500;
}

async function run() {
  const write = process.argv.includes('--write');

  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS student_limit INTEGER`);

  const { rows: schools } = await pool.query(`
    SELECT s.id, s.name, s.code,
      (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'Active')::int AS active_students,
      sub.id AS subscription_id,
      sub.student_limit AS current_student_limit
    FROM schools s
    LEFT JOIN subscriptions sub ON sub.id = (
      SELECT id FROM subscriptions WHERE school_id = s.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE s.code NOT IN (${TEST_SCHOOL_CODES.map((_, i) => `$${i + 1}`).join(',')})
    ORDER BY s.code
  `, TEST_SCHOOL_CODES);

  console.log(`${write ? 'WRITE' : 'DRY RUN'} — student_limit backfill for ${schools.length} real school(s)\n`);

  for (const s of schools) {
    if (!s.subscription_id) {
      console.log(`  ${s.code} ${s.name}: NO SUBSCRIPTION ROW — skipped`);
      continue;
    }
    if (s.current_student_limit !== null) {
      console.log(`  ${s.code} ${s.name}: already set (student_limit=${s.current_student_limit}) — skipped`);
      continue;
    }
    const newLimit = computeLimit(s.active_students);
    const headroom = newLimit - s.active_students;
    const pctUsed  = ((s.active_students / newLimit) * 100).toFixed(1);
    console.log(`  ${s.code} ${s.name}: active_students=${s.active_students} -> student_limit=${newLimit} (headroom ${headroom}, ${pctUsed}% used)`);

    if (write) {
      await pool.query(
        `UPDATE subscriptions SET student_limit = $1, updated_at = now() WHERE id = $2 AND student_limit IS NULL`,
        [newLimit, s.subscription_id]
      );
    }
  }

  console.log(write ? '\nBackfill written.' : '\nDry run only — rerun with --write to apply.');
  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
