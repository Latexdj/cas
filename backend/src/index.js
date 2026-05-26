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
const houseRoutes             = require('./routes/houses');
const classroomQrRoutes       = require('./routes/classroom-qr');
const notificationsRoutes     = require('./routes/notifications');
const auditLogRoutes          = require('./routes/audit-log');
const schoolBreaksRoutes      = require('./routes/school-breaks');
const plcRoutes               = require('./routes/plc');
const meetingsRoutes          = require('./routes/meetings');
const assessmentModesRoutes   = require('./routes/assessment-modes');
const assessmentsRoutes       = require('./routes/assessments');
const examScoresRoutes        = require('./routes/exam-scores');
const gradeBoundariesRoutes   = require('./routes/grade-boundaries');
const resultsRoutes           = require('./routes/results');
const { startAbsenceCheckJob }      = require('./jobs/absenceCheck');
const { startSubscriptionExpiryJob } = require('./jobs/subscriptionExpiry');

const app = express();

// Trust Render's reverse proxy so req.ip is the real client IP,
// not the proxy IP. Without this every teacher shares one IP and
// one person's failed logins lock out the entire school.
app.set('trust proxy', 1);

app.use(helmet());

// CORS — restrict to explicit origin in production.
// Set CORS_ORIGIN env var to your frontend URL (e.g. https://app.yourschool.com).
// Multiple origins: comma-separated list.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('[WARN] CORS_ORIGIN is not set in production — defaulting to *. Set it to your frontend URL.');
}
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : '*';
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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
app.use('/api/houses',             houseRoutes);
app.use('/api/classroom-qr',       classroomQrRoutes);
app.use('/api/notifications',      notificationsRoutes);
app.use('/api/audit-log',          auditLogRoutes);
app.use('/api/school-breaks',      schoolBreaksRoutes);
app.use('/api/plc',                plcRoutes);
app.use('/api/meetings',           meetingsRoutes);
app.use('/api/assessment-modes',   assessmentModesRoutes);
app.use('/api/assessments',        assessmentsRoutes);
app.use('/api/exam-scores',        examScoresRoutes);
app.use('/api/grade-boundaries',   gradeBoundariesRoutes);
app.use('/api/results',            resultsRoutes);

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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS houses (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE schools  ADD COLUMN IF NOT EXISTS logo_url  TEXT`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_audit_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
        action      TEXT NOT NULL,
        actor_id    UUID,
        actor_name  TEXT,
        target_type TEXT,
        target_id   UUID,
        details     JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_school_audit_logs_school
        ON school_audit_logs(school_id, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id  UUID REFERENCES teachers(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        message     TEXT NOT NULL,
        read        BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_notifications_teacher
        ON teacher_notifications(teacher_id, read, created_at DESC)
    `);
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plc_sessions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        start_time  TIME NOT NULL,
        end_time    TIME NOT NULL,
        location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plc_attendance (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        session_id        UUID NOT NULL REFERENCES plc_sessions(id) ON DELETE CASCADE,
        teacher_id        UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date              DATE NOT NULL,
        academic_year_id  UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        semester          SMALLINT,
        agenda            TEXT,
        gps_coordinates   TEXT,
        photo_url         TEXT,
        photo_size_kb     INTEGER,
        location_name     TEXT,
        location_verified BOOLEAN NOT NULL DEFAULT false,
        submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (session_id, teacher_id, date)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_plc_attendance_school_date
        ON plc_attendance(school_id, date DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_plc_attendance_teacher
        ON plc_attendance(teacher_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plc_absences (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        session_id  UUID NOT NULL REFERENCES plc_sessions(id) ON DELETE CASCADE,
        teacher_id  UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date        DATE NOT NULL,
        status      TEXT NOT NULL DEFAULT 'Absent',
        reason      TEXT,
        detected_at TIME,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (session_id, teacher_id, date)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_plc_absences_school_date
        ON plc_absences(school_id, date DESC)
    `);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS qr_secret TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS qr_rotated_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS period_duration_minutes INTEGER NOT NULL DEFAULT 60`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        meeting_type TEXT NOT NULL CHECK (meeting_type IN ('PLC', 'Morning Briefing', 'Staff Meeting', 'PTA', 'Other')),
        date         DATE NOT NULL,
        start_time   TIME NOT NULL,
        end_time     TIME NOT NULL,
        location_id  UUID REFERENCES locations(id) ON DELETE SET NULL,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_attendance (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        meeting_id        UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        teacher_id        UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date              DATE NOT NULL,
        academic_year_id  UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        semester          SMALLINT,
        notes             TEXT,
        gps_coordinates   TEXT,
        photo_url         TEXT,
        photo_size_kb     INTEGER,
        location_name     TEXT,
        location_verified BOOLEAN NOT NULL DEFAULT false,
        submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (meeting_id, teacher_id, date)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_meeting_attendance_school_date
        ON meeting_attendance(school_id, date DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_meeting_attendance_teacher
        ON meeting_attendance(teacher_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_absences (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        teacher_id  UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date        DATE NOT NULL,
        status      TEXT NOT NULL DEFAULT 'Absent',
        reason      TEXT,
        detected_at TIME,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (meeting_id, teacher_id, date)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_meeting_absences_school_date
        ON meeting_absences(school_id, date DESC)
    `);
    // Assessment Module
    await pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS exam_body TEXT NOT NULL DEFAULT 'WAEC'`);
    await pool.query(`ALTER TABLE schools  ADD COLUMN IF NOT EXISTS ca_percentage INTEGER NOT NULL DEFAULT 30`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_modes (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        ca_contribution NUMERIC(5,2) NOT NULL DEFAULT 0,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        semester         SMALLINT NOT NULL,
        subject          TEXT NOT NULL,
        class_name       TEXT NOT NULL,
        teacher_id       UUID REFERENCES teachers(id) ON DELETE SET NULL,
        mode_id          UUID NOT NULL REFERENCES assessment_modes(id) ON DELETE CASCADE,
        title            TEXT,
        date             DATE,
        max_score        NUMERIC(5,2) NOT NULL DEFAULT 100,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_assessments_school_year_sem
        ON assessments(school_id, academic_year_id, semester)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_scores (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        score         NUMERIC(5,2),
        absent        BOOLEAN NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (assessment_id, student_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_scores (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        semester         SMALLINT NOT NULL,
        subject          TEXT NOT NULL,
        class_name       TEXT NOT NULL,
        student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        teacher_id       UUID REFERENCES teachers(id) ON DELETE SET NULL,
        score            NUMERIC(5,2),
        max_score        NUMERIC(5,2) NOT NULL DEFAULT 100,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (academic_year_id, semester, subject, class_name, student_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_exam_scores_school_year_sem
        ON exam_scores(school_id, academic_year_id, semester)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grade_boundaries (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        exam_body   TEXT NOT NULL CHECK (exam_body IN ('WAEC','CTVET')),
        grade       TEXT NOT NULL,
        min_pct     NUMERIC(5,2) NOT NULL,
        max_pct     NUMERIC(5,2) NOT NULL,
        remark      TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE (school_id, exam_body, grade)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_breaks (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        day_of_week INTEGER,
        start_time  TIME NOT NULL,
        end_time    TIME NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, day_of_week, start_time)
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
