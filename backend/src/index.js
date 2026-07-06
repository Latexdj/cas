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
const formTeacherRoutes       = require('./routes/form-teacher');
const studentPortalRoutes     = require('./routes/student');
const { router: clearanceAdminRoutes } = require('./routes/clearanceAdmin');
const clearanceStaffRoutes    = require('./routes/clearanceStaff');
const { router: libraryAdminRoutes }  = require('./routes/libraryAdmin');
const libraryRoutes           = require('./routes/library');
const schoolStaffRoutes       = require('./routes/schoolStaff');
const responsibilitiesRoutes  = require('./routes/responsibilities');
const hodRoutes               = require('./routes/hod');
const exeatRoutes             = require('./routes/exeat');
const reportRoutes            = require('./routes/reports');
const principalAuthRoutes     = require('./routes/principal-auth');
const principalRoutes         = require('./routes/principal');
const managementUserRoutes    = require('./routes/management-users');
const feesRoutes              = require('./routes/fees');
const admissionsRoutes        = require('./routes/admissions');
const adminAdmissionsRoutes   = require('./routes/admin-admissions');
const resultSubmissionsRoutes = require('./routes/result-submissions');
const monitoringRoutes        = require('./routes/assessment-monitoring');
const departmentRoutes        = require('./routes/departments');
const primaryRoutes           = require('./routes/primary');
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

// 50 mb limit to handle base64 classroom photos and PDF document uploads
app.use(express.json({ limit: '50mb' }));

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
app.use('/api/form-teacher',       formTeacherRoutes);
app.use('/api/student',            studentPortalRoutes);
app.use('/api/clearance-admin',    clearanceAdminRoutes);
app.use('/api/clearance',          clearanceStaffRoutes);
app.use('/api/library-admin',      libraryAdminRoutes);
app.use('/api/library',            libraryRoutes);
app.use('/api/school-staff',       schoolStaffRoutes);
app.use('/api/responsibilities',   responsibilitiesRoutes);
app.use('/api/hod',                hodRoutes);
app.use('/api/exeat',              exeatRoutes);
app.use('/api/reports',            reportRoutes);
app.use('/api/principal/auth',     principalAuthRoutes);
app.use('/api/principal',          principalRoutes);
app.use('/api/admin/management-users', managementUserRoutes);
app.use('/api/fees',                  feesRoutes);
app.use('/api/admissions',            admissionsRoutes);
app.use('/api/admin/admissions',      adminAdmissionsRoutes);
app.use('/api/result-submissions',    resultSubmissionsRoutes);
app.use('/api/assessment-monitoring', monitoringRoutes);
app.use('/api/departments',           departmentRoutes);
app.use('/api/primary',               primaryRoutes);

app.use(errorHandler);

