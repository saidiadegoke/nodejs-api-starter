-- ============================================================================
-- SITES & TEMPLATES
-- ============================================================================

-- Sites table (multi-tenant sites)
CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  primary_domain VARCHAR(255),
  engine_version VARCHAR(20) DEFAULT 'v1.0.0',
  status VARCHAR(50) DEFAULT 'active',
  owner_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sites_slug ON sites(slug);
CREATE INDEX idx_sites_primary_domain ON sites(primary_domain);
CREATE INDEX idx_sites_owner_id ON sites(owner_id);
CREATE INDEX idx_sites_status ON sites(status);

-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  preview_image_url TEXT,
  thumbnail_url TEXT,
  config JSONB NOT NULL,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_active ON templates(is_active);

-- Site templates (track which template a site uses)
CREATE TABLE IF NOT EXISTS site_templates (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  customization_settings JSONB,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  UNIQUE(site_id)
);

CREATE INDEX idx_site_templates_site_id ON site_templates(site_id);
CREATE INDEX idx_site_templates_template_id ON site_templates(template_id);

-- Custom domains table
CREATE TABLE IF NOT EXISTS custom_domains (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255),
  ssl_status VARCHAR(50) DEFAULT 'pending',
  ssl_provider VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_custom_domains_site_id ON custom_domains(site_id);
CREATE INDEX idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX idx_custom_domains_verified ON custom_domains(verified);

-- Site customization settings
CREATE TABLE IF NOT EXISTS site_customization (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL UNIQUE,
  colors JSONB,
  fonts JSONB,
  logo_url TEXT,
  spacing JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_site_customization_site_id ON site_customization(site_id);

-- ============================================================================
-- PAGES & CONTENT
-- ============================================================================

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  slug VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  content JSONB,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, slug)
);

CREATE INDEX idx_pages_site_id ON pages(site_id);
CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_pages_published ON pages(published);

-- Page versions (for version history)
CREATE TABLE IF NOT EXISTS page_versions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  content JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_page_versions_page_id ON page_versions(page_id);
CREATE INDEX idx_page_versions_created_at ON page_versions(created_at);

-- Components table (reusable components per site)
CREATE TABLE IF NOT EXISTS components (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_components_site_id ON components(site_id);
CREATE INDEX idx_components_type ON components(type);

-- Themes table (site themes)
CREATE TABLE IF NOT EXISTS themes (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  name VARCHAR(255),
  config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_themes_site_id ON themes(site_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_domains_updated_at BEFORE UPDATE ON custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_customization_updated_at BEFORE UPDATE ON site_customization
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_themes_updated_at BEFORE UPDATE ON themes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SITE STATUS HISTORY
-- ============================================================================

-- Site status history table
CREATE TABLE IF NOT EXISTS site_status_history (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  old_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_site_status_history_site_id ON site_status_history(site_id);
CREATE INDEX idx_site_status_history_created_at ON site_status_history(created_at);
CREATE INDEX idx_site_status_history_changed_by ON site_status_history(changed_by);

-- Add constraint to ensure status is valid
ALTER TABLE sites 
ADD CONSTRAINT check_status 
CHECK (status IN ('active', 'draft', 'suspended'));

-- ============================================================================
-- ENGINE VERSION HISTORY
-- ============================================================================

-- Engine version history table
CREATE TABLE IF NOT EXISTS engine_version_history (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  old_version VARCHAR(20) NOT NULL,
  new_version VARCHAR(20) NOT NULL,
  changed_by UUID NOT NULL,
  is_rollback BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_engine_version_history_site_id ON engine_version_history(site_id);
CREATE INDEX idx_engine_version_history_created_at ON engine_version_history(created_at);
CREATE INDEX idx_engine_version_history_changed_by ON engine_version_history(changed_by);


