/**
 * Migration: add teacher_code to teachers table
 * Generates T001, T002… per school for existing teachers
 * Run once: node migrate_teacher_codes.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add column (nullable first so existing rows don't fail)
    await client.query(`
      ALTER TABLE teachers
      ADD COLUMN IF NOT EXISTS teacher_code VARCHAR(20)
    `);
    console.log('✓ Column teacher_code added (or already exists)');

    // 2. Backfill existing teachers per school: T001, T002, ...
    const { rows: schools } = await client.query(`SELECT DISTINCT school_id FROM teachers`);
    for (const { school_id } of schools) {
      const { rows: teachers } = await client.query(
        `SELECT id FROM teachers WHERE school_id = $1 AND teacher_code IS NULL ORDER BY name, created_at`,
        [school_id]
      );
      // Find the highest existing code number for this school
      const { rows: existing } = await client.query(
        `SELECT teacher_code FROM teachers WHERE school_id = $1 AND teacher_code IS NOT NULL`,
        [school_id]
      );
      let maxNum = existing.reduce((max, r) => {
        const m = r.teacher_code.match(/^T(\d+)$/i);
        return m ? Math.max(max, parseInt(m[1])) : max;
      }, 0);

      for (const t of teachers) {
        maxNum++;
        const code = 'T' + String(maxNum).padStart(3, '0');
        await client.query(
          `UPDATE teachers SET teacher_code = $1 WHERE id = $2`,
          [code, t.id]
        );
        console.log(`  Assigned ${code} to teacher ${t.id}`);
      }
    }
    console.log('✓ Backfilled teacher codes');

    // 3. Now make it NOT NULL and add UNIQUE constraint
    await client.query(`ALTER TABLE teachers ALTER COLUMN teacher_code SET NOT NULL`);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE teachers ADD CONSTRAINT teachers_school_code_unique UNIQUE (school_id, teacher_code);
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$
    `);
    console.log('✓ NOT NULL + UNIQUE constraint applied');

    await client.query('COMMIT');
    console.log('\n✅ Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
