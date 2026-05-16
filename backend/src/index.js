require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const { errorHandler } = require('./middleware/errorHandler');
const authRoutes              = require('./routes/auth');
const schoolRoutes            = require('./routes/schools');
const teacherRoutes           = require('./routes/teachers');
const academicYearRoutes      = require('./routes/academicYears');
const locationRoutes          = require('./routes/locations');
const timetableRoutes         = require('./routes/timetable');
const subjectRoutes           = require('./routes/subjects');
const classRoutes             = require('./routes/classes');
const attendanceRoutes        = require('./routes/attendance');
const absenceRoutes           = require('./routes/absences');
const remedialRoutes          = require('./routes/remedial');
const adminRoutes             = require('./routes/admin');
const studentRoutes           = require('./routes/students');
const studentAttendanceRoutes = require('./routes/student-attendance');
const schoolCalendarRoutes    = require('./routes/school-calendar');
const teacherExcusesRoutes    = require('./routes/teacher-excuses');
const superAdminRoutes        = require('./routes/superAdmin');
const programRoutes           = require('./routes/programs');
const classroomQrRoutes       = require('./routes/classroom-qr');
const { startAbsenceCheckJob }      = require('./jobs/absenceCheck');
const { startSubscriptionExpiryJob } = require('./jobs/subscriptionExpiry');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// 10 mb limit to handle base64 classroom photos
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth',               authRoutes);
app.use('/api/schools',            schoolRoutes);
app.use('/api/teachers',           teacherRoutes);
app.use('/api/academic-years',     academicYearRoutes);
app.use('/api/locations',          locationRoutes);
app.use('/api/timetable',          timetableRoutes);
app.use('/api/subjects',           subjectRoutes);
app.use('/api/classes',            classRoutes);
app.use('/api/attendance',         attendanceRoutes);
app.use('/api/absences',           absenceRoutes);
app.use('/api/remedial',           remedialRoutes);
app.use('/api/admin',              adminRoutes);
app.use('/api/students',           studentRoutes);
app.use('/api/student-attendance', studentAttendanceRoutes);
app.use('/api/school-calendar',    schoolCalendarRoutes);
app.use('/api/teacher-excuses',    teacherExcusesRoutes);
app.use('/api/super-admin',        superAdminRoutes);
app.use('/api/programs',           programRoutes);
app.use('/api/classroom-qr',       classroomQrRoutes);

app.use(errorHandler);

async function runMigrations() {
  try {
    const pool = require('./config/db');
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS teacher_limit INTEGER NOT NULL DEFAULT 10`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE schools  ADD COLUMN IF NOT EXISTS logo_url  TEXT`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action      TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT 'school',
        entity_id   UUID,
        entity_name TEXT,
        details     JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS super_admin_credentials (
        id            INTEGER PRIMARY KEY DEFAULT 1,
        username      TEXT NOT NULL DEFAULT 'admin',
        password_hash TEXT NOT NULL,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('Migrations OK');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`CAS backend running on port ${PORT}`);
  await runMigrations();
  startAbsenceCheckJob();
  startSubscriptionExpiryJob();
});
