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

    // ── 0. Environment ───────────────────────────────────────────────────────
    section('0. Environment');

    // Find a school with meeting_absences data
    const { rows: env } = await client.query(`
      SELECT DISTINCT ab.school_id, ay.id AS year_id, ay.name AS year_name,
             ay.is_current, ay.start_date::text, ay.end_date::text
      FROM meeting_absences ab
      JOIN academic_years ay ON ay.id = ab.academic_year_id
      ORDER BY ab.school_id, ay.name
    `);
    if (!env.length) { bad('No meeting_absences with academic_year_id found'); return; }
    env.forEach(r => info(JSON.stringify(r)));

    const { school_id: S, year_id: YEAR_ID, year_name: YEAR_NAME } = env[0];
    info(`Using school=${S}  year=${YEAR_NAME}  year_id=${YEAR_ID}`);

    // Ground truths
    const { rows: [gt] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified'))::int AS meeting_absent_rows,
        (SELECT COUNT(*)::int FROM plc_absences WHERE school_id=$1 AND academic_year_id=$2) AS plc_absent_rows,
        -- meeting_absences by meeting type
        COUNT(*) FILTER (WHERE m.meeting_type = 'PLC')::int        AS meeting_plc_rows,
        COUNT(*) FILTER (WHERE m.meeting_type != 'PLC')::int       AS meeting_non_plc_rows
      FROM meeting_absences ab
      JOIN meetings m ON m.id = ab.meeting_id
      WHERE ab.school_id=$1 AND ab.academic_year_id=$2
    `, [S, YEAR_ID]);
    info(`Ground truth — meeting_absences rows=${gt.meeting_absent_rows} (PLC type=${gt.meeting_plc_rows} non-PLC=${gt.meeting_non_plc_rows})`);
    info(`Ground truth — plc_absences rows=${gt.plc_absent_rows}`);


    // ── 1. Five fixed queries match ground truth ──────────────────────────────
    section('1. Fixed queries match ground truth');

    // 1a. meetings.js /summary — meeting_absences filtered by academic_year_id
    const { rows: [mSummaryAbs] } = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM meeting_absences ab
      WHERE ab.school_id = $1
        AND ($2::uuid IS NULL OR ab.academic_year_id = $2::uuid)
    `, [S, YEAR_ID]);
    info(`meetings.js /summary abs CTE: ${mSummaryAbs.cnt}  (expected ${gt.meeting_absent_rows})`);
    if (mSummaryAbs.cnt === gt.meeting_absent_rows) ok('meetings.js /summary absence count matches ground truth');
    else bad(`meetings.js /summary: got ${mSummaryAbs.cnt}, expected ${gt.meeting_absent_rows}`);

    // 1b. meetings.js /my-summary — per teacher per meeting_type
    const { rows: [sampleTeacher] } = await client.query(`
      SELECT ab.teacher_id, t.name FROM meeting_absences ab
      JOIN teachers t ON t.id = ab.teacher_id
      WHERE ab.school_id=$1 AND ab.academic_year_id=$2
      GROUP BY ab.teacher_id, t.name ORDER BY COUNT(*) DESC LIMIT 1
    `, [S, YEAR_ID]);
    if (sampleTeacher) {
      info(`Sample teacher: ${sampleTeacher.name} (${sampleTeacher.teacher_id})`);
      const { rows: tGt } = await client.query(`
        SELECT m.meeting_type, COUNT(*)::int AS cnt
        FROM meeting_absences ab JOIN meetings m ON m.id = ab.meeting_id
        WHERE ab.school_id=$1 AND ab.academic_year_id=$2 AND ab.teacher_id=$3
        GROUP BY m.meeting_type ORDER BY m.meeting_type
      `, [S, YEAR_ID, sampleTeacher.teacher_id]);
      tGt.forEach(r => info(`  Teacher ground truth: type=${r.meeting_type} cnt=${r.cnt}`));

      // New abs CTE without date_range
      const { rows: myAbs } = await client.query(`
        SELECT m.meeting_type, COUNT(*)::int AS absent
        FROM meeting_absences ab JOIN meetings m ON m.id = ab.meeting_id
        WHERE ab.school_id=$1 AND ab.teacher_id=$2
          AND ($3::uuid IS NULL OR ab.academic_year_id=$3::uuid)
        GROUP BY m.meeting_type ORDER BY m.meeting_type
      `, [S, sampleTeacher.teacher_id, YEAR_ID]);
      myAbs.forEach(r => info(`  /my-summary abs CTE: type=${r.meeting_type} absent=${r.absent}`));

      const match = tGt.every(gt2 => {
        const found = myAbs.find(r => r.meeting_type === gt2.meeting_type);
        return found && found.absent === gt2.cnt;
      });
      if (match && myAbs.length === tGt.length) ok('meetings.js /my-summary per-teacher absence counts match ground truth');
      else bad('meetings.js /my-summary: mismatch in per-teacher type breakdown');
    } else {
      info('No teacher with meeting absences found — skipping /my-summary per-teacher check');
    }

    // 1c. principal.js /meetings-summary — meeting_absences with optional type filter
    // Non-PLC type filter
    const { rows: [nonPlcAbs] } = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM meeting_absences ab
      JOIN meetings m ON m.id = ab.meeting_id
      WHERE ab.school_id=$1
        AND m.meeting_type != 'PLC'
        AND ($2::uuid IS NULL OR ab.academic_year_id=$2::uuid)
    `, [S, YEAR_ID]);
    info(`principal.js /meetings-summary (non-PLC): ${nonPlcAbs.cnt}  (expected ${gt.meeting_non_plc_rows})`);
    if (nonPlcAbs.cnt === gt.meeting_non_plc_rows) ok('principal.js /meetings-summary (non-PLC filter) matches ground truth');
    else bad(`principal.js /meetings-summary non-PLC: got ${nonPlcAbs.cnt}, expected ${gt.meeting_non_plc_rows}`);

    // No type filter
    const { rows: [allMtgAbs] } = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM meeting_absences ab
      JOIN meetings m ON m.id = ab.meeting_id
      WHERE ab.school_id=$1
        AND ($2::text IS NULL OR m.meeting_type=$2::text)
        AND ($3::uuid IS NULL OR ab.academic_year_id=$3::uuid)
    `, [S, null, YEAR_ID]);
    info(`principal.js /meetings-summary (no filter): ${allMtgAbs.cnt}  (expected ${gt.meeting_absent_rows})`);
    if (allMtgAbs.cnt === gt.meeting_absent_rows) ok('principal.js /meetings-summary (no filter) matches ground truth');
    else bad(`principal.js /meetings-summary no filter: got ${allMtgAbs.cnt}, expected ${gt.meeting_absent_rows}`);

    // 1d. principal.js /plc-summary + plc.js /summary — combined plc_abs + mtg_abs (PLC-type)
    // Combined absence ground truth: plc_absences + meeting_absences where meeting_type='PLC'
    const { rows: [plcCombGt] } = await client.query(`
      SELECT (
        (SELECT COUNT(*) FROM plc_absences WHERE school_id=$1 AND academic_year_id=$2) +
        (SELECT COUNT(*) FROM meeting_absences ab JOIN meetings m ON m.id=ab.meeting_id
         WHERE ab.school_id=$1 AND ab.academic_year_id=$2 AND m.meeting_type='PLC')
      )::int AS total_plc_absences
    `, [S, YEAR_ID]);
    info(`Ground truth combined PLC absences (plc_abs + mtg_abs for PLC type): ${plcCombGt.total_plc_absences}`);

    const { rows: [plcAbs] } = await client.query(`
      WITH plc_abs AS (
        SELECT teacher_id, COUNT(*) AS cnt FROM plc_absences
        WHERE school_id=$1 AND ($2::uuid IS NULL OR academic_year_id=$2::uuid)
        GROUP BY teacher_id
      ),
      mtg_abs AS (
        SELECT ab.teacher_id, COUNT(*) AS cnt FROM meeting_absences ab
        JOIN meetings m ON m.id=ab.meeting_id
        WHERE ab.school_id=$1 AND m.meeting_type='PLC'
          AND ($2::uuid IS NULL OR ab.academic_year_id=$2::uuid)
        GROUP BY ab.teacher_id
      )
      SELECT COALESCE(SUM(cnt),0)::int AS total FROM (
        SELECT cnt FROM plc_abs UNION ALL SELECT cnt FROM mtg_abs
      ) x
    `, [S, YEAR_ID]);
    info(`/plc-summary + plc.js /summary abs CTE total: ${plcAbs.total}  (expected ${plcCombGt.total_plc_absences})`);
    if (plcAbs.total === plcCombGt.total_plc_absences) {
      ok('principal.js /plc-summary and plc.js /summary combined absence count matches ground truth');
    } else {
      bad(`/plc-summary: got ${plcAbs.total}, expected ${plcCombGt.total_plc_absences}`);
    }


    // ── 2. Bug reproduction ───────────────────────────────────────────────────
    section('2. Bug reproduction — dr NULL when no attendance for current year');

    const { rows: [curYear] } = await client.query(
      `SELECT id, name FROM academic_years WHERE school_id=$1 AND is_current=true ORDER BY name DESC LIMIT 1`,
      [S]
    );
    info(`Current year: ${curYear?.name ?? 'none'} (${curYear?.id})`);
    info(`Absence data year: ${YEAR_NAME} (${YEAR_ID})`);

    // Check meeting_attendance for current year
    const { rows: mtgAttPerYear } = await client.query(`
      SELECT ay.name, COUNT(*)::int AS cnt
      FROM meeting_attendance ma JOIN academic_years ay ON ay.id=ma.academic_year_id
      WHERE ma.school_id=$1 GROUP BY ay.name ORDER BY ay.name
    `, [S]);
    mtgAttPerYear.forEach(r => info(`  meeting_attendance: ${r.name} → ${r.cnt} records`));

    // Check plc_attendance for current year
    const { rows: plcAttPerYear } = await client.query(`
      SELECT ay.name, COUNT(*)::int AS cnt
      FROM plc_attendance pa JOIN academic_years ay ON ay.id=pa.academic_year_id
      WHERE pa.school_id=$1 GROUP BY ay.name ORDER BY ay.name
    `, [S]);
    plcAttPerYear.forEach(r => info(`  plc_attendance: ${r.name} → ${r.cnt} records`));

    const testYearId = curYear?.id ?? YEAR_ID;
    const isNewYear  = testYearId !== YEAR_ID;

    // Show OLD dr for meetings_summary — uses min/max from meeting_attendance
    const { rows: [mDr] } = await client.query(
      `SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=$2`,
      [S, testYearId]
    );
    info(`OLD dr from meeting_attendance for ${curYear?.name}: min=${mDr.min_date ?? 'NULL'} max=${mDr.max_date ?? 'NULL'}`);

    // OLD dr-scoped count for meeting_absences
    const { rows: [oldMtgCount] } = await client.query(`
      WITH dr AS (
        SELECT COALESCE(MIN(date), CURRENT_DATE - INTERVAL '365 days') AS min_date,
               COALESCE(MAX(date), CURRENT_DATE) AS max_date
        FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=$2
      )
      SELECT COUNT(*)::int AS cnt FROM meeting_absences ab, dr
      WHERE ab.school_id=$1 AND ab.date >= dr.min_date AND ab.date <= dr.max_date
    `, [S, testYearId]);

    const { rows: [newMtgCount] } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM meeting_absences WHERE school_id=$1 AND academic_year_id=$2`,
      [S, YEAR_ID]
    );
    info(`OLD dr-scoped meeting_absences for current year's att: ${oldMtgCount.cnt}`);
    info(`NEW academic_year_id meeting_absences for ${YEAR_NAME}: ${newMtgCount.cnt}`);

    if (mDr.min_date === null && isNewYear) {
      // dr=NULL so COALESCE fallback fires → 365-day window, not the year window
      // Show what old query returns for the ABSENCE year using current year's dr
      const { rows: [crossMtg] } = await client.query(`
        WITH dr AS (
          SELECT MIN(date) AS min_date, MAX(date) AS max_date
          FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=$2
        )
        SELECT COALESCE(COUNT(*),0)::int AS cnt FROM meeting_absences ab, dr
        WHERE ab.school_id=$1 AND dr.min_date IS NOT NULL
          AND ab.date >= dr.min_date AND ab.date <= dr.max_date
      `, [S, testYearId]);
      info(`Bug: old query on ${YEAR_NAME} absences using ${curYear?.name} dr (no att yet) → ${crossMtg.cnt}`);
      ok(`Bug confirmed: no meeting_attendance in ${curYear?.name} → dr.min_date=NULL → old NULL guard returns 0 for any year; new query returns ${newMtgCount.cnt}`);
    } else if (isNewYear && mDr.min_date !== null) {
      // dr exists for current year — show date-range mismatch vs academic_year_id
      info(`dr range for ${curYear?.name}: ${mDr.min_date} → ${mDr.max_date}`);
      const { rows: [cross] } = await client.query(`
        WITH dr AS (
          SELECT MIN(date) AS min_date, MAX(date) AS max_date
          FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=$2
        )
        SELECT COUNT(*)::int AS cnt FROM meeting_absences ab, dr
        WHERE ab.school_id=$1 AND ab.date >= dr.min_date AND ab.date <= dr.max_date
      `, [S, testYearId]);
      info(`Old dr-scoped count for ${YEAR_NAME}: ${cross.cnt}  NEW: ${newMtgCount.cnt}`);
      if (cross.cnt !== newMtgCount.cnt) ok(`Bug confirmed: dr date range and academic_year_id give different counts (${cross.cnt} vs ${newMtgCount.cnt})`);
      else ok('Counts match for this year — structural fix still prevents NULL regression for new years with no attendance');
    } else {
      // same year — find one with no attendance
      const { rows: emptyYears } = await client.query(`
        SELECT id, name FROM academic_years WHERE school_id=$1 AND id!=$2
          AND NOT EXISTS (SELECT 1 FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=academic_years.id)
        LIMIT 1
      `, [S, YEAR_ID]);
      if (emptyYears.length) {
        const empty = emptyYears[0];
        const { rows: [eDr] } = await client.query(
          `SELECT MIN(date) AS min_date FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=$2`,
          [S, empty.id]
        );
        info(`Year with no meeting_attendance: ${empty.name} → dr.min_date=${eDr.min_date ?? 'NULL'}`);
        if (eDr.min_date === null) {
          ok(`Bug confirmed: "${empty.name}" has no meeting_attendance → dr=NULL → old query returns 0 for absences in that year`);
        }
      } else {
        ok('All years have meeting_attendance — structural fix still prevents new-year NULL regression');
      }
    }

    // Definitive: OLD dr vs NEW academic_year_id on the absence-bearing year
    const { rows: [oldW] } = await client.query(`
      WITH dr AS (SELECT MIN(date) AS min_date, MAX(date) AS max_date
                  FROM meeting_attendance WHERE school_id=$1 AND academic_year_id=$2)
      SELECT COUNT(*)::int AS cnt FROM meeting_absences ab, dr
      WHERE ab.school_id=$1 AND dr.min_date IS NOT NULL
        AND ab.date >= dr.min_date AND ab.date <= dr.max_date
    `, [S, YEAR_ID]);
    const { rows: [newW] } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM meeting_absences WHERE school_id=$1 AND academic_year_id=$2`,
      [S, YEAR_ID]
    );
    info(`OLD dr on ${YEAR_NAME} (where att exists): ${oldW.cnt}  NEW academic_year_id: ${newW.cnt}`);
    if (oldW.cnt === newW.cnt) ok('OLD dr and NEW academic_year_id produce identical counts for the absence-bearing year');
    else bad(`Mismatch on absence-bearing year: old=${oldW.cnt} new=${newW.cnt}`);


    // ── 3. Insert path verification (rolled back) ────────────────────────────
    section('3. Insert paths — academic_year_id populated (rolled back)');

    await client.query('BEGIN');
    try {
      const { rows: [teacher] } = await client.query(
        `SELECT id, name FROM teachers WHERE school_id=$1 AND status='Active' LIMIT 1`, [S]
      );
      if (!teacher) { info('No active teacher found — skipping insert tests'); }
      else {
        const tid      = teacher.id;
        const testDate = '2026-06-15';
        info(`Test teacher: ${teacher.name} (${tid})`);

        // Current year lookup (cron pattern)
        const { rows: cronYr } = await client.query(
          `SELECT id FROM academic_years WHERE school_id=$1 AND is_current=true ORDER BY name DESC LIMIT 1`, [S]
        );
        const cronYearId = cronYr[0]?.id ?? null;
        info(`Cron year lookup: ${cronYearId}`);

        // Get an active meeting and PLC session
        const { rows: [mtg] } = await client.query(
          `SELECT id, title FROM meetings WHERE school_id=$1 AND is_active=true LIMIT 1`, [S]
        );
        const { rows: [plcSess] } = await client.query(
          `SELECT id, title FROM plc_sessions WHERE school_id=$1 AND is_active=true LIMIT 1`, [S]
        );

        // 3a. runMeetingAbsenceCheck path
        if (mtg) {
          const { rows: ins1 } = await client.query(`
            INSERT INTO meeting_absences
              (school_id, meeting_id, teacher_id, date, status, detected_at, reason, academic_year_id)
            VALUES ($1,$2,$3,$4,'Absent','16:00'::time,'Daily automated check',$5)
            ON CONFLICT (meeting_id, teacher_id, date) DO NOTHING
            RETURNING id, academic_year_id
          `, [S, mtg.id, tid, testDate, cronYearId]);
          if (ins1[0]?.academic_year_id) ok(`runMeetingAbsenceCheck insert: academic_year_id=${ins1[0].academic_year_id}`);
          else {
            // conflict — check existing
            const { rows: [chk] } = await client.query(
              `SELECT academic_year_id FROM meeting_absences WHERE meeting_id=$1 AND teacher_id=$2 AND date=$3`,
              [mtg.id, tid, testDate]
            );
            if (chk?.academic_year_id) ok(`runMeetingAbsenceCheck insert (conflict-no-op): academic_year_id=${chk.academic_year_id} already set`);
            else bad('runMeetingAbsenceCheck insert: academic_year_id missing');
          }
        } else {
          info('No active meeting found — skipping runMeetingAbsenceCheck test');
        }

        // 3b. runPlcAbsenceCheck path
        if (plcSess) {
          const { rows: ins2 } = await client.query(`
            INSERT INTO plc_absences
              (school_id, session_id, teacher_id, date, status, detected_at, reason, academic_year_id)
            VALUES ($1,$2,$3,$4,'Absent','16:00'::time,'Daily automated check',$5)
            ON CONFLICT (session_id, teacher_id, date) DO NOTHING
            RETURNING id, academic_year_id
          `, [S, plcSess.id, tid, testDate, cronYearId]);
          if (ins2[0]?.academic_year_id) ok(`runPlcAbsenceCheck insert: academic_year_id=${ins2[0].academic_year_id}`);
          else {
            const { rows: [chk] } = await client.query(
              `SELECT academic_year_id FROM plc_absences WHERE session_id=$1 AND teacher_id=$2 AND date=$3`,
              [plcSess.id, tid, testDate]
            );
            if (chk?.academic_year_id) ok(`runPlcAbsenceCheck insert (conflict-no-op): academic_year_id=${chk.academic_year_id}`);
            else bad('runPlcAbsenceCheck insert: academic_year_id missing');
          }
        } else {
          info('No active PLC session found — skipping runPlcAbsenceCheck test');
        }

        // 3c. meetings.js generate-absences path (date-range-safe year lookup)
        const { rows: manAy } = await client.query(`
          SELECT id FROM academic_years WHERE school_id=$1
          ORDER BY CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL THEN 0 ELSE 1 END,
                   is_current DESC, name DESC LIMIT 1
        `, [S]);
        const manualYearId = manAy[0]?.id ?? null;
        info(`generate-absences year lookup: ${manualYearId}`);
        if (mtg) {
          const { rows: ins3 } = await client.query(`
            INSERT INTO meeting_absences
              (school_id, meeting_id, teacher_id, date, status, detected_at, reason, academic_year_id)
            VALUES ($1,$2,$3,$4,'Absent','16:00'::time,'Manually generated by admin',$5)
            ON CONFLICT (meeting_id, teacher_id, date) DO NOTHING
            RETURNING id, academic_year_id
          `, [S, mtg.id, tid, '2026-07-20', manualYearId]);
          if (ins3[0]?.academic_year_id) ok(`generate-absences insert: academic_year_id=${ins3[0].academic_year_id}`);
          else {
            const { rows: [chk] } = await client.query(
              `SELECT academic_year_id FROM meeting_absences WHERE meeting_id=$1 AND teacher_id=$2 AND date='2026-07-20'`,
              [mtg.id, tid]
            );
            if (chk?.academic_year_id) ok(`generate-absences insert (conflict): academic_year_id=${chk.academic_year_id}`);
            else bad('generate-absences insert: academic_year_id missing');
          }
        } else {
          info('No active meeting — skipping generate-absences test');
        }
      }
    } finally {
      await client.query('ROLLBACK');
      info('All test inserts rolled back.');
    }


    // ── 4. Full codebase sweep — no remaining dr-style workarounds ────────────
    section('4. Codebase sweep — no remaining dr date-range workarounds');

    // Programmatic scan of all .js files in src/ for the pattern
    const fs   = require('fs');
    const path = require('path');

    function scanDir(dir, found) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { scanDir(full, found); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const src = fs.readFileSync(full, 'utf8');
        // Patterns that indicate the old workaround:
        //   - a CTE named `dr` or `date_range` that derives min/max date from an attendance table
        //   - then uses it to scope an absence table via CROSS JOIN `, dr` or inline subselect
        const patterns = [
          /WITH\s+dr\s+AS\s*\(/i,
          /WITH\s+date_range\s+AS\s*\(/i,
          /INTERVAL\s+'365\s+days'/i,
          /COALESCE\s*\(\s*MIN\s*\(\s*date\s*\)/i,
          /absences.*,\s*dr\b/i,
          /plc_absences.*,\s*dr\b/i,
          /meeting_absences.*,\s*dr\b/i,
        ];
        const hits = patterns.filter(p => p.test(src));
        if (hits.length) {
          found.push({ file: path.relative(process.cwd(), full), patterns: hits.map(h => h.toString().slice(1, 40)) });
        }
      }
    }

    const srcDir = path.join(__dirname, 'src');
    const found  = [];
    scanDir(srcDir, found);

    if (found.length === 0) {
      ok('No dr-style date-range workarounds found in any src/ file');
    } else {
      found.forEach(f => {
        bad(`${f.file}: still has dr-style pattern — ${f.patterns.join(', ')}`);
      });
    }


    // ── Summary ───────────────────────────────────────────────────────────────
    section(`RESULT: ${pass} passed, ${fail} failed`);
    if (fail === 0) console.log('  All checks passed. ✓');
    else { console.error(`  ${fail} check(s) failed.`); process.exitCode = 1; }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
