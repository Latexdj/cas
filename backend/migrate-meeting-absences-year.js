require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== meeting_absences: add + backfill academic_year_id ===\n');

    // 1. Add column (nullable so backfill can run first)
    console.log('Step 1: Add academic_year_id column (nullable)...');
    await client.query(`
      ALTER TABLE meeting_absences
      ADD COLUMN IF NOT EXISTS academic_year_id UUID
        REFERENCES academic_years(id) ON DELETE SET NULL
    `);
    console.log('  Done.\n');

    // 2. Backfill via date-range join on academic_years
    console.log('Step 2: Backfill by joining on date vs academic_year start/end dates...');
    const { rowCount: updated } = await client.query(`
      UPDATE meeting_absences ab
      SET academic_year_id = ay.id
      FROM academic_years ay
      WHERE ay.school_id    = ab.school_id
        AND ay.start_date   IS NOT NULL
        AND ay.end_date     IS NOT NULL
        AND ab.date        >= ay.start_date
        AND ab.date        <= ay.end_date
        AND ab.academic_year_id IS NULL
    `);
    console.log(`  Backfilled ${updated} row(s).\n`);

    // 3. Verify: zero NULLs
    console.log('Step 3: Verify — NULL check...');
    const { rows: [nullCheck] } = await client.query(
      `SELECT COUNT(*)::int AS null_count FROM meeting_absences WHERE academic_year_id IS NULL`
    );
    console.log(`  Rows with NULL academic_year_id: ${nullCheck.null_count}`);
    if (nullCheck.null_count > 0) {
      console.error('  ERROR: Some rows could not be backfilled. Aborting before NOT NULL constraint.');
      process.exit(1);
    }
    console.log('  Zero NULLs — OK.\n');

    // 4. Verify: school_id consistency
    console.log('Step 4: Verify — school_id consistency...');
    const { rows: [mismatch] } = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM meeting_absences ab
      JOIN academic_years ay ON ay.id = ab.academic_year_id
      WHERE ay.school_id != ab.school_id
    `);
    console.log(`  school_id mismatches: ${mismatch.cnt}`);
    if (mismatch.cnt > 0) {
      console.error('  ERROR: school_id mismatch found. Aborting.');
      process.exit(1);
    }
    console.log('  Zero mismatches — OK.\n');

    // 5. Verify: distribution by year
    const { rows: dist } = await client.query(`
      SELECT ay.name, COUNT(*)::int AS cnt
      FROM meeting_absences ab
      JOIN academic_years ay ON ay.id = ab.academic_year_id
      GROUP BY ay.name ORDER BY ay.name
    `);
    console.log('  Distribution by academic year:');
    dist.forEach(r => console.log(`    ${r.name}: ${r.cnt} rows`));
    console.log();

    // 6. Make NOT NULL
    console.log('Step 5: Applying NOT NULL constraint...');
    await client.query(`ALTER TABLE meeting_absences ALTER COLUMN academic_year_id SET NOT NULL`);
    console.log('  Done.\n');

    // 7. Create index
    console.log('Step 6: Creating index on academic_year_id...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meeting_absences_academic_year_id
      ON meeting_absences(academic_year_id)
    `);
    console.log('  Done.\n');

    console.log('=== Migration complete: meeting_absences.academic_year_id ===');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
