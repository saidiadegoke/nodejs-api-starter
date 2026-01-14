-- ============================================================================
-- ADD LAYOUT SUPPORT AND DEFAULT PAGES FLAG
-- ============================================================================

-- Add default_layout_id to sites table
ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS default_layout_id VARCHAR(100) DEFAULT 'header-main-footer';

-- Add layout_id to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS layout_id VARCHAR(100);

-- Add is_default flag to pages table (marks default pages that cannot be deleted)
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Add status column to pages if it doesn't exist (for draft/published)
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';

-- Create index on layout_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_pages_layout_id ON pages(layout_id);
CREATE INDEX IF NOT EXISTS idx_pages_is_default ON pages(is_default);
CREATE INDEX IF NOT EXISTS idx_sites_default_layout_id ON sites(default_layout_id);

-- Add constraint to ensure status is valid
ALTER TABLE pages 
DROP CONSTRAINT IF EXISTS check_page_status;

ALTER TABLE pages 
ADD CONSTRAINT check_page_status 
CHECK (status IN ('published', 'draft', 'archived'));

-- Phase 3 Components Migration
-- Adds new components: FAQ, Stats, Team, Timeline, Search, Cookie Consent, Back to Top, Blog Grid
-- These components are implemented in smartstore-app/components/smartstore/[type]/index.tsx