async function runMigrations() {
  try {
    const pool = require('./config/db');

    // Ensure plans table exists and has all required columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name           TEXT          NOT NULL,
        display_name   TEXT          NOT NULL,
        max_teachers   INTEGER,
        price_monthly  NUMERIC(10,2) NOT NULL DEFAULT 0,
        duration_days  INTEGER
      )
    `);
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_days INTEGER`);
    // Use WHERE NOT EXISTS to avoid ON CONFLICT dependency on a named unique constraint
    await pool.query(`INSERT INTO plans (name, display_name, max_teachers, price_monthly, duration_days) SELECT 'trial','Free Trial (14 days)',50,0,14 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name='trial')`);
    await pool.query(`INSERT INTO plans (name, display_name, max_teachers, price_monthly, duration_days) SELECT 'paid','Standard Plan',NULL,0,NULL WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name='paid')`);

    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`);
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS house_rooms (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        house_name TEXT NOT NULL,
        room_name  TEXT NOT NULL,
        capacity   INTEGER,
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (school_id, house_name, room_name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS house_room_assignments (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        room_id     UUID NOT NULL REFERENCES house_rooms(id) ON DELETE CASCADE,
        student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (school_id, student_id)
      )
    `);
    await pool.query(`ALTER TABLE student_attendance_sessions ADD COLUMN IF NOT EXISTS remedial_id UUID REFERENCES remedial_lessons(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE schools  ADD COLUMN IF NOT EXISTS logo_url  TEXT`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_calendar (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        date       DATE NOT NULL,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL DEFAULT 'Holiday',
        notes      TEXT,
        start_time TIME,
        end_time   TIME,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, date, name)
      )
    `);
    await pool.query(`ALTER TABLE school_calendar ADD COLUMN IF NOT EXISTS start_time TIME`);
    await pool.query(`ALTER TABLE school_calendar ADD COLUMN IF NOT EXISTS end_time TIME`);
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
      CREATE TABLE IF NOT EXISTS locations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'Classroom',
        latitude        DOUBLE PRECISION,
        longitude       DOUBLE PRECISION,
        radius_meters   INTEGER NOT NULL DEFAULT 30,
        has_coordinates BOOLEAN NOT NULL DEFAULT false,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, name)
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
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS semester SMALLINT`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS agenda TEXT`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS gps_coordinates TEXT`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS photo_size_kb INTEGER`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS location_name TEXT`);
    await pool.query(`ALTER TABLE plc_attendance ADD COLUMN IF NOT EXISTS location_verified BOOLEAN NOT NULL DEFAULT false`);
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
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minutes_url TEXT`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minutes_filename TEXT`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minutes_uploaded_at TIMESTAMPTZ`);
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
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS semester SMALLINT`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS gps_coordinates TEXT`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS photo_size_kb INTEGER`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS location_name TEXT`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS location_verified BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE meeting_attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_attendance_unique ON meeting_attendance(meeting_id, teacher_id, date)`);
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
    // Absences + Remedial Module
    await pool.query(`
      CREATE TABLE IF NOT EXISTS absences (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id        UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date              DATE NOT NULL,
        subject           TEXT,
        class_name        TEXT,
        scheduled_period  TEXT,
        status            TEXT NOT NULL DEFAULT 'Absent',
        is_auto_generated BOOLEAN NOT NULL DEFAULT false,
        reason            TEXT,
        detected_at       TIMESTAMPTZ,
        periods_lost      INTEGER NOT NULL DEFAULT 1,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ
      )
    `);
    await pool.query(`ALTER TABLE absences ADD COLUMN IF NOT EXISTS periods_lost INTEGER NOT NULL DEFAULT 1`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS remedial_lessons (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id            UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        absence_id            UUID REFERENCES absences(id) ON DELETE SET NULL,
        original_absence_date DATE NOT NULL,
        subject               TEXT NOT NULL,
        class_name            TEXT NOT NULL,
        remedial_date         DATE NOT NULL,
        remedial_time         TIME NOT NULL,
        remedial_end_time     TIME,
        duration_periods      INTEGER,
        topic                 TEXT,
        location_id           UUID REFERENCES locations(id) ON DELETE SET NULL,
        location_name         TEXT,
        notes                 TEXT,
        status                TEXT NOT NULL DEFAULT 'Scheduled',
        photo_url             TEXT,
        gps_coordinates       TEXT,
        verified_by           TEXT,
        verified_at           TIMESTAMPTZ,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ
      )
    `);
    await pool.query(`ALTER TABLE remedial_lessons ADD COLUMN IF NOT EXISTS remedial_end_time TIME`);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE remedial_lessons DROP CONSTRAINT IF EXISTS remedial_lessons_status_check;
        ALTER TABLE remedial_lessons ADD CONSTRAINT remedial_lessons_status_check
          CHECK (status = ANY (ARRAY['Scheduled','Completed','Verified','Cancelled','Rejected']));
      END $$;
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS results_import (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        semester         SMALLINT NOT NULL CHECK (semester IN (1, 2)),
        subject          TEXT NOT NULL,
        class_score      NUMERIC(6,2),
        exam_score       NUMERIC(6,2),
        total_score      NUMERIC(6,2),
        grade            TEXT,
        remarks          TEXT,
        imported_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, student_id, academic_year_id, semester, subject)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_results_import_lookup
        ON results_import(school_id, academic_year_id, semester, student_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_remarks (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        semester         SMALLINT NOT NULL,
        attitude         TEXT,
        conduct          TEXT,
        general_remarks  TEXT,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, student_id, academic_year_id, semester)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_teacher_assignments (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id       UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        class_name       TEXT NOT NULL,
        academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, class_name, academic_year_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_form_teacher_assignments_teacher
        ON form_teacher_assignments(teacher_id)
    `);
    await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS pin_hash TEXT`);

    // ── Clearance module ───────────────────────────────────────────────────
    // Drop legacy tables (cascade removes FK constraints; columns cleaned up below)
    await pool.query(`DROP TABLE IF EXISTS clearance_staff CASCADE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clearance_offices (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name                TEXT NOT NULL,
        office_type         TEXT NOT NULL DEFAULT 'general',
        linked_programme_id UUID REFERENCES programs(id) ON DELETE SET NULL,
        linked_house        TEXT,
        sort_order          INTEGER NOT NULL DEFAULT 0,
        is_active           BOOLEAN NOT NULL DEFAULT true,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clearance_office_staff (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        office_id   UUID NOT NULL REFERENCES clearance_offices(id) ON DELETE CASCADE,
        teacher_id  UUID REFERENCES teachers(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (office_id, teacher_id)
      )
    `);
    await pool.query(`ALTER TABLE clearance_office_staff DROP COLUMN IF EXISTS clearance_staff_id`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_clearances (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        initiated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        initiated_by     UUID REFERENCES teachers(id) ON DELETE SET NULL,
        is_fully_cleared BOOLEAN NOT NULL DEFAULT false,
        fully_cleared_at TIMESTAMPTZ,
        UNIQUE (school_id, student_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_clearance_items (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id              UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        clearance_id           UUID NOT NULL REFERENCES student_clearances(id) ON DELETE CASCADE,
        office_id              UUID NOT NULL REFERENCES clearance_offices(id) ON DELETE CASCADE,
        status                 TEXT NOT NULL DEFAULT 'pending',
        notes                  TEXT,
        actioned_by_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
        actioned_at            TIMESTAMPTZ,
        UNIQUE (clearance_id, office_id)
      )
    `);
    await pool.query(`ALTER TABLE student_clearance_items DROP COLUMN IF EXISTS actioned_by_clearance_staff_id`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_clearances_student
        ON student_clearances(student_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_clearance_items_clearance
        ON student_clearance_items(clearance_id)
    `);
    // ── Library module ─────────────────────────────────────────────────────────
    await pool.query(`DROP TABLE IF EXISTS library_staff CASCADE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS library_settings (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        loan_period_days      INTEGER NOT NULL DEFAULT 14,
        fine_per_day          NUMERIC(8,2) NOT NULL DEFAULT 0.50,
        max_loans_per_student INTEGER NOT NULL DEFAULT 3,
        UNIQUE (school_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS library_books (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        title            TEXT NOT NULL,
        author           TEXT,
        isbn             TEXT,
        subject          TEXT,
        category         TEXT NOT NULL DEFAULT 'general',
        level            TEXT,
        cover_url        TEXT,
        total_copies     INTEGER NOT NULL DEFAULT 0,
        available_copies INTEGER NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_library_books_school
        ON library_books(school_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS library_copies (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        book_id      UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
        copy_number  TEXT NOT NULL,
        condition    TEXT NOT NULL DEFAULT 'Good',
        is_available BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (book_id, copy_number)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS library_loans (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        copy_id     UUID NOT NULL REFERENCES library_copies(id) ON DELETE RESTRICT,
        book_id     UUID NOT NULL REFERENCES library_books(id) ON DELETE RESTRICT,
        student_id  UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        due_date    DATE NOT NULL,
        returned_at TIMESTAMPTZ,
        fine_amount NUMERIC(8,2) NOT NULL DEFAULT 0,
        fine_paid   BOOLEAN NOT NULL DEFAULT false,
        status      TEXT NOT NULL DEFAULT 'active',
        notes       TEXT
      )
    `);
    await pool.query(`ALTER TABLE library_loans DROP COLUMN IF EXISTS issued_by_staff_id`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_library_loans_school_status
        ON library_loans(school_id, status)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_library_loans_student
        ON library_loans(student_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS library_resources (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        subject        TEXT,
        resource_type  TEXT NOT NULL DEFAULT 'other',
        academic_year  TEXT,
        level          TEXT,
        file_url       TEXT NOT NULL,
        file_name      TEXT NOT NULL,
        file_size_kb   INTEGER,
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE library_resources DROP COLUMN IF EXISTS uploaded_by`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_library_resources_school
        ON library_resources(school_id, resource_type)
    `);

    // ── Unified non-teaching staff ─────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_staff (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, email)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_staff_roles (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id   UUID NOT NULL REFERENCES school_staff(id) ON DELETE CASCADE,
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        role       TEXT NOT NULL CHECK (role IN ('clearance','library')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (staff_id, role)
      )
    `);
    await pool.query(`DROP TABLE IF EXISTS library_teacher_staff CASCADE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_responsibilities (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        module_key  VARCHAR(50),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_responsibility_assignments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id        UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        responsibility_id UUID NOT NULL REFERENCES teacher_responsibilities(id) ON DELETE CASCADE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (teacher_id, responsibility_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_responsibility_assignments_teacher
        ON teacher_responsibility_assignments(teacher_id)
    `);
    // Add school_staff_id to clearance_office_staff (fresh deployments already have it from CREATE TABLE above)
    await pool.query(`ALTER TABLE clearance_office_staff ADD COLUMN IF NOT EXISTS school_staff_id UUID REFERENCES school_staff(id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE student_clearance_items ADD COLUMN IF NOT EXISTS actioned_by_school_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE library_loans ADD COLUMN IF NOT EXISTS issued_by_school_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE library_loans ADD COLUMN IF NOT EXISTS issued_by_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE library_resources ADD COLUMN IF NOT EXISTS uploaded_by_school_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL`);

    // Exeat module
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exeats (
        id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id            UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id           UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        exeat_type           TEXT         NOT NULL CHECK (exeat_type IN ('internal','external')),
        status               TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','active','returned','overdue','rejected')),
        destination          TEXT,
        reason               TEXT,
        parent_contact       TEXT,
        departure_date       DATE         NOT NULL,
        departure_time       TIME         NOT NULL,
        expected_return_date DATE         NOT NULL,
        expected_return_time TIME         NOT NULL,
        actual_return_date   DATE,
        actual_return_time   TIME,
        granted_by           UUID         REFERENCES teachers(id) ON DELETE SET NULL,
        granted_at           TIMESTAMPTZ,
        sms_sent             BOOLEAN      NOT NULL DEFAULT false,
        notes                TEXT,
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_exeats_school_status ON exeats(school_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_exeats_student ON exeats(student_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS exeat_settings (
        id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id           UUID         NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
        max_internal        INT          NOT NULL DEFAULT 5,
        max_external        INT          NOT NULL DEFAULT 2,
        semester_start_date DATE         NOT NULL DEFAULT CURRENT_DATE,
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`ALTER TABLE teacher_excuses ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS management_users (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        role             TEXT NOT NULL CHECK (role IN ('principal','vice_principal')),
        management_code  TEXT NOT NULL,
        pin_hash         TEXT NOT NULL,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ DEFAULT now(),
        updated_at       TIMESTAMPTZ DEFAULT now(),
        UNIQUE (school_id, management_code)
      )
    `);

    // ── One-time data normalisation (idempotent) ──────────────────────────────
    // Normalise student gender to exact 'Male' / 'Female'
    await pool.query(`
      UPDATE students
      SET gender = CASE
        WHEN LOWER(TRIM(gender)) = 'male'   THEN 'Male'
        WHEN LOWER(TRIM(gender)) = 'female' THEN 'Female'
        ELSE gender
      END
      WHERE gender IS NOT NULL AND gender NOT IN ('Male', 'Female')
    `);
    // Normalise student residential_status to exact 'Day' / 'Boarding'
    await pool.query(`
      UPDATE students
      SET residential_status = CASE
        WHEN LOWER(TRIM(residential_status)) = 'day'      THEN 'Day'
        WHEN LOWER(TRIM(residential_status)) = 'boarding' THEN 'Boarding'
        ELSE residential_status
      END
      WHERE residential_status IS NOT NULL AND residential_status NOT IN ('Day', 'Boarding')
    `);
    // Normalise teacher gender to exact 'Male' / 'Female'
    await pool.query(`
      UPDATE teachers
      SET gender = CASE
        WHEN LOWER(TRIM(gender)) = 'male'   THEN 'Male'
        WHEN LOWER(TRIM(gender)) = 'female' THEN 'Female'
        ELSE gender
      END
      WHERE gender IS NOT NULL AND gender NOT IN ('Male', 'Female')
    `);
    // Normalise teacher rank to canonical GES strings
    await pool.query(`
      UPDATE teachers
      SET rank = CASE LOWER(TRIM(rank))
        WHEN 'pupil teacher'               THEN 'Pupil Teacher'
        WHEN 'teacher ii'                  THEN 'Teacher II'
        WHEN 'teacher i'                   THEN 'Teacher I'
        WHEN 'senior teacher ii'           THEN 'Senior Teacher II'
        WHEN 'senior teacher i'            THEN 'Senior Teacher I'
        WHEN 'assistant superintendent ii' THEN 'Assistant Superintendent II'
        WHEN 'assistant superintendent i'  THEN 'Assistant Superintendent I'
        WHEN 'superintendent'              THEN 'Superintendent'
        WHEN 'senior superintendent'       THEN 'Senior Superintendent'
        WHEN 'principal superintendent'    THEN 'Principal Superintendent'
        WHEN 'assistant director ii'       THEN 'Assistant Director II'
        WHEN 'assistant director i'        THEN 'Assistant Director I'
        WHEN 'deputy director'             THEN 'Deputy Director'
        WHEN 'director'                    THEN 'Director'
        ELSE rank
      END
      WHERE rank IS NOT NULL AND rank NOT IN (
        'Pupil Teacher','Teacher II','Teacher I',
        'Senior Teacher II','Senior Teacher I',
        'Assistant Superintendent II','Assistant Superintendent I',
        'Superintendent','Senior Superintendent','Principal Superintendent',
        'Assistant Director II','Assistant Director I',
        'Deputy Director','Director'
      )
    `);

    // ── School type, category, and module gating ─────────────────────────────
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_type VARCHAR(50) DEFAULT 'SHS'`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_category VARCHAR(50) DEFAULT 'Public'`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_modules (
        school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        module_key VARCHAR(50) NOT NULL,
        enabled    BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (school_id, module_key)
      )
    `);
    // Backfill: insert all modules as enabled=true for every school that has no rows yet
    await pool.query(`
      INSERT INTO school_modules (school_id, module_key, enabled)
      SELECT s.id, m.key, true
      FROM schools s
      CROSS JOIN (VALUES
        ('teacher_attendance'), ('student_attendance'), ('timetable'),
        ('leave_management'), ('meeting_attendance'), ('plc'),
        ('remedial_lessons'), ('assessments'), ('houses'),
        ('exeat'), ('clearance'), ('library'), ('classroom_qr'), ('fees')
      ) AS m(key)
      WHERE NOT EXISTS (
        SELECT 1 FROM school_modules sm WHERE sm.school_id = s.id
      )
      ON CONFLICT DO NOTHING
    `);

    // ── Accounts & Fees module ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fee_items (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fee_schedules (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        fee_item_id      UUID NOT NULL REFERENCES fee_items(id) ON DELETE CASCADE,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        semester         INT,
        class_name       TEXT,
        amount           NUMERIC(10,2) NOT NULL,
        due_date         DATE,
        created_at       TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_bills (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        fee_item_id      UUID REFERENCES fee_items(id) ON DELETE SET NULL,
        fee_schedule_id  UUID REFERENCES fee_schedules(id) ON DELETE SET NULL,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        semester         INT,
        description      TEXT NOT NULL,
        amount           NUMERIC(10,2) NOT NULL,
        due_date         DATE,
        created_at       TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fee_payments (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        bill_id        UUID REFERENCES student_bills(id) ON DELETE SET NULL,
        fee_item_id    UUID REFERENCES fee_items(id) ON DELETE SET NULL,
        amount         NUMERIC(10,2) NOT NULL,
        payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method TEXT NOT NULL DEFAULT 'Cash',
        reference      TEXT,
        notes          TEXT,
        recorded_by    TEXT,
        receipt_no     TEXT,
        created_at     TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ── Expenditure tracking ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_expenses (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        category       TEXT NOT NULL,
        description    TEXT NOT NULL,
        amount         NUMERIC(10,2) NOT NULL,
        expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method TEXT NOT NULL DEFAULT 'Cash',
        paid_to        TEXT,
        reference      TEXT,
        recorded_by    TEXT,
        notes          TEXT,
        created_at     TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ── Timetable coverage: class-subject allocations ─────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_subjects (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        class_name       TEXT NOT NULL,
        subject_id       UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        periods_per_week INT NOT NULL DEFAULT 1,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, class_name, subject_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_class_subjects_school
        ON class_subjects(school_id, class_name)
    `);

    // ── Admission portal ────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_admission_settings (
        school_id            UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
        portal_slug          TEXT UNIQUE,
        admission_prefix     TEXT NOT NULL DEFAULT 'STU',
        admission_year       SMALLINT NOT NULL DEFAULT (EXTRACT(YEAR FROM CURRENT_DATE)::int % 100),
        next_sequence        INT NOT NULL DEFAULT 1,
        is_portal_open       BOOLEAN NOT NULL DEFAULT false,
        application_deadline DATE,
        website_title        TEXT,
        website_tagline      TEXT,
        welcome_text         TEXT,
        banner_image_url     TEXT,
        portal_logo_url      TEXT,
        contact_email        TEXT,
        contact_phone        TEXT,
        contact_address      TEXT,
        portal_primary_color TEXT NOT NULL DEFAULT '#16A34A',
        portal_accent_color  TEXT NOT NULL DEFAULT '#15803D',
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admission_placement (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        index_number       VARCHAR(12) NOT NULL,
        full_name          TEXT,
        date_of_birth      DATE,
        gender             TEXT,
        aggregate          INT,
        programme          TEXT,
        residential_status TEXT,
        is_registered      BOOLEAN NOT NULL DEFAULT false,
        uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, index_number)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admission_placement_school ON admission_placement(school_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admission_applications (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id              UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        index_number           VARCHAR(12) NOT NULL,
        admission_number       TEXT,
        form_token             UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        status                 TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','completed','reported','migrated')),
        student_id             UUID REFERENCES students(id) ON DELETE SET NULL,
        full_name              TEXT,
        date_of_birth          DATE,
        gender                 TEXT,
        hometown               TEXT,
        residential_address    TEXT,
        mobile_number          VARCHAR(10),
        ghana_card_number      TEXT,
        nhia_number            TEXT,
        aggregate              INT,
        residential_status     TEXT,
        religion               TEXT,
        religious_denomination TEXT,
        guardian_name          TEXT,
        guardian_relationship  TEXT,
        guardian_occupation    TEXT,
        guardian_mobile        VARCHAR(10),
        program_id             UUID REFERENCES programs(id) ON DELETE SET NULL,
        house                  TEXT,
        picture_url            TEXT,
        bece_results_url       TEXT,
        form_step              INT NOT NULL DEFAULT 1,
        form_completed_at      TIMESTAMPTZ,
        reported_at            TIMESTAMPTZ,
        migrated_at            TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, index_number)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admission_applications_school ON admission_applications(school_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admission_applications_token  ON admission_applications(form_token)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admission_prospectus (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        program_id         UUID REFERENCES programs(id) ON DELETE CASCADE,
        gender             TEXT NOT NULL DEFAULT 'All' CHECK (gender IN ('Male','Female','All')),
        residential_status TEXT NOT NULL DEFAULT 'All' CHECK (residential_status IN ('Boarding','Day','All')),
        file_url           TEXT NOT NULL,
        file_name          TEXT NOT NULL,
        uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admission_prospectus_unique
        ON admission_prospectus(school_id, COALESCE(program_id,'00000000-0000-0000-0000-000000000000'::uuid), gender, residential_status)
    `);

    // ── Assessment approval workflow ───────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS result_submissions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id    UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        semester            SMALLINT NOT NULL CHECK (semester IN (1, 2)),
        subject             TEXT NOT NULL,
        class_name          TEXT NOT NULL,
        teacher_id          UUID REFERENCES teachers(id) ON DELETE SET NULL,
        status              TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','submitted','hod_approved','final_approved','published','rejected')),
        submitted_at        TIMESTAMPTZ,
        hod_reviewed_by     UUID REFERENCES teachers(id) ON DELETE SET NULL,
        hod_reviewed_at     TIMESTAMPTZ,
        hod_comment         TEXT,
        final_reviewed_by   UUID REFERENCES teachers(id) ON DELETE SET NULL,
        final_reviewed_at   TIMESTAMPTZ,
        final_comment       TEXT,
        rejected_at         TIMESTAMPTZ,
        rejected_by         UUID REFERENCES teachers(id) ON DELETE SET NULL,
        rejected_reason     TEXT,
        published_at        TIMESTAMPTZ,
        UNIQUE (school_id, academic_year_id, semester, subject, class_name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subject_remarks (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        semester          SMALLINT NOT NULL CHECK (semester IN (1, 2)),
        subject           TEXT NOT NULL,
        class_name        TEXT NOT NULL,
        student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        teacher_id        UUID REFERENCES teachers(id) ON DELETE SET NULL,
        remarks           TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, academic_year_id, semester, subject, class_name, student_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        user_id     UUID NOT NULL,
        user_type   TEXT NOT NULL CHECK (user_type IN ('teacher','admin','student','management')),
        message     TEXT NOT NULL,
        link        TEXT,
        is_read     BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS score_audit_log (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        score_type      TEXT NOT NULL CHECK (score_type IN ('ca','exam')),
        score_id        UUID,
        assessment_id   UUID,
        student_id      UUID REFERENCES students(id) ON DELETE SET NULL,
        old_score       NUMERIC(5,2),
        new_score       NUMERIC(5,2),
        old_absent      BOOLEAN,
        new_absent      BOOLEAN,
        changed_by_id   UUID,
        changed_by_name TEXT,
        changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        reason          TEXT
      )
    `);

    // ── Departments ───────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name              TEXT NOT NULL,
        head_teacher_id   UUID REFERENCES teachers(id) ON DELETE SET NULL,
        clearance_enabled BOOLEAN NOT NULL DEFAULT false,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS department_teachers (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        teacher_id    UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (department_id, teacher_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_department_teachers_teacher ON department_teachers(teacher_id)`);

    // ── Timetable: academic year + semester columns ────────────────────────────
    await pool.query(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id)`);
    await pool.query(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS semester INTEGER CHECK (semester IN (1,2))`);
    // Stamp existing rows with the current active academic year/semester per school
    await pool.query(`
      UPDATE timetable t
      SET
        academic_year_id = (
          SELECT id FROM academic_years
          WHERE school_id = t.school_id AND is_current = true
          LIMIT 1
        ),
        semester = (
          SELECT current_semester FROM academic_years
          WHERE school_id = t.school_id AND is_current = true
          LIMIT 1
        )
      WHERE t.academic_year_id IS NULL
    `);

    // ── Primary / Basic school module ─────────────────────────────────────────
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_level TEXT DEFAULT 'secondary'`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS motto             TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS region            TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS district          TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS admission_prefix  TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS admission_year    VARCHAR(4)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_terms (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        term_number      SMALLINT    NOT NULL CHECK (term_number IN (1, 2, 3)),
        name             TEXT        NOT NULL,
        start_date       DATE,
        end_date         DATE,
        is_current       BOOLEAN     NOT NULL DEFAULT false,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, academic_year_id, term_number)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_students (
        id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id                       UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        admission_number                TEXT        NOT NULL,
        surname                         TEXT        NOT NULL,
        other_names                     TEXT,
        preferred_name                  TEXT,
        date_of_birth                   DATE,
        sex                             TEXT        CHECK (sex IN ('Male','Female')),
        nationality                     TEXT        NOT NULL DEFAULT 'Ghanaian',
        religion                        TEXT,
        hometown                        TEXT,
        district_of_origin              TEXT,
        region_of_origin                TEXT,
        residential_address             TEXT,
        photo_url                       TEXT,
        birth_certificate_no            TEXT,
        ghana_card_no                   TEXT,
        nhis_number                     TEXT,
        blood_group                     TEXT,
        genotype                        TEXT,
        known_conditions                TEXT,
        immunization_bcg                BOOLEAN     DEFAULT false,
        immunization_dpt                BOOLEAN     DEFAULT false,
        immunization_polio              BOOLEAN     DEFAULT false,
        immunization_measles            BOOLEAN     DEFAULT false,
        class_name                      TEXT        NOT NULL,
        date_of_admission               DATE,
        previous_school                 TEXT,
        previous_class                  TEXT,
        status                          TEXT        NOT NULL DEFAULT 'Active'
                                          CHECK (status IN ('Active','Withdrawn','Transferred','Graduated')),
        father_name                     TEXT,
        father_occupation               TEXT,
        father_education                TEXT,
        father_phone                    TEXT,
        father_alive                    BOOLEAN     DEFAULT true,
        mother_name                     TEXT,
        mother_occupation               TEXT,
        mother_education                TEXT,
        mother_phone                    TEXT,
        mother_alive                    BOOLEAN     DEFAULT true,
        guardian_name                   TEXT,
        guardian_relationship           TEXT,
        guardian_occupation             TEXT,
        guardian_phone                  TEXT,
        guardian_address                TEXT,
        emergency_contact_name          TEXT,
        emergency_contact_phone         TEXT,
        emergency_contact_relationship  TEXT,
        created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, admission_number)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_students_school_class ON primary_students(school_id, class_name, status)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_class_teachers (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id       UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        class_name       TEXT        NOT NULL,
        academic_year_id UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, class_name, academic_year_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_class_teachers_teacher ON primary_class_teachers(teacher_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_subjects (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id       UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        class_name      TEXT        NOT NULL,
        subject_name    TEXT        NOT NULL,
        max_class_score NUMERIC(5,2) NOT NULL DEFAULT 30,
        max_exam_score  NUMERIC(5,2) NOT NULL DEFAULT 70,
        sort_order      INTEGER     NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, class_name, subject_name)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_subjects_school_class ON primary_subjects(school_id, class_name)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_scores (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id       UUID         NOT NULL REFERENCES primary_students(id) ON DELETE CASCADE,
        subject_id       UUID         NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
        term_id          UUID         NOT NULL REFERENCES primary_terms(id) ON DELETE CASCADE,
        academic_year_id UUID         NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        class_score      NUMERIC(5,2),
        exam_score       NUMERIC(5,2),
        total            NUMERIC(5,2),
        grade            TEXT,
        position         INTEGER,
        teacher_id       UUID         REFERENCES teachers(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        UNIQUE (school_id, student_id, subject_id, term_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_scores_term ON primary_scores(school_id, term_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_daily_attendance (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id  UUID        NOT NULL REFERENCES primary_students(id) ON DELETE CASCADE,
        class_name  TEXT        NOT NULL,
        date        DATE        NOT NULL,
        status      TEXT        NOT NULL DEFAULT 'present'
                      CHECK (status IN ('present','absent','late','excused')),
        notes       TEXT,
        marked_by   UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, student_id, date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_attendance_class_date ON primary_daily_attendance(school_id, class_name, date)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_report_remarks (
        id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id                   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id                  UUID        NOT NULL REFERENCES primary_students(id) ON DELETE CASCADE,
        term_id                     UUID        NOT NULL REFERENCES primary_terms(id) ON DELETE CASCADE,
        academic_year_id            UUID        NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
        affective_ratings           JSONB,
        class_teacher_remarks       TEXT,
        class_teacher_id            UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        class_teacher_submitted_at  TIMESTAMPTZ,
        headmaster_remarks          TEXT,
        headmaster_id               UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        headmaster_approved_at      TIMESTAMPTZ,
        status                      TEXT        NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft','submitted','approved','rejected')),
        rejection_reason            TEXT,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, student_id, term_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_remarks_term ON primary_report_remarks(school_id, term_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_grade_scale (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        grade       TEXT         NOT NULL,
        min_score   NUMERIC(5,2) NOT NULL,
        max_score   NUMERIC(5,2) NOT NULL,
        description TEXT,
        sort_order  INTEGER      NOT NULL DEFAULT 0,
        UNIQUE (school_id, grade)
      )
    `);
    // Seed default A1-F9 grade scale for any primary school that has none
    await pool.query(`
      INSERT INTO primary_grade_scale (school_id, grade, min_score, max_score, description, sort_order)
      SELECT s.id, v.grade, v.min_score, v.max_score, v.description, v.sort_order
      FROM schools s
      CROSS JOIN (VALUES
        ('A1', 80,  100, 'Excellent',  1),
        ('B2', 70,   79, 'Very Good',  2),
        ('B3', 60,   69, 'Good',       3),
        ('C4', 55,   59, 'Credit',     4),
        ('C5', 50,   54, 'Credit',     5),
        ('C6', 45,   49, 'Credit',     6),
        ('D7', 40,   44, 'Pass',       7),
        ('E8', 35,   39, 'Pass',       8),
        ('F9',  0,   34, 'Fail',       9)
      ) AS v(grade, min_score, max_score, description, sort_order)
      WHERE NOT EXISTS (
        SELECT 1 FROM primary_grade_scale pgs WHERE pgs.school_id = s.id
      )
      ON CONFLICT DO NOTHING
    `);
    // Teacher daily attendance for primary schools
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_teacher_attendance (
        id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id UUID         NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date       DATE         NOT NULL,
        status     TEXT         NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
        notes      TEXT,
        marked_by  UUID         REFERENCES teachers(id),
        created_at TIMESTAMPTZ  DEFAULT now(),
        UNIQUE (school_id, teacher_id, date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_ta_date ON primary_teacher_attendance(school_id, date)`);

    // School-defined class list for primary schools
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_classes (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        class_name TEXT        NOT NULL,
        sort_order INT         DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(school_id, class_name)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_classes_school ON primary_classes(school_id, sort_order)`);

    // School-level subject catalog for primary schools
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_subject_catalog (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        subject_name TEXT        NOT NULL,
        description  TEXT,
        sort_order   INT         DEFAULT 0,
        created_at   TIMESTAMPTZ DEFAULT now(),
        UNIQUE(school_id, subject_name)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_catalog_school ON primary_subject_catalog(school_id, sort_order)`);
    // Link existing primary_subjects rows to catalog (backfill)
    await pool.query(`
      INSERT INTO primary_subject_catalog (school_id, subject_name, sort_order)
      SELECT DISTINCT school_id, subject_name, MIN(sort_order)
      FROM primary_subjects
      GROUP BY school_id, subject_name
      ON CONFLICT (school_id, subject_name) DO NOTHING
    `);
    // Add catalog_id FK to primary_subjects if not present
    await pool.query(`ALTER TABLE primary_subjects ADD COLUMN IF NOT EXISTS catalog_id UUID REFERENCES primary_subject_catalog(id) ON DELETE SET NULL`);
    // Backfill catalog_id on existing rows
    await pool.query(`
      UPDATE primary_subjects ps
      SET catalog_id = pc.id
      FROM primary_subject_catalog pc
      WHERE ps.school_id = pc.school_id AND ps.subject_name = pc.subject_name AND ps.catalog_id IS NULL
    `);

    // ── Primary school GPS & teacher self-attendance ──────────────────────────
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_latitude  NUMERIC(10,7)`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_longitude NUMERIC(10,7)`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_gps_radius INTEGER DEFAULT 100`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_teacher_self_attendance (
        id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id                    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id                   UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date                         DATE        NOT NULL,
        status                       TEXT        NOT NULL DEFAULT 'present'
                                       CHECK (status IN ('present','absent','excused')),
        is_auto_generated            BOOLEAN     NOT NULL DEFAULT false,
        clock_in_time                TIMESTAMPTZ,
        clock_in_photo               TEXT,
        clock_in_gps                 TEXT,
        clock_in_location_verified   BOOLEAN     NOT NULL DEFAULT false,
        photo_size_kb_in             NUMERIC(6,2),
        clock_out_time               TIMESTAMPTZ,
        clock_out_photo              TEXT,
        clock_out_gps                TEXT,
        clock_out_location_verified  BOOLEAN     NOT NULL DEFAULT false,
        photo_size_kb_out            NUMERIC(6,2),
        manual_entry_by              UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        manual_entry_note            TEXT,
        created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, teacher_id, date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_self_att_school_date ON primary_teacher_self_attendance(school_id, date DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_self_att_teacher ON primary_teacher_self_attendance(teacher_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_teacher_excuses (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id     UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        date_from      DATE        NOT NULL,
        date_to        DATE        NOT NULL,
        excuse_type    TEXT        NOT NULL DEFAULT 'Sick Leave'
                         CHECK (excuse_type IN ('Sick Leave','Annual Leave','Official Duty','Maternity Leave','Paternity Leave','Other')),
        reason         TEXT,
        status         TEXT        NOT NULL DEFAULT 'Pending'
                         CHECK (status IN ('Pending','Approved','Rejected')),
        reviewed_by    UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        reviewed_at    TIMESTAMPTZ,
        rejection_reason TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_excuses_school ON primary_teacher_excuses(school_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_excuses_teacher ON primary_teacher_excuses(teacher_id)`);

    // ── Primary assessments (formative/summative) ─────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_assessments (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        teacher_id  UUID        REFERENCES teachers(id) ON DELETE SET NULL,
        term_id     UUID        NOT NULL REFERENCES primary_terms(id) ON DELETE CASCADE,
        subject_id  UUID        NOT NULL REFERENCES primary_subjects(id) ON DELETE CASCADE,
        class_name  TEXT        NOT NULL,
        title       TEXT        NOT NULL,
        type        TEXT        NOT NULL DEFAULT 'formative'
                      CHECK (type IN ('formative','summative')),
        max_score   NUMERIC(6,2) NOT NULL DEFAULT 100,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_assessments_term ON primary_assessments(school_id, term_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_assessment_scores (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        assessment_id UUID        NOT NULL REFERENCES primary_assessments(id) ON DELETE CASCADE,
        student_id    UUID        NOT NULL REFERENCES primary_students(id) ON DELETE CASCADE,
        score         NUMERIC(6,2),
        absent        BOOLEAN     NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (assessment_id, student_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_assessment_scores_assessment ON primary_assessment_scores(assessment_id)`);

    // ── Primary assessment modes ───────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_assessment_modes (
        id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id          UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        name               TEXT         NOT NULL,
        ca_weight          NUMERIC(6,2) NOT NULL DEFAULT 10,
        is_terminal_exam   BOOLEAN      NOT NULL DEFAULT false,
        is_single_instance BOOLEAN      NOT NULL DEFAULT false,
        sort_order         INTEGER      NOT NULL DEFAULT 0,
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        UNIQUE (school_id, name)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_modes_school ON primary_assessment_modes(school_id, sort_order)`);
    // Add mode_id to primary_assessments (nullable — old rows without a mode still work)
    await pool.query(`ALTER TABLE primary_assessments ADD COLUMN IF NOT EXISTS mode_id UUID REFERENCES primary_assessment_modes(id) ON DELETE SET NULL`);
    // max_instances: NULL = unlimited; positive int = capped per subject/term
    await pool.query(`ALTER TABLE primary_assessment_modes ADD COLUMN IF NOT EXISTS max_instances INTEGER`);
    await pool.query(`ALTER TABLE assessment_modes ADD COLUMN IF NOT EXISTS max_instances INTEGER`);
    // School identity fields
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS vision TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS mission TEXT`);
    await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS core_values TEXT`);
    await pool.query(`ALTER TABLE primary_students ADD COLUMN IF NOT EXISTS picture_url TEXT`);
    // Cash book tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_cashbooks (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
        fund_source      TEXT NOT NULL DEFAULT 'Capitation Grant',
        opening_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes            TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (school_id, academic_year_id, fund_source)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS primary_cashbook_entries (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cashbook_id      UUID NOT NULL REFERENCES primary_cashbooks(id) ON DELETE CASCADE,
        school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        entry_date       DATE NOT NULL,
        entry_type       TEXT NOT NULL CHECK (entry_type IN ('receipt','payment')),
        particulars      TEXT NOT NULL,
        expenditure_head TEXT,
        voucher_ref      TEXT,
        amount           NUMERIC(12,2) NOT NULL,
        receipt_url      TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_primary_cashbook_entries_cashbook ON primary_cashbook_entries(cashbook_id, entry_date)`);
    // Migrate existing is_single_instance=true rows → max_instances=1
    await pool.query(`UPDATE primary_assessment_modes SET max_instances=1 WHERE is_single_instance=true AND max_instances IS NULL`);

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
