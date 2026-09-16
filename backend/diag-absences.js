require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const S    = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const YEAR = '443540ab-35ed-4927-a228-b30bad0597f1';
const TID  = '9862b188-7758-4883-9ae2-4f290623b618'; // SALIFU

async function run() {
  const client = await pool.connect();
  try {
    // 1. What admin.js and attendance.js actually compute: SUM(COALESCE(periods_lost,1))
    const { rows: [all] } = await client.query(`
      SELECT
        COALESCE(SUM(COALESCE(periods_lost,1)) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_weighted,
        COALESCE(SUM(COALESCE(periods_lost,1)) FILTER (WHERE status = 'Excused'),0)::int AS excused_weighted,
        COUNT(*) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified'))::int AS absent_rows,
        COUNT(*) FILTER (WHERE status = 'Excused')::int AS excused_rows
      FROM absences WHERE school_id=$1 AND academic_year_id=$2
    `, [S, YEAR]);
    console.log('All absences (row count vs weighted SUM):');
    console.log(JSON.stringify(all));

    // 2. SALIFU per-teacher breakdown
    const { rows: [sal] } = await client.query(`
      SELECT
        COALESCE(SUM(COALESCE(periods_lost,1)) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_weighted,
        COUNT(*) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified'))::int AS absent_rows,
        SUM(periods_lost) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified'))::int AS absent_raw_sum
      FROM absences WHERE school_id=$1 AND academic_year_id=$2 AND teacher_id=$3
    `, [S, YEAR, TID]);
    console.log('\nSALIFU count vs weighted:');
    console.log(JSON.stringify(sal));

    const { rows: salDist } = await client.query(`
      SELECT periods_lost, status, COUNT(*)::int AS cnt
      FROM absences WHERE school_id=$1 AND teacher_id=$2 AND academic_year_id=$3
      GROUP BY periods_lost, status ORDER BY periods_lost, status
    `, [S, TID, YEAR]);
    console.log('SALIFU periods_lost distribution:');
    salDist.forEach(r => console.log(' ', JSON.stringify(r)));

    // 3. OLD dr-based query vs NEW academic_year_id query for 2025/2026
    const { rows: [oldQ] } = await client.query(`
      WITH dr AS (
        SELECT MIN(date) AS min_date, MAX(date) AS max_date
        FROM attendance WHERE school_id=$1 AND academic_year_id=$2
      )
      SELECT
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_old,
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status = 'Excused'),0)::int AS excused_old
      FROM absences ab, dr
      WHERE ab.school_id=$1 AND dr.min_date IS NOT NULL
        AND ab.date >= dr.min_date AND ab.date <= dr.max_date
    `, [S, YEAR]);

    const { rows: [newQ] } = await client.query(`
      SELECT
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status NOT IN ('Excused','Made Up','Verified')),0)::int AS absent_new,
        COALESCE(SUM(COALESCE(ab.periods_lost,1)) FILTER (WHERE ab.status = 'Excused'),0)::int AS excused_new
      FROM absences ab
      WHERE ab.school_id=$1 AND ab.academic_year_id=$2
    `, [S, YEAR]);

    console.log('\nOLD dr query (2025/2026):', JSON.stringify(oldQ));
    console.log('NEW academic_year_id (2025/2026):', JSON.stringify(newQ));
    if (oldQ.absent_old === newQ.absent_new && oldQ.excused_old === newQ.excused_new) {
      console.log('MATCH: OLD dr and NEW academic_year_id produce identical results for 2025/2026 ✓');
    } else {
      console.log('MISMATCH: investigate further');
      // Find absences that the old query misses or extra-includes
      const { rows: [drRange] } = await client.query(
        `SELECT MIN(date)::text AS min_date, MAX(date)::text AS max_date FROM attendance WHERE school_id=$1 AND academic_year_id=$2`,
        [S, YEAR]
      );
      console.log('DR date range for 2025/2026 attendance:', JSON.stringify(drRange));
      const { rows: outside } = await client.query(`
        SELECT date::text, COUNT(*) AS cnt FROM absences
        WHERE school_id=$1 AND academic_year_id=$2
          AND (date < $3::date OR date > $4::date)
        GROUP BY date ORDER BY date
      `, [S, YEAR, drRange.min_date, drRange.max_date]);
      console.log(`Absences outside dr range: ${outside.length} dates`);
      outside.forEach(r => console.log(' ', JSON.stringify(r)));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
