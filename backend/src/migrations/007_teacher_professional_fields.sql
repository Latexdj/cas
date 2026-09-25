-- Migration 007: Additional teacher professional profile fields
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS area_of_specialization TEXT,
  ADD COLUMN IF NOT EXISTS date_of_first_appointment DATE,
  ADD COLUMN IF NOT EXISTS date_promoted_to_current_rank DATE,
  ADD COLUMN IF NOT EXISTS year_posted_to_present_station INTEGER,
  ADD COLUMN IF NOT EXISTS currently_teaching_subject_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS date_obtained_academic_qualification DATE,
  ADD COLUMN IF NOT EXISTS date_obtained_professional_qualification DATE;
