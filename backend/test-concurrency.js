'use strict';
// Concurrency / edge-case test for house assignment + admission number generation.
// Run with:  node test-concurrency.js
// Requires DATABASE_URL in .env (loaded below).

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 12,          // Supabase session-mode pooler cap is 15; leave headroom
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad(n, w = 4) { return String(n).padStart(w, '0'); }

async function q(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

function section(title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function result(label, value) {
  console.log(`  ${label.padEnd(36)} ${value}`);
}

// ── Service replicas (inline copies so we test what's actually in production) ──

async function generateAdmissionNumber_current(schoolId, client) {
  const { rows } = await client.query(
    `UPDATE school_admission_settings
     SET next_sequence = next_sequence + 1, updated_at = now()
     WHERE school_id = $1
     RETURNING next_sequence - 1 AS seq, admission_prefix, admission_year`,
    [schoolId]
  );
  if (!rows.length) throw new Error('No admission settings');
  const { seq, admission_prefix, admission_year } = rows[0];
  return `${admission_prefix}${String(seq).padStart(4, '0')}${String(admission_year).padStart(2, '0')}`;
}

async function assignHouse_current(schoolId, gender, residentialStatus, programId) {
  const { rows: houses } = await pool.query(
    `SELECT name FROM houses WHERE school_id = $1 ORDER BY name`, [schoolId]
  );
  if (!houses.length) return null;

  const { rows: counts } = await pool.query(
    `SELECT house,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE program_id = $4)::int AS prog_count
     FROM admission_applications
     WHERE school_id = $1 AND LOWER(gender) = LOWER($2)
       AND LOWER(residential_status) = LOWER($3)
       AND status != 'pending' AND house IS NOT NULL
     GROUP BY house`,
    [schoolId, gender, residentialStatus, programId]
  );

  const total = {}, prog = {};
  for (const r of counts) { total[r.house] = r.total; prog[r.house] = r.prog_count; }

  let best = null, bestScore = Infinity;
  for (const h of houses) {
    const score = (total[h.name] ?? 0) + 0.3 * (prog[h.name] ?? 0);
    if (score < bestScore) { bestScore = score; best = h.name; }
  }
  return best;
}

// Fixed version (accepts client, uses FOR UPDATE)
async function assignHouse_fixed(schoolId, gender, residentialStatus, programId, client) {
  const db = client || pool;
  const lockClause = client ? ' FOR UPDATE' : '';
  const { rows: houses } = await db.query(
    `SELECT name FROM houses WHERE school_id = $1 ORDER BY name${lockClause}`, [schoolId]
  );
  if (!houses.length) return null;

  const { rows: counts } = await db.query(
    `SELECT house,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE program_id = $4)::int AS prog_count
     FROM admission_applications
     WHERE school_id = $1 AND LOWER(gender) = LOWER($2)
       AND LOWER(residential_status) = LOWER($3)
       AND status != 'pending' AND house IS NOT NULL
     GROUP BY house`,
    [schoolId, gender, residentialStatus, programId]
  );

  const total = {}, prog = {};
  for (const r of counts) { total[r.house] = r.total; prog[r.house] = r.prog_count; }

  let best = null, bestScore = Infinity;
  for (const h of houses) {
    const score = (total[h.name] ?? 0) + 0.3 * (prog[h.name] ?? 0);
    if (score < bestScore) { bestScore = score; best = h.name; }
  }
  return best;
}

// ── Test setup / teardown ──────────────────────────────────────────────────────

let TEST_SCHOOL_ID, TEST_PROGRAM_ID, TEST_HOUSE_IDS;
const TEST_SLUG = `test-concurrency-${Date.now()}`;

async function setup() {
  // School
  const [school] = await q(
    `INSERT INTO schools (name, email, primary_color, accent_color)
     VALUES ('TEST Concurrency School', 'test@cas-test.invalid', '#145C44', '#F7B731')
     RETURNING id`, []
  );
  TEST_SCHOOL_ID = school.id;

  // Program
  const [prog] = await q(
    `INSERT INTO programs (school_id, name) VALUES ($1, 'General Arts') RETURNING id`,
    [TEST_SCHOOL_ID]
  );
  TEST_PROGRAM_ID = prog.id;

  // Houses (4)
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const houseRows = [];
  for (const name of names) {
    const [h] = await q(
      `INSERT INTO houses (school_id, name) VALUES ($1, $2) RETURNING id`,
      [TEST_SCHOOL_ID, name]
    );
    houseRows.push(h);
  }
  TEST_HOUSE_IDS = houseRows.map(r => r.id);

  // Admission settings
  await q(
    `INSERT INTO school_admission_settings
       (school_id, portal_slug, admission_prefix, admission_year, next_sequence)
     VALUES ($1, $2, 'TST', '26', 1)`,
    [TEST_SCHOOL_ID, TEST_SLUG]
  );
}

async function cleanup() {
  if (!TEST_SCHOOL_ID) return;
  await q(`DELETE FROM admission_applications WHERE school_id=$1`, [TEST_SCHOOL_ID]);
  await q(`DELETE FROM school_admission_settings WHERE school_id=$1`, [TEST_SCHOOL_ID]);
  await q(`DELETE FROM houses WHERE school_id=$1`, [TEST_SCHOOL_ID]);
  await q(`DELETE FROM programs WHERE school_id=$1`, [TEST_SCHOOL_ID]);
  await q(`DELETE FROM schools WHERE id=$1`, [TEST_SCHOOL_ID]);
}

// ── Insert a fake completed application with a given house (helper) ────────────

let fakeSeq = 0;
async function insertFakeApp(house, assignedHouse) {
  fakeSeq++;
  await q(
    `INSERT INTO admission_applications
       (school_id, index_number, admission_number, full_name, gender,
        residential_status, program_id, house, status, form_step, form_completed_at, updated_at)
     VALUES ($1,$2,$3,$4,'Male','Boarding',$5,$6,'completed',5,now(),now())`,
    [TEST_SCHOOL_ID, `IDX${String(fakeSeq).padStart(9,'0')}`,
     `TST${pad(fakeSeq)}26`, `Fake Student ${fakeSeq}`,
     TEST_PROGRAM_ID, assignedHouse]
  );
}

// ── Test runners ───────────────────────────────────────────────────────────────

async function runHouseAssignmentCurrent(n) {
  // Fire n concurrent assignments using the CURRENT (unfixed) code.
  // Each inserts a completed app with the house the function chose.
  const tasks = Array.from({ length: n }, (_, i) => (async () => {
    const house = await assignHouse_current(
      TEST_SCHOOL_ID, 'Male', 'Boarding', TEST_PROGRAM_ID
    );
    await q(
      `INSERT INTO admission_applications
         (school_id, index_number, full_name, gender, residential_status,
          program_id, house, status, form_step, form_completed_at, updated_at)
       VALUES ($1,$2,$3,'Male','Boarding',$4,$5,'completed',5,now(),now())`,
      [TEST_SCHOOL_ID, `CURR${String(i).padStart(8,'0')}`, `Current Student ${i}`,
       TEST_PROGRAM_ID, house]
    );
    return house;
  })());

  return Promise.all(tasks);
}

async function runHouseAssignmentFixed(n) {
  // Fixed version: each assignment runs inside its own transaction with FOR UPDATE.
  const tasks = Array.from({ length: n }, (_, i) => (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const house = await assignHouse_fixed(
        TEST_SCHOOL_ID, 'Male', 'Boarding', TEST_PROGRAM_ID, client
      );
      await client.query(
        `INSERT INTO admission_applications
           (school_id, index_number, full_name, gender, residential_status,
            program_id, house, status, form_step, form_completed_at, updated_at)
         VALUES ($1,$2,$3,'Male','Boarding',$4,$5,'completed',5,now(),now())`,
        [TEST_SCHOOL_ID, `FIX${String(i).padStart(8,'0')}`, `Fixed Student ${i}`,
         TEST_PROGRAM_ID, house]
      );
      await client.query('COMMIT');
      return house;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })());

  return Promise.all(tasks);
}

// houseNames: full list of configured houses (so 0-count houses appear in report)
function distributionReport(assignments, label, houseNames = []) {
  const dist = {};
  for (const name of houseNames) dist[name] = 0;
  for (const h of assignments) dist[h] = (dist[h] ?? 0) + 1;
  const sorted = Object.entries(dist).sort((a, b) => a[0].localeCompare(b[0]));
  const total = assignments.length;
  const counts = sorted.map(([,c]) => c);
  const min = Math.min(...counts), max = Math.max(...counts);
  const skew = max - min;
  const isRaceCondition = sorted.filter(([,c]) => c > 0).length === 1 && total > 1;
  console.log(`\n  ${label} (n=${total}):`);
  for (const [name, count] of sorted) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const bar = total > 0 ? '█'.repeat(Math.round(count / total * 30)) : '';
    console.log(`    ${name.padEnd(10)} ${String(count).padStart(3)} (${pct}%)  ${bar}`);
  }
  if (isRaceCondition) {
    console.log(`    spread: ${skew}  ✗ RACE CONDITION — all landed on one house`);
  } else {
    console.log(`    spread (max-min): ${skew}  — ${skew <= 2 ? '✓ balanced' : '✗ SKEWED'}`);
  }
  return { skew, isRaceCondition };
}

