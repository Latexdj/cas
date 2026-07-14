require('dotenv').config();
const pool = require('./src/config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS department_subjects (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        subject       TEXT NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT now(),
        -- One subject belongs to exactly one department per school
        UNIQUE(school_id, subject)
      )
    `);
    console.log('✓ department_subjects table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dept_subjects_school
        ON department_subjects(school_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dept_subjects_dept
        ON department_subjects(department_id)
    `);
    console.log('✓ department_subjects indexes');

    await client.query('COMMIT');
    console.log('✓ Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
