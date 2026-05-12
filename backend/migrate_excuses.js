require('dotenv').config();
const pool = require('./src/config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS school_calendar (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        date       DATE NOT NULL,
        name       VARCHAR(200) NOT NULL,
        type       VARCHAR(50)  NOT NULL
                     CHECK (type IN ('Holiday', 'School Event', 'Closed Day')),
        notes      TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(school_id, date, name)
      )
    `);
    console.log('✓ school_calendar table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_school_calendar_school_date
        ON school_calendar(school_id, date)
    `);
    console.log('✓ school_calendar index');

    await client.query(`
      CREATE TABLE IF NOT EXISTS teacher_excuses (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id  UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date_from   DATE NOT NULL,
        date_to     DATE NOT NULL,
        type        VARCHAR(50) NOT NULL
                      CHECK (type IN ('Official Duty', 'Permission', 'Sick Leave', 'Other')),
        reason      TEXT NOT NULL,
        status      VARCHAR(20) NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending', 'Approved', 'Rejected')),
        approved_by UUID REFERENCES teachers(id),
        approved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('✓ teacher_excuses table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_excuses_lookup
        ON teacher_excuses(school_id, teacher_id, date_from, date_to)
    `);
    console.log('✓ teacher_excuses index');

    await client.query('COMMIT');
    console.log('Migration complete.');
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