INSERT INTO component_registry (name, type, component_type, category, description, config, is_system) VALUES
  -- Phase 3: Content Components
  (
    'FAQ Block',
    'system',
    'faq',
    'content',
    'Frequently Asked Questions with expandable accordion-style questions and answers',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "items": [],
        "template": "accordion",
        "defaultOpen": false
      },
      "defaultSettings": {
        "allowMultiple": false,
        "showCategories": false,
        "searchable": false,
        "iconPosition": "right",
        "iconStyle": "chevron"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "question": {"type": "string", "required": true},
                "answer": {"type": "string", "required": true},
                "category": {"type": "string"}
              }
            },
            "default": []
          },
          "template": {"type": "string", "options": ["accordion", "list", "grid"], "default": "accordion"},
          "defaultOpen": {"type": "boolean", "default": false}
        },
        "settings": {
          "allowMultiple": {"type": "boolean", "default": false, "description": "Allow multiple items open at once"},
          "showCategories": {"type": "boolean", "default": false},
          "searchable": {"type": "boolean", "default": false},
          "iconPosition": {"type": "string", "options": ["left", "right"], "default": "right"},
          "iconStyle": {"type": "string", "options": ["plus", "chevron", "arrow"], "default": "chevron"}
        }
      }
    }',
    true
  ),
  (
    'Stats/Counter Block',
    'system',
    'stats',
    'marketing',
    'Animated statistics and counters with icons',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "items": [],
        "template": "grid",
        "columns": 4
      },
      "defaultSettings": {
        "animate": true,
        "animationDuration": 2000,
        "iconStyle": "rounded",
        "iconSize": "md",
        "cardStyle": true,
        "alignment": "center"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": {"type": "string", "required": true},
                "value": {"type": "number", "required": true},
                "suffix": {"type": "string"},
                "prefix": {"type": "string"},
                "icon": {"type": "string"},
                "description": {"type": "string"}
              }
            },
            "default": []
          },
          "template": {"type": "string", "options": ["grid", "list", "cards"], "default": "grid"},
          "columns": {"type": "number", "default": 4, "min": 1, "max": 6}
        },
        "settings": {
          "animate": {"type": "boolean", "default": true},
          "animationDuration": {"type": "number", "default": 2000, "description": "Animation duration in milliseconds"},
          "iconStyle": {"type": "string", "options": ["filled", "outlined", "rounded", "square"], "default": "rounded"},
          "iconSize": {"type": "string", "options": ["sm", "md", "lg"], "default": "md"},
          "cardStyle": {"type": "boolean", "default": true},
          "alignment": {"type": "string", "options": ["left", "center", "right"], "default": "center"}
        }
      }
    }',
    true
  ),
  (
    'Team Block',
    'system',
    'team',
    'content',
    'Team member cards with photos, names, roles, and social links',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "members": [],
        "template": "grid",
        "columns": 3
      },
      "defaultSettings": {
        "showBio": true,
        "showEmail": false,
        "showSocialLinks": true,
        "cardStyle": true,
        "photoStyle": "circle",
        "alignment": "center"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "members": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string", "required": true},
                "role": {"type": "string", "required": true},
                "photo": {"type": "string"},
                "bio": {"type": "string"},
                "email": {"type": "string"},
                "socialLinks": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "platform": {"type": "string"},
                      "url": {"type": "string"},
                      "icon": {"type": "string"}
                    }
                  }
                }
              }
            },
            "default": []
          },
          "template": {"type": "string", "options": ["grid", "list", "cards"], "default": "grid"},
          "columns": {"type": "number", "default": 3, "min": 1, "max": 6}
        },
        "settings": {
          "showBio": {"type": "boolean", "default": true},
          "showEmail": {"type": "boolean", "default": false},
          "showSocialLinks": {"type": "boolean", "default": true},
          "cardStyle": {"type": "boolean", "default": true},
          "photoStyle": {"type": "string", "options": ["circle", "square", "rounded"], "default": "circle"},
          "alignment": {"type": "string", "options": ["left", "center", "right"], "default": "center"}
        }
      }
    }',
    true
  ),
  (
    'Timeline Block',
    'system',
    'timeline',
    'content',
    'Chronological timeline of events, milestones, or steps',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "items": [],
        "template": "vertical"
      },
      "defaultSettings": {
        "showDates": true,
        "showIcons": true,
        "showImages": false,
        "lineStyle": "solid",
        "iconStyle": "filled",
        "alignment": "left"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": {"type": "string", "required": true},
                "date": {"type": "string"},
                "description": {"type": "string"},
                "icon": {"type": "string"},
                "image": {"type": "string"},
                "status": {"type": "string", "options": ["completed", "current", "upcoming"]}
              }
            },
            "default": []
          },
          "template": {"type": "string", "options": ["vertical", "horizontal", "alternating"], "default": "vertical"}
        },
        "settings": {
          "showDates": {"type": "boolean", "default": true},
          "showIcons": {"type": "boolean", "default": true},
          "showImages": {"type": "boolean", "default": false},
          "lineStyle": {"type": "string", "options": ["solid", "dashed", "dotted"], "default": "solid"},
          "iconStyle": {"type": "string", "options": ["filled", "outlined", "rounded"], "default": "filled"},
          "alignment": {"type": "string", "options": ["left", "center", "right"], "default": "left"}
        }
      }
    }',
    true
  ),
  -- Phase 2: Navigation & Layout Components
  (
    'Search Block',
    'system',
    'search',
    'navigation',
    'Search input with autocomplete and results integration',
    '{
      "defaultContent": {
        "placeholder": "Search...",
        "buttonLabel": "Search",
        "template": "inline",
        "results": []
      },
      "defaultSettings": {
        "autocomplete": true,
        "minChars": 2,
        "searchUrl": "",
        "showButton": true,
        "iconPosition": "left",
        "debounceMs": 300
      },
      "schema": {
        "data": {
          "placeholder": {"type": "string", "default": "Search..."},
          "buttonLabel": {"type": "string", "default": "Search"},
          "template": {"type": "string", "options": ["inline", "modal", "dropdown"], "default": "inline"},
          "results": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": {"type": "string"},
                "url": {"type": "string"},
                "description": {"type": "string"},
                "type": {"type": "string"}
              }
            },
            "default": []
          }
        },
        "settings": {
          "autocomplete": {"type": "boolean", "default": true},
          "minChars": {"type": "number", "default": 2, "description": "Minimum characters before searching"},
          "searchUrl": {"type": "string", "description": "API endpoint for search"},
          "showButton": {"type": "boolean", "default": true},
          "iconPosition": {"type": "string", "options": ["left", "right"], "default": "left"},
          "debounceMs": {"type": "number", "default": 300, "description": "Debounce delay in milliseconds"}
        }
      }
    }',
    true
  ),
  (
    'Cookie Consent Block',
    'system',
    'cookie-consent',
    'utility',
    'GDPR-compliant cookie consent banner with preferences',
    '{
      "defaultContent": {
        "title": "Cookie Consent",
        "message": "We use cookies to enhance your browsing experience and analyze our traffic.",
        "acceptLabel": "Accept All",
        "rejectLabel": "Reject All",
        "preferencesLabel": "Preferences",
        "saveLabel": "Save Preferences",
        "categories": [],
        "template": "banner"
      },
      "defaultSettings": {
        "position": "bottom",
        "showPreferences": true,
        "expirationDays": 365,
        "cookieName": "cookie-consent"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "default": "Cookie Consent"},
          "message": {"type": "string", "default": "We use cookies to enhance your browsing experience and analyze our traffic."},
          "acceptLabel": {"type": "string", "default": "Accept All"},
          "rejectLabel": {"type": "string", "default": "Reject All"},
          "preferencesLabel": {"type": "string", "default": "Preferences"},
          "saveLabel": {"type": "string", "default": "Save Preferences"},
          "categories": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "required": {"type": "boolean"},
                "enabled": {"type": "boolean"}
              }
            },
            "default": []
          },
          "template": {"type": "string", "options": ["banner", "modal", "inline"], "default": "banner"}
        },
        "settings": {
          "position": {"type": "string", "options": ["top", "bottom"], "default": "bottom"},
          "showPreferences": {"type": "boolean", "default": true},
          "expirationDays": {"type": "number", "default": 365, "description": "Cookie expiration in days"},
          "cookieName": {"type": "string", "default": "cookie-consent", "description": "Name of the consent cookie"}
        }
      }
    }',
    true
  ),
  (
    'Back to Top Block',
    'system',
    'back-to-top',
    'utility',
    'Scroll-to-top button that appears after scrolling',
    '{
      "defaultContent": {
        "label": "Back to Top",
        "icon": "↑",
        "template": "floating"
      },
      "defaultSettings": {
        "showAfter": 400,
        "position": "bottom-right",
        "smooth": true,
        "animation": "fade"
      },
      "schema": {
        "data": {
          "label": {"type": "string", "default": "Back to Top"},
          "icon": {"type": "string", "default": "↑"},
          "template": {"type": "string", "options": ["button", "floating", "fixed"], "default": "floating"}
        },
        "settings": {
          "showAfter": {"type": "number", "default": 400, "description": "Pixels to scroll before showing"},
          "position": {"type": "string", "options": ["bottom-right", "bottom-left", "top-right", "top-left"], "default": "bottom-right"},
          "smooth": {"type": "boolean", "default": true, "description": "Smooth scroll behavior"},
          "animation": {"type": "string", "options": ["fade", "slide", "scale"], "default": "fade"}
        }
      }
    }',
    true
  ),
  (
    'Blog Grid Block',
    'system',
    'blog-grid',
    'content',
    'Grid of blog post cards with featured images, titles, excerpts, and metadata',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "posts": [],
        "template": "grid",
        "columns": 3,
        "featuredPost": null
      },
      "defaultSettings": {
        "showAuthor": true,
        "showDate": true,
        "showCategory": true,
        "showTags": false,
        "showReadTime": true,
        "cardStyle": true,
        "imageAspectRatio": "landscape"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "posts": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {"type": "string", "required": true},
                "title": {"type": "string", "required": true},
                "excerpt": {"type": "string"},
                "featuredImage": {"type": "string"},
                "author": {
                  "type": "object",
                  "properties": {
                    "name": {"type": "string"},
                    "avatar": {"type": "string"}
                  }
                },
                "publishDate": {"type": "string"},
                "category": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "readTime": {"type": "number"},
                "url": {"type": "string", "required": true}
              }
            },
            "default": []
          },
          "template": {"type": "string", "options": ["grid", "list", "masonry", "featured-first"], "default": "grid"},
          "columns": {"type": "number", "default": 3, "min": 1, "max": 6},
          "featuredPost": {"type": "object", "description": "Featured post for featured-first template"}
        },
        "settings": {
          "showAuthor": {"type": "boolean", "default": true},
          "showDate": {"type": "boolean", "default": true},
          "showCategory": {"type": "boolean", "default": true},
          "showTags": {"type": "boolean", "default": false},
          "showReadTime": {"type": "boolean", "default": true},
          "cardStyle": {"type": "boolean", "default": true},
          "imageAspectRatio": {"type": "string", "options": ["square", "landscape", "portrait", "auto"], "default": "landscape"}
        }
      }
    }',
    true
  )
