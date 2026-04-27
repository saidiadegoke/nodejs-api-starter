-- JUPEB academic (phase 2): courses, per-registration grades, score snapshot

CREATE TABLE IF NOT EXISTS jupeb_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  title VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_courses_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_courses_code ON jupeb_courses (code);

CREATE INDEX IF NOT EXISTS idx_jupeb_courses_status ON jupeb_courses (status);

CREATE TABLE IF NOT EXISTS jupeb_registration_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES jupeb_courses(id) ON DELETE RESTRICT,
  grade CHAR(1) NOT NULL,
  plus_one_awarded BOOLEAN NOT NULL,
  entered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entered_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_reg_results_grade_check CHECK (grade IN ('A', 'B', 'C', 'D', 'E', 'F')),
  CONSTRAINT jupeb_reg_results_unique_course UNIQUE (registration_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_jupeb_reg_results_registration_id ON jupeb_registration_results (registration_id);
CREATE INDEX IF NOT EXISTS idx_jupeb_reg_results_course_id ON jupeb_registration_results (course_id);

CREATE TABLE IF NOT EXISTS jupeb_registration_scores (
  registration_id UUID PRIMARY KEY REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  passed_courses_count INTEGER NOT NULL,
  failed_courses_count INTEGER NOT NULL,
  plus_one_total INTEGER NOT NULL,
  computed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