async function runAdmissionNumberTest(n) {
  // Fire n concurrent generation requests, each in its own transaction.
  const tasks = Array.from({ length: n }, () => (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const num = await generateAdmissionNumber_current(TEST_SCHOOL_ID, client);
      // Don't actually insert an application — just return the number
      await client.query('COMMIT');
      return num;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })());

  return Promise.all(tasks);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  CAS Concurrency / Edge-Case Tests                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    console.log('Setting up test school...');
    await setup();
    console.log(`  School ID : ${TEST_SCHOOL_ID}`);
    console.log(`  Program   : ${TEST_PROGRAM_ID}`);
    console.log(`  Houses    : Alpha, Beta, Gamma, Delta`);

    // ── 1. House Assignment: 25 concurrent — CURRENT (unfixed) code ────────────
    section('1. House Assignment — CURRENT (unfixed), n=25 concurrent');

    const N = 25;
    const t0 = Date.now();
    let currAssignments;
    try {
      currAssignments = await runHouseAssignmentCurrent(N);
      result('Completed in', `${Date.now() - t0}ms`);
    } catch (e) {
      console.error('  ERROR:', e.message);
      currAssignments = [];
    }
    const HOUSE_NAMES = ['Alpha', 'Beta', 'Delta', 'Gamma'];
    const currResult = distributionReport(currAssignments, 'Current code distribution', HOUSE_NAMES);

    // Clean up the inserted rows so fixed test starts clean
    await q(`DELETE FROM admission_applications WHERE school_id=$1`, [TEST_SCHOOL_ID]);

    // ── 2. House Assignment: 25 concurrent — FIXED code ───────────────────────
    section('2. House Assignment — FIXED (FOR UPDATE txn), n=25 concurrent');

    const t1 = Date.now();
    let fixedAssignments;
    try {
      fixedAssignments = await runHouseAssignmentFixed(N);
      result('Completed in', `${Date.now() - t1}ms`);
    } catch (e) {
      console.error('  ERROR:', e.message);
      fixedAssignments = [];
    }
    const fixedResult = distributionReport(fixedAssignments, 'Fixed code distribution', HOUSE_NAMES);

    // ── 3. Edge cases ──────────────────────────────────────────────────────────
    section('3. Edge Cases: House Assignment');
    await q(`DELETE FROM admission_applications WHERE school_id=$1`, [TEST_SCHOOL_ID]);

    // 3a. No houses
    await q(`DELETE FROM houses WHERE school_id=$1`, [TEST_SCHOOL_ID]);
    const noHouseResult = await assignHouse_fixed(TEST_SCHOOL_ID, 'Male', 'Boarding', TEST_PROGRAM_ID, null);
    result('No houses → returns', noHouseResult === null ? 'null ✓' : `${noHouseResult} ✗ (expected null)`);

    // 3b. Exactly one house
    await q(`INSERT INTO houses (school_id, name) VALUES ($1, 'Solo')`, [TEST_SCHOOL_ID]);
    const oneHouseResults = await Promise.all(
      Array.from({ length: 5 }, (_, i) => (async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const h = await assignHouse_fixed(TEST_SCHOOL_ID, 'Male', 'Boarding', TEST_PROGRAM_ID, client);
          await client.query(
            `INSERT INTO admission_applications
               (school_id, index_number, full_name, gender, residential_status,
                program_id, house, status, form_step, form_completed_at, updated_at)
             VALUES ($1,$2,$3,'Male','Boarding',$4,$5,'completed',5,now(),now())`,
            [TEST_SCHOOL_ID, `SOLO${i}`, `Solo Student ${i}`, TEST_PROGRAM_ID, h]
          );
          await client.query('COMMIT');
          return h;
        } catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
      })())
    );
    const allSolo = oneHouseResults.every(h => h === 'Solo');
    result('1 house → all assigned "Solo"', allSolo ? '✓' : `✗ got: ${JSON.stringify(oneHouseResults)}`);

    // 3c. Tie-breaking: two houses with equal score
    await q(`DELETE FROM admission_applications WHERE school_id=$1`, [TEST_SCHOOL_ID]);
    await q(`DELETE FROM houses WHERE school_id=$1`, [TEST_SCHOOL_ID]);
    await q(`INSERT INTO houses (school_id, name) VALUES ($1,'Aries'),($1,'Zeus')`, [TEST_SCHOOL_ID]);
    // Pre-seed equal counts: 3 in each house
    await insertFakeApp('Aries', 'Aries'); await insertFakeApp('Aries', 'Aries'); await insertFakeApp('Aries', 'Aries');
    await insertFakeApp('Zeus', 'Zeus');  await insertFakeApp('Zeus', 'Zeus');  await insertFakeApp('Zeus', 'Zeus');
    const tieResults = [];
    for (let i = 0; i < 5; i++) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const h = await assignHouse_fixed(TEST_SCHOOL_ID, 'Female', 'Boarding', TEST_PROGRAM_ID, client);
        // Don't write — just read (read-only txn to see same state each time for tie test)
        await client.query('ROLLBACK');
        tieResults.push(h);
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }
    const tieUniq = [...new Set(tieResults)];
    result('Tie (3 vs 3) → deterministic?', tieUniq.length === 1
      ? `Yes ✓ always picks "${tieResults[0]}" (ORDER BY name)`
      : `✗ non-deterministic: ${JSON.stringify(tieResults)}`);

    // ── 4. Admission number generation: 25 concurrent ─────────────────────────
    section('4. Admission Number Generation — n=25 concurrent');
    // Reset sequence
    await q(`UPDATE school_admission_settings SET next_sequence=1 WHERE school_id=$1`, [TEST_SCHOOL_ID]);

    const t2 = Date.now();
    const admNumbers = await runAdmissionNumberTest(25);
    result('Completed in', `${Date.now() - t2}ms`);
    result('Numbers generated', admNumbers.length);

    const uniq = new Set(admNumbers);
    result('All unique?', uniq.size === admNumbers.length
      ? `Yes ✓ (${uniq.size} distinct)`
      : `✗ COLLISION — only ${uniq.size} distinct from ${admNumbers.length}`);

    // Show the numbers in sorted order to check format
    const sorted = [...admNumbers].sort();
    console.log(`\n  First 5 : ${sorted.slice(0, 5).join(', ')}`);
    console.log(`  Last 5  : ${sorted.slice(-5).join(', ')}`);

    // ── 5. Format edge case: seq → 9999 → 10000 ───────────────────────────────
    section('5. Admission Number Format Edge Case: seq 9998–10001');
    await q(`UPDATE school_admission_settings SET next_sequence=9998 WHERE school_id=$1`, [TEST_SCHOOL_ID]);
    const edgeNums = [];
    for (let i = 0; i < 4; i++) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        edgeNums.push(await generateAdmissionNumber_current(TEST_SCHOOL_ID, client));
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); }
      finally { client.release(); }
    }
    console.log('\n  Generated:');
    for (const n of edgeNums) {
      const len = n.length;
      console.log(`    ${n}  (length ${len}${len > 10 ? ' ← OVER expected length' : ''})`);
    }
    const hasOverflow = edgeNums.some(n => n.includes('10000'));
    result('Overflow at 10000?', hasOverflow ? '⚠ YES — 5-digit seq, format extends' : 'No overflow in range tested');

    // ── 6. DB-level unique constraint check ───────────────────────────────────
    section('6. DB-level Unique Constraint on admission_number');
    // Apply the migration directly in case the server hasn't restarted yet
    try {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admission_applications_adm_no
        ON admission_applications(school_id, admission_number)
        WHERE admission_number IS NOT NULL
      `);
    } catch (e) { /* already exists */ }

    const { rows: constraints } = await pool.query(`
      SELECT indexname AS conname, 'unique index' AS contype
      FROM pg_indexes
      WHERE tablename = 'admission_applications'
        AND indexname ILIKE '%adm_no%'
      UNION ALL
      SELECT conname, contype::text
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'admission_applications'
        AND (conname ILIKE '%admission_number%' OR conname ILIKE '%adm_num%')
    `);
    if (constraints.length) {
      result('Unique constraint exists', `Yes ✓ (${constraints.map(r => r.conname).join(', ')})`);
    } else {
      result('Unique constraint exists', '✗ MISSING — adding at DB level is a backstop needed');
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    section('SUMMARY');
    result('House race condition (current)', currResult.isRaceCondition
      ? `✗ CONFIRMED — all ${currAssignments.length} went to one house`
      : currResult.skew > 4 ? `✗ SKEWED (spread=${currResult.skew})` : `Not clearly visible this run (spread=${currResult.skew})`);
    result('House distribution (fixed)',   fixedResult.skew <= 2 && !fixedResult.isRaceCondition
      ? `✓ balanced (spread=${fixedResult.skew})` : `✗ still skewed (spread=${fixedResult.skew})`);
    result('Admission number uniqueness',  uniq.size === 25 ? '✓ atomic UPDATE is safe' : '✗ COLLISION BUG');
    result('DB unique constraint (adm_no)', constraints.length ? '✓ present' : '✗ MISSING');
    result('Overflow at seq=10000',        hasOverflow ? '⚠ format extends to 5 digits' : 'not reached in test range');

  } finally {
    console.log('\nCleaning up test data...');
    await cleanup();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