ON CONFLICT (component_type) WHERE is_system = true AND type = 'system'
DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  config = EXCLUDED.config,
  updated_at = CURRENT_TIMESTAMP;


-- Migration 009: Create deployments table for tracking site deployments
-- This table tracks deployment history and status for sites

CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  deployed_at TIMESTAMP,
  deployed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deployment_url VARCHAR(500),
  error_message TEXT,
  deployment_metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT deployments_status_check CHECK (status IN ('pending', 'building', 'success', 'failed', 'cancelled'))
);

-- Indexes for efficient queries
CREATE INDEX idx_deployments_site_id ON deployments(site_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_deployed_at ON deployments(deployed_at DESC);
CREATE INDEX idx_deployments_deployed_by ON deployments(deployed_by);

-- Composite index for common queries
CREATE INDEX idx_deployments_site_status ON deployments(site_id, status);

-- Add comment
COMMENT ON TABLE deployments IS 'Tracks deployment history and status for sites';
COMMENT ON COLUMN deployments.status IS 'Deployment status: pending, building, success, failed, cancelled';
COMMENT ON COLUMN deployments.deployment_url IS 'URL where the site is deployed (subdomain or custom domain)';
COMMENT ON COLUMN deployments.deployment_metadata IS 'Additional deployment information (JSON)';

-- ============================================================================
-- SSL CERTIFICATE MANAGEMENT
-- ============================================================================
-- This migration creates tables for managing SSL certificates and their
-- domain assignments, enabling automatic certificate management for thousands
-- of custom domains using Cloudflare Origin Certificates.

-- SSL Certificates table - tracks all certificates
CREATE TABLE IF NOT EXISTS ssl_certificates (
  id SERIAL PRIMARY KEY,
  certificate_name VARCHAR(255) NOT NULL,
  cloudflare_cert_id VARCHAR(255), -- Cloudflare certificate ID
  cert_path VARCHAR(500) NOT NULL,
  key_path VARCHAR(500) NOT NULL,
  domains_count INTEGER DEFAULT 0,
  max_domains INTEGER DEFAULT 50,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'full', 'expired', 'archived'
  certificate_type VARCHAR(50) DEFAULT 'multi_domain', -- 'wildcard', 'multi_domain'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  notes TEXT
);

CREATE INDEX idx_ssl_certificates_status ON ssl_certificates(status);
CREATE INDEX idx_ssl_certificates_domains_count ON ssl_certificates(domains_count);
CREATE INDEX idx_ssl_certificates_cloudflare_cert_id ON ssl_certificates(cloudflare_cert_id);

-- Certificate-Domain mapping table - maps domains to certificates
CREATE TABLE IF NOT EXISTS ssl_certificate_domains (
  id SERIAL PRIMARY KEY,
  certificate_id INTEGER NOT NULL REFERENCES ssl_certificates(id) ON DELETE CASCADE,
  custom_domain_id INTEGER REFERENCES custom_domains(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain)
);

-- Partial unique index: Only one certificate per custom_domain_id (when not NULL)
-- This allows multiple NULL values for base domains
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssl_cert_domains_custom_domain_unique 
ON ssl_certificate_domains(custom_domain_id) 
WHERE custom_domain_id IS NOT NULL;

CREATE INDEX idx_ssl_cert_domains_cert_id ON ssl_certificate_domains(certificate_id);
CREATE INDEX idx_ssl_cert_domains_domain ON ssl_certificate_domains(domain);
CREATE INDEX idx_ssl_cert_domains_custom_domain_id ON ssl_certificate_domains(custom_domain_id);

-- Add certificate_id to custom_domains table
ALTER TABLE custom_domains 
ADD COLUMN IF NOT EXISTS certificate_id INTEGER REFERENCES ssl_certificates(id);

CREATE INDEX IF NOT EXISTS idx_custom_domains_certificate_id ON custom_domains(certificate_id);


-- Migration: Add provider support for SSL certificates
-- This allows tracking whether certificates are from Cloudflare or Let's Encrypt

-- Add provider column to ssl_certificates table
ALTER TABLE ssl_certificates 
ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'cloudflare' CHECK (provider IN ('cloudflare', 'letsencrypt'));

-- Update existing certificates to have provider
UPDATE ssl_certificates SET provider = 'cloudflare' WHERE provider IS NULL;

-- Create index for provider lookups
CREATE INDEX IF NOT EXISTS idx_ssl_certificates_provider ON ssl_certificates(provider);

-- Add provider to custom_domains ssl_provider if not exists (should already exist)
-- This is just for reference, the main tracking is in ssl_certificates

COMMENT ON COLUMN ssl_certificates.provider IS 'SSL certificate provider: cloudflare or letsencrypt';

