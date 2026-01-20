-- ============================================================================
-- EARLY ADOPTERS TABLE
-- ============================================================================

-- Early Adopters table (for early adopter program registrations)
CREATE TABLE IF NOT EXISTS early_adopters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  contacted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_early_adopters_email ON early_adopters(email);
CREATE INDEX idx_early_adopters_status ON early_adopters(status);
CREATE INDEX idx_early_adopters_created_at ON early_adopters(created_at);

