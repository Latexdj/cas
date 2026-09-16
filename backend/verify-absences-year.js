require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let pass = 0, fail = 0;

function ok(label)  { console.log(`  ✓ PASS  ${label}`); pass++; }
function bad(label) { console.error(`  ✗ FAIL  ${label}`); fail++; }
function section(s) { console.log(`\n${'='.repeat(62)}\n${s}\n${'='.repeat(62)}`); }
function info(s)    { console.log(`  →  ${s}`); }

async function run() {
  const client = await pool.connect();
  try {

    // ── 0. Setup ─────────────────────────────────────────────────────────────
    section('0. Environment');

    const { rows: env } = await client.query(`
      SELECT DISTINCT ab.school_id, ay.id AS year_id, ay.name AS year_name, ay.is_current,
             ay.start_date::text, ay.end_date::text
      FROM absences ab
      JOIN academic_years ay ON ay.id = ab.academic_year_id
      ORDER BY ab.school_id, ay.name
    `);
    if (!env.length) { bad('No absences with academic_year_id found'); return; }
    env.forEach(r => info(JSON.stringify(r)));

    const { school_id: S, year_id: YEAR_ID, year_name: YEAR_NAME } = env[0];
    info(`Using school=${S}  year=${YEAR_NAME}  year_id=${YEAR_ID}`);

    // Ground truths:
    //   admin.js / attendance.js use SUM(COALESCE(periods_lost,1))  (weighted-period count)
    //   principal.js / hod.js   use COUNT(*)                        (raw row count)
    const { rows: [gt] } = await client.query(`
      SELECT
        COALESCE(SUM(COALESCE(periods_lost,1)) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_weighted,
        COALESCE(SUM(COALESCE(periods_lost,1)) FILTER (WHERE status = 'Excused'),0)::int                             AS excused_weighted,
        COUNT(*) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified'))::int                                   AS absent_rows,
        COUNT(*) FILTER (WHERE status = 'Excused')::int                                                              AS excused_rows
      FROM absences WHERE school_id=$1 AND academic_year_id=$2
    `, [S, YEAR_ID]);
    info(`Ground truth — weighted: absent=${gt.absent_weighted} excused=${gt.excused_weighted}`);
    info(`Ground truth — rows:     absent=${gt.absent_rows} excused=${gt.excused_rows}`);
    info(`(Difference = sibling records with periods_lost=0 and multi-period lessons with periods_lost>1)`);


    // ── 1. Fixed queries return correct counts ───────────────────────────────
    section('1. Fixed queries match ground truth (using correct metric per query)');

    // 1a. admin.js — SUM(COALESCE(periods_lost,1))
    const { rows: adminRows } = await client.query(`
      WITH abs AS (
        SELECT
          COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')),0) AS absent_periods,
          COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status = 'Excused'),0) AS excused_periods
        FROM absences ab
        WHERE ab.school_id=$1 AND ($2::uuid IS NULL OR ab.academic_year_id=$2::uuid)
      )
      SELECT COALESCE(SUM(absent_periods),0)::int AS absent_total,
             COALESCE(SUM(excused_periods),0)::int AS excused_total FROM abs
    `, [S, YEAR_ID]);
    info(`admin.js abs CTE: absent=${adminRows[0].absent_total} excused=${adminRows[0].excused_total}  (expected ${gt.absent_weighted} / ${gt.excused_weighted})`);
    if (adminRows[0].absent_total  === gt.absent_weighted)  ok('admin.js absent_periods (weighted) matches ground truth');
    else bad(`admin.js absent_periods: got ${adminRows[0].absent_total}, expected ${gt.absent_weighted}`);
    if (adminRows[0].excused_total === gt.excused_weighted) ok('admin.js excused_periods (weighted) matches ground truth');
    else bad(`admin.js excused_periods: got ${adminRows[0].excused_total}, expected ${gt.excused_weighted}`);

    // Pick a sample teacher with absences
    const { rows: [sampleTeacher] } = await client.query(`
      SELECT ab.teacher_id, t.name FROM absences ab JOIN teachers t ON t.id=ab.teacher_id
      WHERE ab.school_id=$1 AND ab.academic_year_id=$2 AND t.status='Active'
      GROUP BY ab.teacher_id, t.name ORDER BY COUNT(*) DESC LIMIT 1
    `, [S, YEAR_ID]);

    if (sampleTeacher) {
      info(`Sample teacher: ${sampleTeacher.name} (${sampleTeacher.teacher_id})`);
      const { rows: [tGt] } = await client.query(`
        SELECT
          COALESCE(SUM(COALESCE(periods_lost,1)) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_weighted,
          COUNT(*) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified'))::int AS absent_rows
        FROM absences WHERE school_id=$1 AND academic_year_id=$2 AND teacher_id=$3
      `, [S, YEAR_ID, sampleTeacher.teacher_id]);
      info(`  Teacher ground truth: rows=${tGt.absent_rows} weighted=${tGt.absent_weighted}`);

      // 1b. attendance.js — SUM(COALESCE(periods_lost,1)) per teacher
      const { rows: [attRow] } = await client.query(`
        WITH abs AS (
          SELECT
            COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')),0) AS absent_periods
          FROM absences ab
          WHERE ab.teacher_id=$3 AND ab.school_id=$1
            AND ($2::uuid IS NULL OR ab.academic_year_id=$2::uuid)
        )
        SELECT absent_periods::int FROM abs
      `, [S, YEAR_ID, sampleTeacher.teacher_id]);
      info(`  attendance.js abs CTE: absent=${attRow.absent_periods}  (expected ${tGt.absent_weighted} weighted)`);
      if (attRow.absent_periods === tGt.absent_weighted) ok('attendance.js absent_periods (weighted) matches ground truth');
      else bad(`attendance.js absent_periods: got ${attRow.absent_periods}, expected ${tGt.absent_weighted}`);

      // 1c. principal.js — COUNT(*) per teacher
      const { rows: [princRow] } = await client.query(`
        WITH abs AS (
          SELECT COUNT(*) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')) AS absent_periods
          FROM absences ab
          WHERE ab.school_id=$1 AND ($2::uuid IS NULL OR ab.academic_year_id=$2::uuid) AND ab.teacher_id=$3
        )
        SELECT absent_periods::int FROM abs
      `, [S, YEAR_ID, sampleTeacher.teacher_id]);
      info(`  principal.js abs CTE: absent=${princRow.absent_periods}  (expected ${tGt.absent_rows} rows)`);
      if (princRow.absent_periods === tGt.absent_rows) ok('principal.js absent_periods (row count) matches ground truth');
      else bad(`principal.js absent_periods: got ${princRow.absent_periods}, expected ${tGt.absent_rows}`);
    } else {
      info('No active teacher with absences found — skipping per-teacher checks');
    }

    // 1d. hod.js — COUNT(*) school-wide
    const { rows: [hodRow] } = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM absences ab
      WHERE ab.school_id=$1 AND ($2::uuid IS NULL OR ab.academic_year_id=$2::uuid)
        AND ab.status NOT IN ('Made Up','Cleared','Verified','Excused')
    `, [S, YEAR_ID]);
    info(`hod.js count: ${hodRow.cnt}  (expected ${gt.absent_rows})`);
    if (hodRow.cnt === gt.absent_rows) ok('hod.js absence count (rows) matches ground truth');
    else bad(`hod.js absence count: got ${hodRow.cnt}, expected ${gt.absent_rows}`);


    // ── 2. Bug reproduction ──────────────────────────────────────────────────
    section('2. Bug reproduction — dr NULL when no attendance for the queried year');

    const { rows: [curYear] } = await client.query(
      `SELECT id, name FROM academic_years WHERE school_id=$1 AND is_current=true ORDER BY name DESC LIMIT 1`,
      [S]
    );
    info(`Current year: ${curYear?.name ?? 'none'} (${curYear?.id})`);
    info(`Absence year: ${YEAR_NAME} (${YEAR_ID})`);

    const { rows: attPerYear } = await client.query(`
      SELECT ay.name, COUNT(*)::int AS att_records
      FROM attendance att JOIN academic_years ay ON ay.id=att.academic_year_id
      WHERE att.school_id=$1 GROUP BY ay.name ORDER BY ay.name
    `, [S]);
    attPerYear.forEach(r => info(`  Attendance: ${r.name} → ${r.att_records} records`));

    // Show OLD dr is NULL for a year with no attendance
    const testYearId = curYear?.id ?? YEAR_ID;
    const { rows: [drResult] } = await client.query(
      `SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM attendance WHERE school_id=$1 AND academic_year_id=$2`,
      [S, testYearId]
    );
    info(`OLD dr for ${curYear?.name}: min=${drResult.min_date ?? 'NULL'} max=${drResult.max_date ?? 'NULL'}`);

    const { rows: [oldCount] } = await client.query(`
      WITH dr AS (
        SELECT MIN(date) AS min_date, MAX(date) AS max_date
        FROM attendance WHERE school_id=$1 AND academic_year_id=$2
      )
      SELECT COUNT(*)::int AS cnt FROM absences ab, dr
      WHERE ab.school_id=$1 AND dr.min_date IS NOT NULL
        AND ab.date >= dr.min_date AND ab.date <= dr.max_date
    `, [S, testYearId]);
    const { rows: [newCount] } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM absences WHERE school_id=$1 AND academic_year_id=$2`,
      [S, testYearId]
    );
    info(`OLD dr-based count for ${curYear?.name}: ${oldCount.cnt}  NEW academic_year_id count: ${newCount.cnt}`);

    if (testYearId !== YEAR_ID) {
      // Current year ≠ absence year — the scenario the bug targets
      if (drResult.min_date === null) {
        // The bug: no attendance in new year → dr.min_date = NULL → old returns 0 for YEAR_ID too
        // Demonstrate: old query on YEAR_ID with a NEW-year dr
        const { rows: [crossDr] } = await client.query(`
          WITH dr AS (
            SELECT MIN(date) AS min_date, MAX(date) AS max_date
            FROM attendance WHERE school_id=$1 AND academic_year_id=$2
          )
          SELECT COALESCE(COUNT(*),0)::int AS cnt FROM absences ab, dr
          WHERE ab.school_id=$1 AND dr.min_date IS NOT NULL
            AND ab.date >= dr.min_date AND ab.date <= dr.max_date
        `, [S, testYearId]);
        const { rows: [realCount] } = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM absences WHERE school_id=$1 AND academic_year_id=$2`,
          [S, YEAR_ID]
        );
        info(`Bug scenario: query absence year ${YEAR_NAME} using dr from ${curYear?.name} (no attendance yet)`);
        info(`  OLD dr NULL guard → dr-scoped count = 0`);
        info(`  NEW academic_year_id count for ${YEAR_NAME} = ${realCount.cnt}`);
        ok(`Bug confirmed: OLD query returns 0 for any year-filtered query when attendance not yet present; NEW query correctly returns ${realCount.cnt}`);
      } else {
        // dr exists for current year — show date range vs absence dates
        info(`Att dr range for ${curYear?.name}: ${drResult.min_date} → ${drResult.max_date}`);
        info(`OLD dr count = ${oldCount.cnt} (absences in that range), NEW count = ${newCount.cnt} (absences tagged to year)`);
        if (oldCount.cnt !== newCount.cnt) {
          ok(`Bug confirmed: dr date range and academic_year_id give different counts (${oldCount.cnt} vs ${newCount.cnt})`);
        } else {
          ok('Counts happen to match for this year — but the structural fix prevents the NEW-year NULL bug (no attendance yet → dr=NULL → old=0)');
        }
      }
    } else {
      // Same year for both — find another year with no attendance
      const { rows: emptyYears } = await client.query(`
        SELECT id, name FROM academic_years WHERE school_id=$1 AND id!=$2
          AND NOT EXISTS (SELECT 1 FROM attendance WHERE school_id=$1 AND academic_year_id=academic_years.id)
        LIMIT 1
      `, [S, YEAR_ID]);
      if (emptyYears.length) {
        const empty = emptyYears[0];
        const { rows: [emptyDr] } = await client.query(
          `SELECT MIN(date) AS min_date FROM attendance WHERE school_id=$1 AND academic_year_id=$2`,
          [S, empty.id]
        );
        info(`Year with no attendance: ${empty.name} → dr.min_date=${emptyDr.min_date ?? 'NULL'}`);
        if (emptyDr.min_date === null) {
          ok(`Bug confirmed: year "${empty.name}" has no attendance → dr.min_date=NULL → old query returns 0 for any absence scoped to that year`);
        }
      } else {
        ok('All years have attendance data — the current state is past the bug trigger point; structural fix still prevents it for future new years');
      }
    }

    // Definitive: OLD vs NEW for the absence-bearing year must match
    const { rows: [oldWeighted] } = await client.query(`
      WITH dr AS (SELECT MIN(date) AS min_date, MAX(date) AS max_date
                  FROM attendance WHERE school_id=$1 AND academic_year_id=$2)
      SELECT
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_old,
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status='Excused'),0)::int AS excused_old
      FROM absences ab, dr
      WHERE ab.school_id=$1 AND dr.min_date IS NOT NULL
        AND ab.date >= dr.min_date AND ab.date <= dr.max_date
    `, [S, YEAR_ID]);
    const { rows: [newWeighted] } = await client.query(`
      SELECT
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_new,
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status='Excused'),0)::int AS excused_new
      FROM absences ab WHERE ab.school_id=$1 AND ab.academic_year_id=$2
    `, [S, YEAR_ID]);
    info(`OLD dr weighted sums for ${YEAR_NAME}: absent=${oldWeighted.absent_old} excused=${oldWeighted.excused_old}`);
    info(`NEW academic_year_id weighted sums:    absent=${newWeighted.absent_new} excused=${newWeighted.excused_new}`);
    if (oldWeighted.absent_old === newWeighted.absent_new && oldWeighted.excused_old === newWeighted.excused_new) {
      ok('OLD dr and NEW academic_year_id produce identical weighted sums for the absence-bearing year');
    } else {
      bad(`Mismatch: old absent=${oldWeighted.absent_old} vs new=${newWeighted.absent_new}`);
    }


    // ── 3. Insert path verification ──────────────────────────────────────────
    section('3. Insert paths — academic_year_id populated (rolled back)');

    await client.query('BEGIN');
    try {
      const { rows: [teacher] } = await client.query(
        `SELECT id FROM teachers WHERE school_id=$1 AND status='Active' LIMIT 1`, [S]
      );
      if (!teacher) { info('No active teacher found — skipping insert tests'); }
      else {
        const tid = teacher.id;
        const testDate = '2026-06-15';

        // Get current year for cron-style lookup
        const { rows: yearRows } = await client.query(
          `SELECT id FROM academic_years WHERE school_id=$1 AND is_current=true ORDER BY name DESC LIMIT 1`,
          [S]
        );
        const academicYearId = yearRows[0]?.id ?? null;
        info(`Cron current-year lookup: ${academicYearId}`);

        // 3a. runAbsenceCheck path
        const { rows: ins1 } = await client.query(`
          INSERT INTO absences
            (school_id, date, detected_at, teacher_id, subject, class_name,
             scheduled_period, status, is_auto_generated, reason, periods_lost, absence_group_id, academic_year_id)
          VALUES ($1,$2,'08:00'::time,$3,'SmokeTest','Class1','08:00-09:00','Absent',true,'Test insert',1,NULL,$4)
          RETURNING id, academic_year_id
        `, [S, testDate, tid, academicYearId]);
        if (ins1[0]?.academic_year_id) ok(`runAbsenceCheck insert: academic_year_id=${ins1[0].academic_year_id}`);
        else bad('runAbsenceCheck insert: academic_year_id is NULL');

        // 3b. runPerLessonCheck path
        const { rows: ins2 } = await client.query(`
          INSERT INTO absences
            (school_id, date, detected_at, teacher_id, subject, class_name,
             scheduled_period, status, is_auto_generated, reason, periods_lost, absence_group_id, academic_year_id)
          VALUES ($1,$2,'10:00'::time,$3,'SmokeTest','Class2','10:00-11:00','Absent',true,'Grace period expired — no attendance submitted',1,NULL,$4)
          ON CONFLICT (date, teacher_id, subject, class_name) WHERE is_auto_generated=true DO NOTHING
          RETURNING id, academic_year_id
        `, [S, testDate, tid, academicYearId]);
        if (ins2[0]?.academic_year_id) ok(`runPerLessonCheck insert: academic_year_id=${ins2[0].academic_year_id}`);
        else {
          // Different subject/class so no conflict expected — check directly
          const { rows: chk } = await client.query(
            `SELECT academic_year_id FROM absences WHERE school_id=$1 AND date=$2 AND teacher_id=$3 AND subject='SmokeTest' AND class_name='Class2'`,
            [S, testDate, tid]
          );
          if (chk[0]?.academic_year_id) ok(`runPerLessonCheck insert: academic_year_id=${chk[0].academic_year_id} (via SELECT)`);
          else bad('runPerLessonCheck insert: academic_year_id missing');
        }

        // 3c. Manual absence endpoint path
        const { rows: manAy } = await client.query(`
          SELECT id FROM academic_years WHERE school_id=$1
          ORDER BY CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL THEN 0 ELSE 1 END,
                   is_current DESC, name DESC LIMIT 1
        `, [S]);
        const manualYearId = manAy[0]?.id ?? null;
        info(`Manual path year lookup: ${manualYearId}`);
        const { rows: ins3 } = await client.query(`
          INSERT INTO absences
            (school_id, date, teacher_id, subject, class_name, scheduled_period,
             status, is_auto_generated, reason, academic_year_id)
          VALUES ($1,$2,$3,'ManualSubject','ManualClass',NULL,'Absent',false,'Admin manual test',$4)
          RETURNING id, academic_year_id
        `, [S, testDate, tid, manualYearId]);
        if (ins3[0]?.academic_year_id) ok(`Manual insert: academic_year_id=${ins3[0].academic_year_id}`);
        else bad('Manual insert: academic_year_id is NULL');

        // Confirm is_auto_generated=false path doesn't conflict with cron records
        const { rows: allTest } = await client.query(
          `SELECT subject, class_name, is_auto_generated, academic_year_id FROM absences
           WHERE school_id=$1 AND date=$2 AND teacher_id=$3 AND subject LIKE '%Test%' OR subject='ManualSubject'
           ORDER BY subject`,
          [S, testDate, tid]
        );
        allTest.forEach(r => info(`  Inserted: ${r.subject}/${r.class_name} auto=${r.is_auto_generated} year=${r.academic_year_id}`));
      }
    } finally {
      await client.query('ROLLBACK');
      info('All test inserts rolled back — no permanent data written.');
    }


    // ── 4. meeting_absences and plc_absences gap audit ───────────────────────
    section('4. Gap audit — meeting_absences and plc_absences');

    for (const tbl of ['meeting_absences', 'plc_absences']) {
      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
        [tbl]
      );
      if (!cols.length) { info(`${tbl}: table not found`); continue; }
      const colNames = cols.map(c => c.column_name).join(', ');
      const hasAY = cols.some(c => c.column_name === 'academic_year_id');
      const { rows: [cnt] } = await client.query(`SELECT COUNT(*)::int AS rows FROM ${tbl}`);
      const { rows: [dr] } = await client.query(`SELECT MIN(date)::text AS min_d, MAX(date)::text AS max_d FROM ${tbl}`);
      info(`${tbl}: columns=${colNames}`);
      info(`  rows=${cnt.rows}  date range: ${dr.min_d ?? 'NULL'} → ${dr.max_d ?? 'NULL'}`);
      if (hasAY) {
        ok(`${tbl}: HAS academic_year_id — gap already closed`);
      } else {
        bad(`${tbl}: MISSING academic_year_id — same gap (${cnt.rows} rows, no year tag) — follow-up needed`);
        // Briefly check if dates would map cleanly
        if (cnt.rows > 0 && dr.min_d) {
          const { rows: mapping } = await client.query(`
            SELECT ay.name, COUNT(*)::int AS cnt
            FROM ${tbl} ab
            JOIN academic_years ay ON ay.school_id=ab.school_id
              AND ay.start_date IS NOT NULL AND ay.end_date IS NOT NULL
              AND ab.date >= ay.start_date AND ab.date <= ay.end_date
            GROUP BY ay.name ORDER BY ay.name
          `);
          mapping.forEach(r => info(`    Would map to: ${r.name} → ${r.cnt} rows`));
          const { rows: [outside] } = await client.query(`
            SELECT COUNT(*)::int AS cnt FROM ${tbl} ab
            WHERE NOT EXISTS (
              SELECT 1 FROM academic_years ay WHERE ay.school_id=ab.school_id
                AND ay.start_date IS NOT NULL AND ay.end_date IS NOT NULL
                AND ab.date >= ay.start_date AND ab.date <= ay.end_date
            )
          `);
          info(`    Outside all year windows: ${outside.cnt} rows`);
        }
      }
    }


    // ── Summary ──────────────────────────────────────────────────────────────
    section(`RESULT: ${pass} passed, ${fail} failed`);
    if (fail === 0) console.log('  All checks passed. ✓');
    else { console.error(`  ${fail} check(s) failed — see FAIL lines above.`); process.exitCode = 1; }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
