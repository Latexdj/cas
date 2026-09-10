require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== plc_absences: add academic_year_id ===\n');

    // Confirm table is empty (verified in audit: 0 rows)
    const { rows: [cnt] } = await client.query(`SELECT COUNT(*)::int AS n FROM plc_absences`);
    console.log(`Row count: ${cnt.n}`);

    if (cnt.n > 0) {
      // There are rows — backfill first, same pattern as meeting_absences
      console.log('Step 1: Add column (nullable for backfill)...');
      await client.query(`
        ALTER TABLE plc_absences
        ADD COLUMN IF NOT EXISTS academic_year_id UUID
          REFERENCES academic_years(id) ON DELETE SET NULL
      `);

      console.log('Step 2: Backfill...');
      const { rowCount } = await client.query(`
        UPDATE plc_absences ab
        SET academic_year_id = ay.id
        FROM academic_years ay
        WHERE ay.school_id    = ab.school_id
          AND ay.start_date   IS NOT NULL
          AND ay.end_date     IS NOT NULL
          AND ab.date        >= ay.start_date
          AND ab.date        <= ay.end_date
          AND ab.academic_year_id IS NULL
      `);
      console.log(`  Backfilled ${rowCount} row(s).`);

      const { rows: [nc] } = await client.query(
        `SELECT COUNT(*)::int AS null_count FROM plc_absences WHERE academic_year_id IS NULL`
      );
      if (nc.null_count > 0) {
        console.error(`  ERROR: ${nc.null_count} rows could not be backfilled. Aborting.`);
        process.exit(1);
      }

      console.log('Step 3: Apply NOT NULL...');
      await client.query(`ALTER TABLE plc_absences ALTER COLUMN academic_year_id SET NOT NULL`);
    } else {
      // No rows — add as NOT NULL with a DEFAULT that resolves to nothing at rest
      // (DEFAULT NULL is logically equivalent since no existing rows need a value)
      console.log('Step 1: Table is empty — adding academic_year_id as NOT NULL with no default...');
      // We still need to allow future inserts to supply the value.
      // Add nullable first, then the NOT NULL constraint takes effect for new inserts via DB trigger —
      // actually the cleanest approach for an empty table is just ADD NOT NULL directly.
      await client.query(`
        ALTER TABLE plc_absences
        ADD COLUMN IF NOT EXISTS academic_year_id UUID
          NOT NULL
          REFERENCES academic_years(id) ON DELETE SET NULL
      `);
      console.log('  Done (no backfill needed — zero existing rows).\n');
    }

    // Create index
    console.log('Step 2: Creating index on academic_year_id...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_plc_absences_academic_year_id
      ON plc_absences(academic_year_id)
    `);
    console.log('  Done.\n');

    console.log('=== Migration complete: plc_absences.academic_year_id ===');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
