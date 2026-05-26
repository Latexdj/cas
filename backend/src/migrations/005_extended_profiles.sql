-- Migration 005: Extended teacher and student profile fields

-- ── Teachers ─────────────────────────────────────────────────────────────────
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS gov_staff_id              TEXT,
  ADD COLUMN IF NOT EXISTS rank                      TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth             DATE,
  ADD COLUMN IF NOT EXISTS gender                    TEXT,
  ADD COLUMN IF NOT EXISTS registered_number         TEXT,
  ADD COLUMN IF NOT EXISTS ntc_number                TEXT,
  ADD COLUMN IF NOT EXISTS ssf_number                TEXT,
  ADD COLUMN IF NOT EXISTS academic_qualification    TEXT,
  ADD COLUMN IF NOT EXISTS professional_qualification TEXT,
  ADD COLUMN IF NOT EXISTS additional_responsibility TEXT,
  ADD COLUMN IF NOT EXISTS bank                      TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch               TEXT,
  ADD COLUMN IF NOT EXISTS account_number            TEXT,
  ADD COLUMN IF NOT EXISTS religion                  TEXT,
  ADD COLUMN IF NOT EXISTS religious_denomination    TEXT,
  ADD COLUMN IF NOT EXISTS hometown                  TEXT,
  ADD COLUMN IF NOT EXISTS residential_address       TEXT,
  ADD COLUMN IF NOT EXISTS association               TEXT,
  ADD COLUMN IF NOT EXISTS ghana_card_number         TEXT,
  ADD COLUMN IF NOT EXISTS certificate_url           TEXT,
  ADD COLUMN IF NOT EXISTS certificate_filename      TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone   TEXT;

-- photo_url already added in a prior migration; ADD COLUMN IF NOT EXISTS is safe to repeat
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ── Students ─────────────────────────────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS jhs_index_number    TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth       DATE,
  ADD COLUMN IF NOT EXISTS gender              TEXT,
  ADD COLUMN IF NOT EXISTS hometown            TEXT,
  ADD COLUMN IF NOT EXISTS residential_address TEXT,
  ADD COLUMN IF NOT EXISTS ghana_card_number   TEXT,
  ADD COLUMN IF NOT EXISTS nhia_number         TEXT,
  ADD COLUMN IF NOT EXISTS mobile_number       TEXT,
  ADD COLUMN IF NOT EXISTS aggregate           INTEGER,
  ADD COLUMN IF NOT EXISTS house               TEXT,
  ADD COLUMN IF NOT EXISTS religion            TEXT,
  ADD COLUMN IF NOT EXISTS religious_denomination TEXT,
  ADD COLUMN IF NOT EXISTS guardian_name       TEXT,
  ADD COLUMN IF NOT EXISTS guardian_occupation TEXT,
  ADD COLUMN IF NOT EXISTS guardian_mobile     TEXT,
  ADD COLUMN IF NOT EXISTS picture_url         TEXT,
  ADD COLUMN IF NOT EXISTS residential_status  TEXT;
