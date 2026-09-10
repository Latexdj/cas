require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== Step 1: Add nullable academic_year_id column ===');
    await client.query(`
      ALTER TABLE absences
      ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id)
    `);
    console.log('Column added (or already existed).');

    console.log('\n=== Step 2: Backfill — match each absence to its school\'s academic year by date range ===');
    const { rowCount: backfilled } = await client.query(`
      UPDATE absences ab
      SET academic_year_id = ay.id
      FROM academic_years ay
      WHERE ay.school_id  = ab.school_id
        AND ay.start_date IS NOT NULL
        AND ay.end_date   IS NOT NULL
        AND ab.date >= ay.start_date
        AND ab.date <= ay.end_date
        AND ab.academic_year_id IS NULL
    `);
    console.log(`Backfilled: ${backfilled} rows.`);

    console.log('\n=== Step 3: Verification ===');

    // 3a. Any rows still NULL?
    const { rows: nullCheck } = await client.query(
      `SELECT school_id, COUNT(*) AS cnt FROM absences WHERE academic_year_id IS NULL GROUP BY school_id`
    );
    if (nullCheck.length > 0) {
      console.error('FAIL — rows with NULL academic_year_id after backfill:');
      nullCheck.forEach(r => console.error(' ', r.school_id, r.cnt));
      console.error('These absences fall outside all academic year date windows.');
      console.error('Stopping — do NOT make column NOT NULL until these are resolved.');
      return;
    }
    console.log('NULL check: 0 rows with NULL academic_year_id. ✓');

    // 3b. School_id consistency — every absence's academic_year must belong to the same school
    const { rows: mismatch } = await client.query(`
      SELECT ab.id, ab.school_id AS abs_school, ay.school_id AS year_school
      FROM absences ab
      JOIN academic_years ay ON ay.id = ab.academic_year_id
      WHERE ab.school_id <> ay.school_id
      LIMIT 10
    `);
    if (mismatch.length > 0) {
      console.error('FAIL — school_id mismatch between absence and its academic_year:');
      mismatch.forEach(r => console.error(' ', JSON.stringify(r)));
      console.error('Stopping — matching logic has a bug. Do NOT continue.');
      return;
    }
    console.log('School-id consistency check: all absences match their year\'s school. ✓');

    // 3c. Distribution per school and year
    const { rows: dist } = await client.query(`
      SELECT ab.school_id, ay.name AS year_name, COUNT(*) AS cnt
      FROM absences ab
      JOIN academic_years ay ON ay.id = ab.academic_year_id
      GROUP BY ab.school_id, ay.name
      ORDER BY ab.school_id, ay.name
    `);
    console.log('Distribution by school + year:');
    dist.forEach(r => console.log(' ', r.school_id, r.year_name, r.cnt, 'rows'));

    console.log('\n=== Step 4: Make column NOT NULL ===');
    await client.query(`ALTER TABLE absences ALTER COLUMN academic_year_id SET NOT NULL`);
    console.log('Column is now NOT NULL. ✓');

    console.log('\n=== Step 5: Add index for year-scoped queries ===');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_absences_year
      ON absences(school_id, academic_year_id)
    `);
    console.log('Index idx_absences_year created (or already existed). ✓');

    console.log('\n=== Done. Final column list for absences ===');
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'absences'
      ORDER BY ordinal_position
    `);
    cols.forEach(c => console.log(' ', c.column_name.padEnd(28), c.data_type.padEnd(30), c.is_nullable));

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
