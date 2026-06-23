-- Promote management users to be linked to teaching staff.
-- management_role on the teachers table replaces the management_users table.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS management_role VARCHAR(50) DEFAULT NULL;
