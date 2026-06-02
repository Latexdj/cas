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
