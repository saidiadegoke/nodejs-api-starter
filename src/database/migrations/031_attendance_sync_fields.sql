ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS attendance_registration_code VARCHAR(100);
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS attendance_student_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_jupeb_registrations_attendance_student_id ON jupeb_registrations (attendance_student_id);
