'use strict';
// Verification tests for new-year tooling.
// Run with:  node test-newyear.js
// Requires DATABASE_URL in .env (loaded below).

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

let passCount = 0, failCount = 0;
const failures = [];

function section(title) {
  console.log('\n' + '═'.repeat(66));
  console.log(`  ${title}`);
  console.log('═'.repeat(66));
}

function pass(label) {
  passCount++;
  console.log(`  ✓  ${label}`);
}

function fail(label, detail) {
  failCount++;
  failures.push({ label, detail });
  console.log(`  ✗  ${label}`);
  if (detail) console.log(`       → ${detail}`);
}

function assert(cond, passLabel, failLabel, detail = '') {
  if (cond) pass(passLabel);
  else fail(failLabel, detail);
}

// ── Replicate /check DB logic inline (mirrors admissions.js behaviour) ─────────
// Returns { status: 404|403|200|'resume'|'already_submitted', body }
async function simulateCheck(schoolId, admissionYear, isPortalOpen, indexNumber) {
  if (!isPortalOpen) return { status: 403, body: 'Portal closed' };
  const idx = String(indexNumber).trim().toUpperCase();

  const placed = await q(
    `SELECT * FROM admission_placement
      WHERE school_id=$1 AND index_number=$2 AND admission_year=$3`,
    [schoolId, idx, admissionYear]
  );
  if (!placed.length) return { status: 404, body: 'Not on placement list' };

  const existing = await q(
    `SELECT form_token, status, form_step FROM admission_applications
      WHERE school_id=$1 AND index_number=$2 AND admission_year=$3`,
    [schoolId, idx, admissionYear]
  );
  if (existing.length) {
    const app = existing[0];
    if (['completed','reported','migrated'].includes(app.status))
      return { status: 200, body: { already_submitted: true } };
    return { status: 200, body: { resume: true, form_step: app.form_step } };
  }
  return { status: 200, body: { new_application: true, placement: placed[0] } };
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────

let SCHOOL_ID, PROG_ID;
const SLUG = `test-newyear-${Date.now()}`;

async function setup() {
  const [s] = await q(
    `INSERT INTO schools (name, email, primary_color, accent_color)
     VALUES ('TEST NewYear School', 'newyear@cas-test.invalid', '#145C44', '#F7B731')
     RETURNING id`
  );
  SCHOOL_ID = s.id;

  const [p] = await q(
    `INSERT INTO programs (school_id, name) VALUES ($1, 'General Science') RETURNING id`,
    [SCHOOL_ID]
  );
  PROG_ID = p.id;

  await q(
    `INSERT INTO school_admission_settings
       (school_id, portal_slug, admission_prefix, admission_year, next_sequence, is_portal_open)
     VALUES ($1, $2, 'TST', 25, 1, true)`,
    [SCHOOL_ID, SLUG]
  );

  console.log(`  School ID : ${SCHOOL_ID}`);
  console.log(`  Program   : ${PROG_ID}`);
}

async function cleanup() {
  if (!SCHOOL_ID) return;
  await q(`DELETE FROM admission_applications WHERE school_id=$1`, [SCHOOL_ID]);
  await q(`DELETE FROM admission_placement     WHERE school_id=$1`, [SCHOOL_ID]);
  await q(`DELETE FROM school_admission_settings WHERE school_id=$1`, [SCHOOL_ID]);
  await q(`DELETE FROM programs WHERE school_id=$1`, [SCHOOL_ID]);
  await q(`DELETE FROM schools WHERE id=$1`, [SCHOOL_ID]);
}

// ── Individual tests ───────────────────────────────────────────────────────────

// 1. Stale index number yields 404 when admission_year advances
async function test1_staleIndexNumber() {
  section('TEST 1 — Stale index number returns 404 at new-year portal');
  const IDX = 'STALE0000001';   // 12 chars
  const LAST_YEAR = 25, THIS_YEAR = 26;

  // Insert placement for last year
  await q(
    `INSERT INTO admission_placement
       (school_id, index_number, admission_year, full_name, gender, residential_status)
     VALUES ($1,$2,$3,'Kofi Mensah','Male','Boarding')`,
    [SCHOOL_ID, IDX, LAST_YEAR]
  );

  // Advance settings to this year
  await q(
    `UPDATE school_admission_settings SET admission_year=$1 WHERE school_id=$2`,
    [THIS_YEAR, SCHOOL_ID]
  );

  // Simulate /check at current portal (year=26, portal open)
  const r = await simulateCheck(SCHOOL_ID, THIS_YEAR, true, IDX);
  assert(r.status === 404,
    'Stale year=25 index returns 404 at year=26 portal',
    'Stale index was MATCHED at wrong year — year filter not working',
    `Got status ${r.status}, body: ${JSON.stringify(r.body)}`
  );

  // Also confirm last year still has the row (data not deleted)
  const lastYearRows = await q(
    `SELECT id FROM admission_placement
      WHERE school_id=$1 AND index_number=$2 AND admission_year=$3`,
    [SCHOOL_ID, IDX, LAST_YEAR]
  );
  assert(lastYearRows.length === 1,
    'Last-year placement row still intact (year-scoping does not delete data)',
    'Last-year placement row missing — data was incorrectly deleted'
  );
}

// 2. Same index_number for two different years coexists without constraint violation
async function test2_multiYearRows() {
  section('TEST 2 — Same index_number for two admission_years coexists');
  const IDX = 'MULTI0000001';
  const errors = [];

  for (const yr of [25, 26]) {
    try {
      await q(
        `INSERT INTO admission_placement
           (school_id, index_number, admission_year, full_name, gender, residential_status)
         VALUES ($1,$2,$3,$4,'Male','Day')`,
        [SCHOOL_ID, IDX, yr, `Student Year ${yr}`]
      );
    } catch (e) {
      errors.push(`year=${yr}: ${e.message}`);
    }
  }

  assert(errors.length === 0,
    'Two rows with same index_number but different years inserted without conflict',
    'Constraint violation inserting same index for different years',
    errors.join('; ')
  );

  // Duplicate same year should still fail (constraint still enforced within a year)
  let duplicateBlocked = false;
  try {
    await q(
      `INSERT INTO admission_placement
         (school_id, index_number, admission_year, full_name, gender, residential_status)
       VALUES ($1,$2,26,'Duplicate','Male','Day')`,
      [SCHOOL_ID, IDX]
    );
  } catch (e) {
    if (e.code === '23505') duplicateBlocked = true;
  }
  assert(duplicateBlocked,
    'Duplicate (same school, same index, same year) is correctly rejected',
    'Duplicate row was accepted — unique constraint not enforced within a year'
  );

  // Confirm both cross-year rows exist
  const rows = await q(
    `SELECT admission_year FROM admission_placement
      WHERE school_id=$1 AND index_number=$2 ORDER BY admission_year`,
    [SCHOOL_ID, IDX]
  );
  assert(rows.length === 2 && rows[0].admission_year === 25 && rows[1].admission_year === 26,
    'Both year=25 and year=26 rows are present',
    'Row count mismatch — expected 2 rows for two different years',
    `Got: ${JSON.stringify(rows)}`
  );
}

// 3. Wizard calls the same POST /reset-sequence endpoint (code inspection)
async function test3_wizardEndpoint() {
  section('TEST 3 — Wizard uses POST /settings/reset-sequence (code inspection)');

  const wizardPath = path.join(__dirname, '..', 'admin-portal', 'app', '(dashboard)',
                                'admissions', 'new-cycle', 'page.tsx');
  let wizardSrc = '';
  try {
    wizardSrc = fs.readFileSync(wizardPath, 'utf8');
  } catch (e) {
    fail('Wizard file readable', `Cannot read wizard page: ${e.message}`);
    return;
  }
  pass('Wizard page file exists at expected path');

  const endpoint = '/api/admin/admissions/settings/reset-sequence';
  assert(wizardSrc.includes(endpoint),
    `Wizard calls correct endpoint (${endpoint})`,
    'Wizard does NOT reference the correct reset endpoint',
    'Check new-cycle/page.tsx for the api.post call in resetSeq()'
  );

  // Confirm no separate implementation — there should be exactly one occurrence
  // of the endpoint string in the wizard (the api.post call)
  const count = (wizardSrc.match(new RegExp(endpoint.replace(/\//g,'\\/'),'g')) || []).length;
  assert(count === 1,
    'Endpoint referenced exactly once — no duplicate implementations',
    `Endpoint found ${count} times — unexpected duplicates`
  );

  // Confirm the settings-page reset dialog also uses the same endpoint
  const settingsPath = path.join(__dirname, '..', 'admin-portal', 'app', '(dashboard)',
                                  'admissions', 'settings', 'page.tsx');
  let settingsSrc = '';
  try {
    settingsSrc = fs.readFileSync(settingsPath, 'utf8');
  } catch (e) {
    fail('Settings page readable', `Cannot read settings page: ${e.message}`);
    return;
  }
  assert(settingsSrc.includes(endpoint),
    'Settings page also calls same endpoint (two entry-points, one backend)',
    'Settings page uses a different or missing endpoint for reset'
  );
}

// 4. Full wizard flow at DB level
async function test4_wizardFlow() {
  section('TEST 4 — Wizard flow end-to-end (DB-level simulation)');
  const IDX = 'WIZAR0000001';

  // Ensure portal starts open and year=26 (from test1 update)
  await q(
    `UPDATE school_admission_settings
        SET admission_year=26, admission_prefix='TST', next_sequence=312, is_portal_open=true
      WHERE school_id=$1`,
    [SCHOOL_ID]
  );

  // Step 1: Update year & prefix (wizard PATCH /settings)
  await q(
    `UPDATE school_admission_settings
        SET admission_year=26, admission_prefix='NEWTST', updated_at=now()
      WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  const [afterStep1] = await q(
    `SELECT admission_year, admission_prefix, next_sequence FROM school_admission_settings WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  assert(afterStep1.admission_year === 26 && afterStep1.admission_prefix === 'NEWTST',
    'Step 1: year=26 and new prefix saved',
    'Step 1: settings not updated correctly',
    JSON.stringify(afterStep1)
  );

  // Step 2: Reset sequence (wizard POST /reset-sequence)
  await q(
    `UPDATE school_admission_settings SET next_sequence=1 WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  const [afterStep2] = await q(
    `SELECT next_sequence FROM school_admission_settings WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  assert(afterStep2.next_sequence === 1,
    'Step 2: sequence reset to 1',
    'Step 2: sequence not reset',
    `next_sequence=${afterStep2.next_sequence}`
  );

  // Step 3: Close portal
  await q(
    `UPDATE school_admission_settings SET is_portal_open=false WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  // Verify /check returns 403 while portal is closed
  const [settings3] = await q(
    `SELECT is_portal_open, admission_year FROM school_admission_settings WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  const rWhileClosed = await simulateCheck(SCHOOL_ID, settings3.admission_year, settings3.is_portal_open, IDX);
  assert(!settings3.is_portal_open,
    'Step 3: portal confirmed closed',
    'Step 3: portal still open after close'
  );
  assert(rWhileClosed.status === 403,
    'Step 3: /check returns 403 while portal is closed (no registrations possible)',
    'Step 3: /check did NOT return 403 — portal incorrectly allows registrations',
    `Status: ${rWhileClosed.status}`
  );

  // Step 4: Insert placement row (simulates CSSPS upload)
  await q(
    `INSERT INTO admission_placement
       (school_id, index_number, admission_year, full_name, gender, residential_status)
     VALUES ($1,$2,26,'Wizard Student','Male','Boarding')`,
    [SCHOOL_ID, IDX]
  );
  const placed = await q(
    `SELECT id FROM admission_placement
      WHERE school_id=$1 AND index_number=$2 AND admission_year=26`,
    [SCHOOL_ID, IDX]
  );
  assert(placed.length === 1,
    'Step 4: CSSPS upload tagged row with current year=26',
    'Step 4: placement row not inserted / wrong year'
  );

  // Step 5: Checklist — no DB calls, just UI. Nothing to verify at DB level.
  pass('Step 5: Manual checklist is UI-only (no DB side-effects to verify)');

  // Step 6: Open portal
  await q(
    `UPDATE school_admission_settings SET is_portal_open=true WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  const [settings6] = await q(
    `SELECT is_portal_open, admission_year FROM school_admission_settings WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  assert(settings6.is_portal_open,
    'Step 6: portal reopened',
    'Step 6: portal still closed after reopen'
  );
  // Now /check with the year=26 placement row should match
  const rAfterOpen = await simulateCheck(SCHOOL_ID, settings6.admission_year, settings6.is_portal_open, IDX);
  assert(rAfterOpen.status === 200 && rAfterOpen.body.new_application,
    'Step 6: /check now finds year=26 placement row and would create new application',
    'Step 6: /check failed after portal reopened',
    `Status: ${rAfterOpen.status}, body: ${JSON.stringify(rAfterOpen.body)}`
  );
}

// 5. Placement year filter and stats scoping
async function test5_yearFilterAndStats() {
  section('TEST 5 — Placement year filter and stats scoping');

  // Two year=25 rows already exist (STALE0000001 and MULTI0000001 from tests 1&2)
  // Year=26 rows: MULTI0000001, WIZAR0000001 from tests 2&4
  const yr25Rows = await q(
    `SELECT index_number FROM admission_placement
      WHERE school_id=$1 AND admission_year=25 ORDER BY index_number`,
    [SCHOOL_ID]
  );
  const yr26Rows = await q(
    `SELECT index_number FROM admission_placement
      WHERE school_id=$1 AND admission_year=26 ORDER BY index_number`,
    [SCHOOL_ID]
  );

  assert(yr25Rows.length >= 2,
    `?year=25 filter returns only year=25 rows (got ${yr25Rows.length})`,
    '?year=25 filter returned wrong count',
    `Rows: ${JSON.stringify(yr25Rows)}`
  );
  assert(yr26Rows.length >= 2,
    `?year=26 filter returns only year=26 rows (got ${yr26Rows.length})`,
    '?year=26 filter returned wrong count',
    `Rows: ${JSON.stringify(yr26Rows)}`
  );

  // Stats scoping: settings.admission_year=26, so stats should count year=26 placements
  const [settings] = await q(
    `SELECT admission_year FROM school_admission_settings WHERE school_id=$1`,
    [SCHOOL_ID]
  );
  const [stats] = await q(
    `SELECT COUNT(*)::int AS total_placed,
            COUNT(*) FILTER (WHERE is_registered)::int AS total_registered
      FROM admission_placement
     WHERE school_id=$1 AND admission_year=$2`,
    [SCHOOL_ID, settings.admission_year]
  );
  assert(settings.admission_year === 26,
    'Current admission_year in settings is 26 (as set by wizard step 1)',
    'Settings year mismatch',
    `Got ${settings.admission_year}`
  );
  assert(stats.total_placed === yr26Rows.length,
    `Stats total_placed=${stats.total_placed} matches year=26 placement count (${yr26Rows.length})`,
    'Stats total_placed does not match current-year placement count',
    `stats.total_placed=${stats.total_placed} vs yr26Rows.length=${yr26Rows.length}`
  );

  // No cross-contamination: year=25 rows don't appear in stats
  const allRows = await q(
    `SELECT admission_year, COUNT(*)::int AS cnt FROM admission_placement
      WHERE school_id=$1 GROUP BY admission_year ORDER BY admission_year`,
    [SCHOOL_ID]
  );
  const totalAllYears = allRows.reduce((s, r) => s + r.cnt, 0);
  const yr25Count = allRows.find(r => r.admission_year === 25)?.cnt ?? 0;
  assert(stats.total_placed < totalAllYears,
    `Stats shows ${stats.total_placed} (year=26 only), not ${totalAllYears} (all years combined)`,
    'Stats is counting all years instead of current year only',
    `stats=${stats.total_placed}, year=25 rows=${yr25Count}, all rows=${totalAllYears}`
  );
}

// 6. Migrated students are unaffected
async function test6_migratedStudentUnaffected() {
  section('TEST 6 — Migrated students unaffected by year-scoping');

  // Insert a student (simulates migration output)
  const [student] = await q(
    `INSERT INTO students
       (school_id, student_code, name, class_name, status, year_of_admission, gender)
     VALUES ($1, 'S999', 'Old Student Kwame', '1', 'Active', 2025, 'Male')
     RETURNING id`,
    [SCHOOL_ID]
  );

  // Insert a migrated application linked to that student (year=25)
  await q(
    `INSERT INTO admission_applications
       (school_id, index_number, admission_number, admission_year, full_name,
        gender, residential_status, program_id, status, student_id,
        form_step, form_completed_at, migrated_at)
     VALUES ($1,'MIGR00000001','TST0001 25',25,'Old Student Kwame',
             'Male','Boarding',$2,'migrated',$3,5,now(),now())`,
    [SCHOOL_ID, PROG_ID, student.id]
  );

  // Student row must be unchanged
  const [s] = await q(`SELECT id, name, status FROM students WHERE id=$1`, [student.id]);
  assert(s && s.name === 'Old Student Kwame' && s.status === 'Active',
    'Migrated student record is unchanged',
    'Migrated student record was altered',
    JSON.stringify(s)
  );

  // Migrated application still exists with year=25
  const [app] = await q(
    `SELECT status, admission_year, student_id FROM admission_applications
      WHERE student_id=$1`,
    [student.id]
  );
  assert(app && app.status === 'migrated' && app.admission_year === 25,
    'Migrated application row intact: status=migrated, year=25',
    'Migrated application row was modified or missing',
    JSON.stringify(app)
  );
  assert(String(app.student_id) === String(student.id),
    'student_id foreign key still points to correct student',
    'student_id link broken',
    `app.student_id=${app.student_id}, expected=${student.id}`
  );

  // Year=25 application does NOT surface when /check queries year=26
  // (The migrated student's old index can't be re-used this year without a new placement row)
  const check26 = await q(
    `SELECT id FROM admission_applications
      WHERE school_id=$1 AND index_number='MIGR00000001' AND admission_year=26`,
    [SCHOOL_ID]
  );
  assert(check26.length === 0,
    'Year=25 migrated application does not appear in year=26 queries',
    'Year=25 migrated application incorrectly matches year=26 filter',
    `Got ${check26.length} rows`
  );

  // Clean up student (cascade should handle the application)
  await q(`DELETE FROM students WHERE id=$1`, [student.id]);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '╔' + '═'.repeat(64) + '╗');
  console.log('║  New-Year Tooling Verification                                 ║');
  console.log('╚' + '═'.repeat(64) + '╝');

  section('SETUP');
  try {
    await setup();
    pass('Test school and settings created');
  } catch (e) {
    fail('Setup failed', e.message);
    console.log('\nCannot continue — aborting.\n');
    await pool.end();
    process.exit(1);
  }

  try {
    await test1_staleIndexNumber();
    await test2_multiYearRows();
    await test3_wizardEndpoint();
    await test4_wizardFlow();
    await test5_yearFilterAndStats();
    await test6_migratedStudentUnaffected();
  } finally {
    section('CLEANUP');
    try {
      await cleanup();
      pass('Test data removed');
    } catch (e) {
      fail('Cleanup failed', e.message);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(66));
  console.log(`  RESULT   ${passCount} passed  /  ${failCount} failed  /  ${passCount + failCount} total`);
  if (failures.length) {
    console.log('\n  Failed assertions:');
    failures.forEach(f => {
      console.log(`  ✗  ${f.label}`);
      if (f.detail) console.log(`       ${f.detail}`);
    });
  }
  console.log('═'.repeat(66) + '\n');

  await pool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('\nUnhandled error:', e.message);
  pool.end();
  process.exit(1);
});
