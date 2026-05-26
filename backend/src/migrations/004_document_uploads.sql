-- Feature: Leave Request Supporting Documents
ALTER TABLE teacher_excuses
  ADD COLUMN IF NOT EXISTS document_url      TEXT,
  ADD COLUMN IF NOT EXISTS document_filename TEXT;

-- Feature: Meeting Minutes (admin-only)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS minutes_url         TEXT,
  ADD COLUMN IF NOT EXISTS minutes_filename    TEXT,
  ADD COLUMN IF NOT EXISTS minutes_uploaded_at TIMESTAMPTZ;
