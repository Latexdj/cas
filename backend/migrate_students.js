require('dotenv').config();
const pool = require('./src/config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_code VARCHAR(50)  NOT NULL,
        name         VARCHAR(200) NOT NULL,
        class_name   VARCHAR(100) NOT NULL,
        status       VARCHAR(20)  NOT NULL DEFAULT 'Active'
                       CHECK (status IN ('Active','Graduated','Inactive')),
        notes        TEXT,
        created_at   TIMESTAMPTZ DEFAULT now(),
        updated_at   TIMESTAMPTZ DEFAULT now(),
        UNIQUE(school_id, student_code)
      )
    `);
    console.log('✓ students table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS student_attendance_sessions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        date             DATE NOT NULL,
        subject          VARCHAR(200) NOT NULL,
        class_name       VARCHAR(200) NOT NULL,
        teacher_id       UUID REFERENCES teachers(id),
        academic_year_id UUID REFERENCES academic_years(id),
        semester         INT,
        lesson_end_time  TIME,
        attendance_id    UUID REFERENCES attendance(id),
        created_at       TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('✓ student_attendance_sessions table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS student_attendance_records (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        session_id UUID NOT NULL REFERENCES student_attendance_sessions(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id),
        status     VARCHAR(20) NOT NULL DEFAULT 'Present'
                     CHECK (status IN ('Present','Absent','Late')),
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(session_id, student_id)
      )
    `);
    console.log('✓ student_attendance_records table');

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
