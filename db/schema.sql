-- =============================================================
-- Classroom Attendance System — PostgreSQL Schema (Multi-Tenant)
-- Architecture: Row-level multi-tenancy (school_id on every table)
-- Timezone: Africa/Accra (UTC+0, no DST)
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- 1. SCHOOLS  (tenants)
-- =============================================================
CREATE TABLE schools (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  phone      TEXT,
  address    TEXT,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- 2. PLANS  (global — same for all schools)
--    'trial'  → 14 days free, max 50 teachers
--    'paid'   → unlimited teachers, no expiry
-- =============================================================
CREATE TABLE plans (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT          NOT NULL UNIQUE,  -- 'trial' | 'paid'
  display_name   TEXT          NOT NULL,
  max_teachers   INTEGER,                        -- NULL = unlimited
  price_monthly  NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_days  INTEGER                         -- NULL = perpetual
);

INSERT INTO plans (name, display_name, max_teachers, price_monthly, duration_days)
VALUES
  ('trial', 'Free Trial (14 days)', 50,   0, 14),
  ('paid',  'Standard Plan',        NULL, 0, NULL);

-- =============================================================
-- 3. SUBSCRIPTIONS
-- =============================================================
CREATE TABLE subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  plan_id    UUID        NOT NULL REFERENCES plans (id),
  status     TEXT        NOT NULL DEFAULT 'trial'
                         CHECK (status IN ('trial','active','expired','cancelled')),
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at    TIMESTAMPTZ,    -- NULL = never expires (paid + active)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_school ON subscriptions (school_id);

-- =============================================================
-- 4. TEACHERS  (was: Staff sheet)
-- =============================================================
CREATE TABLE teachers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID        NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  email       TEXT,
  phone       TEXT,
  department  TEXT,
  status      TEXT        NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active','Inactive')),
  is_admin    BOOLEAN     NOT NULL DEFAULT false,  -- school-level admin
  notes       TEXT,
  pin_hash    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_teachers_name ON teachers (school_id, LOWER(name));
CREATE INDEX idx_teachers_school ON teachers (school_id);

-- =============================================================
-- 5. ACADEMIC YEARS  (was: AcademicYear sheet)
-- =============================================================
CREATE TABLE academic_years (
  id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID     NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name             TEXT     NOT NULL,
  is_current       BOOLEAN  NOT NULL DEFAULT false,
  current_semester SMALLINT CHECK (current_semester IN (1, 2)),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_academic_years_name    ON academic_years (school_id, name);
CREATE UNIQUE INDEX idx_one_current_year       ON academic_years (school_id, is_current)
  WHERE is_current = true;

-- =============================================================
-- 6. LOCATIONS  (was: Classes sheet)
-- =============================================================
CREATE TABLE locations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID          NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,
  type            TEXT          NOT NULL DEFAULT 'Classroom',
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  radius_meters   INTEGER       NOT NULL DEFAULT 30,
  has_coordinates BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_locations_name ON locations (school_id, name);

-- =============================================================
-- 7. TIMETABLE  (was: Timetable sheet)
-- =============================================================
CREATE TABLE timetable (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID     NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time   TIME     NOT NULL,
  end_time     TIME     NOT NULL,
  teacher_id   UUID     NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
  subject      TEXT     NOT NULL,
  class_name   TEXT     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timetable_time_order CHECK (end_time > start_time)
);

CREATE INDEX idx_timetable_teacher     ON timetable (teacher_id);
CREATE INDEX idx_timetable_school_day  ON timetable (school_id, day_of_week);

-- =============================================================
-- 8. ATTENDANCE  (was: FormData sheet)
-- =============================================================
CREATE TABLE attendance (
  id                            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                     UUID     NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  date                          DATE     NOT NULL,
  submitted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  academic_year_id              UUID     NOT NULL REFERENCES academic_years (id),
  semester                      SMALLINT NOT NULL CHECK (semester IN (1, 2)),
  teacher_id                    UUID     NOT NULL REFERENCES teachers (id),
  subject                       TEXT     NOT NULL,
  class_names                   TEXT     NOT NULL,
  periods                       SMALLINT NOT NULL CHECK (periods > 0),
  topic                         TEXT,
  gps_coordinates               TEXT,
  photo_url                     TEXT,
  week_number                   SMALLINT,
  location_id                   UUID     REFERENCES locations (id),
  location_name                 TEXT,
  location_verified             BOOLEAN  NOT NULL DEFAULT false,
  location_verification_message TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_school_date   ON attendance (school_id, date);
CREATE INDEX idx_attendance_teacher       ON attendance (teacher_id);
CREATE INDEX idx_attendance_date_teacher  ON attendance (school_id, date, teacher_id);
CREATE INDEX idx_attendance_dup_check     ON attendance (date, teacher_id, subject);

-- =============================================================
-- 9. ABSENCES  (was: Absences sheet)
-- =============================================================
CREATE TABLE absences (
  id                UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID     NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  date              DATE     NOT NULL,
  detected_at       TIME,
  teacher_id        UUID     NOT NULL REFERENCES teachers (id),
  subject           TEXT     NOT NULL,
  class_name        TEXT     NOT NULL,
  scheduled_period  TEXT,
  status            TEXT     NOT NULL DEFAULT 'Absent'
                             CHECK (status IN (
                               'Absent','Remedial Scheduled','Made Up','Cleared','Verified'
                             )),
  is_auto_generated BOOLEAN  NOT NULL DEFAULT true,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_absences_teacher      ON absences (teacher_id);
CREATE INDEX idx_absences_school_date  ON absences (school_id, date);
CREATE INDEX idx_absences_school_status ON absences (school_id, status);
CREATE UNIQUE INDEX idx_absences_unique
  ON absences (date, teacher_id, subject, class_name)
  WHERE is_auto_generated = true;

-- =============================================================
-- 10. REMEDIAL LESSONS  (was: RemedialLessons sheet)
-- =============================================================
CREATE TABLE remedial_lessons (
  id                    UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID     NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  absence_id            UUID     REFERENCES absences (id) ON DELETE SET NULL,
  teacher_id            UUID     NOT NULL REFERENCES teachers (id),
  original_absence_date DATE     NOT NULL,
  subject               TEXT     NOT NULL,
  class_name            TEXT     NOT NULL,
  remedial_date         DATE     NOT NULL,
  remedial_time         TIME     NOT NULL,
  duration_periods      SMALLINT CHECK (duration_periods > 0),
  topic                 TEXT,
  location_id           UUID     REFERENCES locations (id),
  location_name         TEXT,
  photo_url             TEXT,
  gps_coordinates       TEXT,
  status                TEXT     NOT NULL DEFAULT 'Scheduled'
                                 CHECK (status IN ('Scheduled','Completed','Verified','Cancelled')),
  verified_by           TEXT,
  verified_at           TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_remedial_teacher       ON remedial_lessons (teacher_id);
CREATE INDEX idx_remedial_school_status ON remedial_lessons (school_id, status);
CREATE INDEX idx_remedial_absence       ON remedial_lessons (absence_id);

-- =============================================================
-- AUTO-UPDATE updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schools_updated_at       BEFORE UPDATE ON schools        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_teachers_updated_at      BEFORE UPDATE ON teachers       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_timetable_updated_at     BEFORE UPDATE ON timetable      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_absences_updated_at      BEFORE UPDATE ON absences       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_remedial_updated_at      BEFORE UPDATE ON remedial_lessons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- VIEWS  (school-scoped)
-- =============================================================
CREATE VIEW v_todays_lessons AS
SELECT
  t.id, t.school_id, t.day_of_week, t.start_time, t.end_time,
  t.subject, t.class_name,
  te.id AS teacher_id, te.name AS teacher_name, te.email AS teacher_email
FROM timetable t
JOIN teachers te ON te.id = t.teacher_id
WHERE t.day_of_week = EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'Africa/Accra')::SMALLINT;

CREATE VIEW v_weekly_attendance_summary AS
SELECT
  te.id AS teacher_id, te.name AS teacher_name, te.school_id,
  a.week_number,
  DATE_TRUNC('week', a.date) AS week_start,
  COUNT(*)::int               AS sessions_recorded,
  SUM(a.periods)::int         AS total_periods
FROM attendance a
JOIN teachers te ON te.id = a.teacher_id
GROUP BY te.id, te.name, te.school_id, a.week_number, DATE_TRUNC('week', a.date);

CREATE VIEW v_outstanding_absences AS
SELECT
  ab.id, ab.school_id, ab.date, ab.subject, ab.class_name,
  ab.scheduled_period, ab.reason, ab.status,
  te.id AS teacher_id, te.name AS teacher_name
FROM absences ab
JOIN teachers te ON te.id = ab.teacher_id
WHERE ab.status = 'Absent'
  AND ab.is_auto_generated = true
  AND ab.date >= CURRENT_DATE - INTERVAL '30 days';
