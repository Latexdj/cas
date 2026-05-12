require('dotenv').config();
const pool = require('./src/config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name       VARCHAR(150) NOT NULL,
        code       VARCHAR(30),
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(school_id, name)
      )
    `);
    console.log('subjects table ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name       VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(school_id, name)
      )
    `);
    console.log('classes table ready');

    // Rename class_name → class_names only if not already done
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'timetable' AND column_name = 'class_name'
    `);
    if (rows.length) {
      await client.query(`ALTER TABLE timetable RENAME COLUMN class_name TO class_names`);
      console.log('timetable.class_name renamed to class_names');
    } else {
      console.log('timetable.class_names already exists — skipping rename');
    }

    await client.query('COMMIT');
    console.log('\nMigration complete ✓');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
