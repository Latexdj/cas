-- =============================================================
-- Run this in Supabase SQL Editor to apply multi-tenant changes.
-- Safe to run because all tables are currently empty.
-- =============================================================

-- 1. Drop existing empty tables and objects
DROP VIEW  IF EXISTS v_outstanding_absences, v_weekly_attendance_summary, v_todays_lessons CASCADE;
DROP TABLE IF EXISTS remedial_lessons, absences, attendance, timetable, locations, academic_years, teachers CASCADE;
DROP FUNCTION IF EXISTS set_updated_at CASCADE;

-- 2. Recreate everything with multi-tenancy
-- (copy and paste the full contents of db/schema.sql below this line)
