-- Component Registry Table (Global Component Registry)
-- Components are stored globally and can be system or user-created
-- Component implementations (React code) live in smartstore-app
-- This table only stores component definitions/metadata

CREATE TABLE IF NOT EXISTS component_registry (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('system', 'custom', 'composite')),
  -- For system components: component_type maps to React component in smartstore-app
  -- For custom components: component_type is the custom name, base_component_type references system component
  -- For composite components: component_type is the composite name
  component_type VARCHAR(100) NOT NULL,
  base_component_type VARCHAR(100), -- For custom components: references the system component it's based on
  category VARCHAR(50) CHECK (category IN ('layout', 'content', 'marketing', 'ecommerce', 'utility', 'navigation')),
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}', -- Component configuration:
  -- For system components: default settings/content structure
  -- For custom components: saved configuration (overrides system defaults)
  -- For composite components: layout, responsive breakpoints, children array
  is_system BOOLEAN DEFAULT false, -- true = system component (has React implementation), false = user-created (custom or composite)
  created_by UUID, -- User who created (null for system components)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  -- Note: base_component_type references system components by component_type
  -- This is validated in application code, not via foreign key constraint
  -- (component_type is only unique for system components, not globally)
);

-- Indexes
CREATE INDEX idx_component_registry_type ON component_registry(type);
CREATE INDEX idx_component_registry_category ON component_registry(category);
CREATE INDEX idx_component_registry_component_type ON component_registry(component_type);
CREATE INDEX idx_component_registry_base_component_type ON component_registry(base_component_type);
CREATE INDEX idx_component_registry_is_system ON component_registry(is_system);
CREATE INDEX idx_component_registry_created_by ON component_registry(created_by);

-- Unique constraint: component_type should be unique for system components (they map to React implementations)
CREATE UNIQUE INDEX idx_component_registry_system_component_type 
  ON component_registry(component_type) 
  WHERE is_system = true AND type = 'system';

-- Trigger for updated_at
CREATE TRIGGER update_component_registry_updated_at 
  BEFORE UPDATE ON component_registry
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert system components (ONLY components that are implemented in smartstore-app)
-- These map to React components in smartstore-app/components/smartstore/[type]/index.tsx
-- Type = 'system' means they have React implementations in smartstore-app
-- IMPORTANT: Only add components here that actually exist in smartstore-app!
-- 
-- Flow: smartstore-app (React impl) -> smartstore-api (registry) -> smartstore-web (management UI)
--
-- Current implementation status:
-- Phase 1 - Essential Components: ✅ Complete
-- Phase 2 - Content & Marketing: ✅ Complete (Priority P1)
--
-- Phase 1:
-- ✅ text - Implemented at smartstore-app/components/smartstore/text/index.tsx
-- ✅ image - Implemented at smartstore-app/components/smartstore/image/index.tsx
-- ✅ spacer - Implemented at smartstore-app/components/smartstore/spacer/index.tsx
-- ✅ divider - Implemented at smartstore-app/components/smartstore/divider/index.tsx
-- ✅ container - Implemented at smartstore-app/components/smartstore/container/index.tsx
-- ✅ hero - Implemented at smartstore-app/components/smartstore/hero/index.tsx
-- ✅ topnav - Implemented at smartstore-app/components/smartstore/topnav/index.tsx
-- ✅ footer - Implemented at smartstore-app/components/smartstore/footer/index.tsx
-- ✅ grid - Implemented at smartstore-app/components/smartstore/grid/index.tsx
-- ✅ section - Implemented at smartstore-app/components/smartstore/section/index.tsx
-- ✅ imagebanner - Implemented at smartstore-app/components/smartstore/imagebanner/index.tsx
-- ✅ form - Implemented at smartstore-app/components/smartstore/form/index.tsx
--
-- Phase 2 (Priority P1):
-- ✅ video - Implemented at smartstore-app/components/smartstore/video/index.tsx
-- ✅ breadcrumbs - Implemented at smartstore-app/components/smartstore/breadcrumbs/index.tsx
-- ✅ cta - Implemented at smartstore-app/components/smartstore/cta/index.tsx
-- ✅ features - Implemented at smartstore-app/components/smartstore/features/index.tsx
-- ✅ testimonials - Implemented at smartstore-app/components/smartstore/testimonials/index.tsx
-- ✅ contactform - Implemented at smartstore-app/components/smartstore/contactform/index.tsx
-- ✅ newsletter - Implemented at smartstore-app/components/smartstore/newsletter/index.tsx
-- ✅ gallery - Implemented at smartstore-app/components/smartstore/gallery/index.tsx
-- ✅ columns - Implemented at smartstore-app/components/smartstore/columns/index.tsx

INSERT INTO component_registry (name, type, component_type, category, description, config, is_system) VALUES
  -- Basic Components
  (
    'Text Block', 
    'system', 
    'text', 
    'content', 
    'Rich text content block - can be configured as paragraph, heading, etc. with size, color, alignment',
    '{
      "defaultContent": {
        "text": "",
        "heading": "",
        "subheading": "",
        "alignment": "left",
        "size": "md"
      },
      "defaultSettings": {
        "richText": false,
        "allowHtml": false
      },
      "schema": {
        "data": {
          "text": {"type": "string", "description": "Text content"},
          "heading": {"type": "string", "description": "Heading text"},
          "subheading": {"type": "string", "description": "Subheading text"},
          "alignment": {"type": "string", "options": ["left", "center", "right"], "default": "left"},
          "size": {"type": "string", "options": ["sm", "md", "lg", "xl"], "default": "md"}
        },
        "settings": {
          "richText": {"type": "boolean", "default": false},
          "allowHtml": {"type": "boolean", "default": false}
        }
      }
    }', 
    true
  ),
  (
    'Image Block',
    'system',
    'image',
    'content',
    'Single image with optional caption and link',
    '{
      "defaultContent": {
        "src": "",
        "alt": "",
        "caption": "",
        "width": "",
        "height": "",
        "objectFit": "cover",
        "linkUrl": "",
        "linkTarget": "_self"
      },
      "defaultSettings": {
        "lazyLoad": true,
        "placeholder": "",
        "aspectRatio": ""
      },
      "schema": {
        "data": {
          "src": {"type": "string", "required": true, "description": "Image URL"},
          "alt": {"type": "string", "description": "Alt text"},
          "caption": {"type": "string", "description": "Image caption"},
          "width": {"type": "string", "description": "Width (px, %, rem)"},
          "height": {"type": "string", "description": "Height (px, %, rem)"},
          "objectFit": {"type": "string", "options": ["contain", "cover", "fill", "none", "scale-down"], "default": "cover"},
          "linkUrl": {"type": "string", "description": "Optional link URL"},
          "linkTarget": {"type": "string", "options": ["_self", "_blank"], "default": "_self"}
        },
        "settings": {
          "lazyLoad": {"type": "boolean", "default": true},
          "placeholder": {"type": "string", "description": "Placeholder image URL"},
          "aspectRatio": {"type": "string", "description": "Aspect ratio (e.g., 16:9, 4:3)"}
        }
      }
    }',
    true
  ),
  (
    'Spacer Block',
    'system',
    'spacer',
    'utility',
    'Vertical or horizontal spacing between blocks',
    '{
      "defaultContent": {
        "height": "2rem",
        "width": "",
        "responsive": {}
      },
      "defaultSettings": {
        "unit": "rem",
        "orientation": "vertical"
      },
      "schema": {
        "data": {
          "height": {"type": "string", "description": "Vertical spacing"},
          "width": {"type": "string", "description": "Horizontal spacing"},
          "responsive": {"type": "object", "description": "Responsive spacing settings"}
        },
        "settings": {
          "unit": {"type": "string", "options": ["px", "rem", "vh", "vw", "em"], "default": "rem"},
          "orientation": {"type": "string", "options": ["vertical", "horizontal"], "default": "vertical"}
        }
      }
    }',
    true
  ),
  (
    'Divider Block',
    'system',
    'divider',
    'utility',
    'Horizontal or vertical divider line',
    '{
      "defaultContent": {
        "style": "solid",
        "color": "#e5e7eb",
        "thickness": "1px",
        "width": "100%",
        "margin": "1rem"
      },
      "defaultSettings": {
        "orientation": "horizontal"
      },
      "schema": {
        "data": {
          "style": {"type": "string", "options": ["solid", "dashed", "dotted", "double"], "default": "solid"},
          "color": {"type": "string", "default": "#e5e7eb"},
          "thickness": {"type": "string", "default": "1px"},
          "width": {"type": "string", "default": "100%"},
          "margin": {"type": "string", "default": "1rem"}
        },
        "settings": {
          "orientation": {"type": "string", "options": ["horizontal", "vertical"], "default": "horizontal"}
        }
      }
    }',
    true
  ),
  (
    'Container Block',
    'system',
    'container',
    'layout',
    'Content wrapper with max-width constraints',
    '{
      "defaultContent": {
        "maxWidth": "1200px",
        "padding": "1rem",
        "fluid": false,
        "centered": true
      },
      "defaultSettings": {
        "responsivePadding": true,
        "unit": "px"
      },
      "schema": {
        "data": {
          "maxWidth": {"type": "string", "description": "Maximum width"},
          "padding": {"type": "string", "description": "Padding"},
          "fluid": {"type": "boolean", "default": false},
          "centered": {"type": "boolean", "default": true}
        },
        "settings": {
          "responsivePadding": {"type": "boolean", "default": true},
          "unit": {"type": "string", "options": ["px", "rem", "em", "%"], "default": "px"}
        }
      }
    }',
    true
  ),
  -- Complex Components
  (
    'Hero Block',
    'system',
    'hero',
    'marketing',
    'Hero section with headline, subheadline, CTA buttons, and optional background. Template variants: center, left, right, split, minimal, overlay',
    '{
      "defaultContent": {
        "headline": "",
        "subheadline": "",
        "backgroundImage": "",
        "backgroundVideo": "",
        "ctaButtons": [],
        "template": "center",
        "alignment": "center",
        "theme": "light",
        "textColor": "",
        "backgroundColor": "",
        "imagePosition": {}
      },
      "defaultSettings": {
        "fullHeight": false,
        "overlay": false,
        "overlayOpacity": 0.4,
        "parallax": false,
        "backgroundPosition": "center center",
        "contentMaxWidth": "800px",
        "minHeight": "400px"
      },
      "schema": {
        "data": {
          "headline": {"type": "string", "description": "Main headline"},
          "subheadline": {"type": "string", "description": "Subheadline text"},
          "backgroundImage": {"type": "string", "description": "Background image URL"},
          "backgroundVideo": {"type": "string", "description": "Background video URL"},
          "ctaButtons": {"type": "array", "description": "Call-to-action buttons"},
          "template": {"type": "string", "options": ["center", "left", "right", "split", "minimal", "overlay"], "default": "center"},
          "alignment": {"type": "string", "options": ["left", "center", "right"], "default": "center"},
          "theme": {"type": "string", "options": ["light", "dark", "custom"], "default": "light"}
        },
        "settings": {
          "fullHeight": {"type": "boolean", "default": false},
          "overlay": {"type": "boolean", "default": false},
          "overlayOpacity": {"type": "number", "default": 0.4},
          "parallax": {"type": "boolean", "default": false}
        }
      }
    }',
    true
  ),
  (
    'Top Navigation',
    'system',
    'topnav',
    'navigation',
    'Top navigation bar with logo, links, and optional CTA button. Template variants: default, centered, minimal, transparent, sticky, split',
    '{
      "defaultContent": {
        "logo": "",
        "logoUrl": "/",
        "links": [],
        "ctaButton": null,
        "template": "default",
        "theme": "light",
        "transparent": false,
        "sticky": false
      },
      "defaultSettings": {
        "mobileMenuStyle": "drawer",
        "breakpoint": 768,
        "position": "static"
      },
      "schema": {
        "data": {
          "logo": {"type": "string", "description": "Logo image URL"},
          "logoUrl": {"type": "string", "default": "/"},
          "links": {"type": "array", "description": "Navigation links"},
          "ctaButton": {"type": "object", "description": "CTA button config"},
          "template": {"type": "string", "options": ["default", "centered", "minimal", "transparent", "sticky", "split"], "default": "default"},
          "theme": {"type": "string", "options": ["light", "dark", "custom"], "default": "light"}
        },
        "settings": {
          "mobileMenuStyle": {"type": "string", "options": ["drawer", "accordion"], "default": "drawer"},
          "breakpoint": {"type": "number", "default": 768}
        }
      }
    }',
    true
  ),
  (
    'Footer',
    'system',
    'footer',
    'navigation',
    'Site footer with logo, link columns, social links, and copyright. Template variants: minimal, standard, multi-column, dark',
    '{
      "defaultContent": {
        "logo": "",
        "logoUrl": "/",
        "columns": [],
        "socialLinks": [],
        "copyright": "",
        "template": "standard",
        "theme": "light",
        "background": ""
      },
      "defaultSettings": {
        "columnsLayout": 3,
        "responsive": true,
        "spacing": "2rem"
      },
      "schema": {
        "data": {
          "logo": {"type": "string", "description": "Logo image URL"},
          "logoUrl": {"type": "string", "default": "/"},
          "columns": {"type": "array", "description": "Footer link columns"},
          "socialLinks": {"type": "array", "description": "Social media links"},
          "copyright": {"type": "string", "description": "Copyright text"},
          "template": {"type": "string", "options": ["minimal", "standard", "multi-column", "dark"], "default": "standard"},
          "theme": {"type": "string", "options": ["light", "dark", "custom"], "default": "light"}
        },
        "settings": {
          "columnsLayout": {"type": "number", "options": [2, 3, 4], "default": 3},
          "responsive": {"type": "boolean", "default": true}
        }
      }
    }',
    true
  ),
  (
    'Grid Block',
    'system',
    'grid',
    'layout',
    'Responsive grid layout for components. Template variants: equal, masonry, cards, list',
    '{
      "defaultContent": {
        "items": [],
        "columns": 3,
        "gap": "1rem",
        "template": "equal",
        "spacing": "",
        "responsive": {}
      },
      "defaultSettings": {
        "equalHeight": false,
        "alignItems": "stretch",
        "justifyContent": "start",
        "cardStyle": false
      },
      "schema": {
        "data": {
          "items": {"type": "array", "description": "Blocks to render in grid"},
          "columns": {"type": "number", "default": 3},
          "gap": {"type": "string", "default": "1rem"},
          "template": {"type": "string", "options": ["equal", "masonry", "cards", "list"], "default": "equal"},
          "spacing": {"type": "string", "description": "Grid spacing"}
        },
        "settings": {
          "equalHeight": {"type": "boolean", "default": false},
          "alignItems": {"type": "string", "options": ["start", "center", "end", "stretch"], "default": "stretch"},
          "cardStyle": {"type": "boolean", "default": false}
        }
      }
    }',
    true
  ),
  (
    'Section Block',
    'system',
    'section',
    'layout',
    'Page section with background, padding, and content area. Template variants: default, wide, boxed, full-width, alternating',
    '{
      "defaultContent": {
        "background": "",
        "backgroundImage": "",
        "padding": "4rem 2rem",
        "children": [],
        "template": "default",
        "theme": "light",
        "spacing": ""
      },
      "defaultSettings": {
        "fullWidth": false,
        "overlay": false,
        "overlayOpacity": 0.4,
        "containerMaxWidth": "1200px",
        "backgroundSize": "cover",
        "backgroundPosition": "center center"
      },
      "schema": {
        "data": {
          "background": {"type": "string", "description": "Background color"},
          "backgroundImage": {"type": "string", "description": "Background image URL"},
          "padding": {"type": "string", "default": "4rem 2rem"},
          "children": {"type": "array", "description": "Blocks/component references"},
          "template": {"type": "string", "options": ["default", "wide", "boxed", "full-width", "alternating"], "default": "default"},
          "theme": {"type": "string", "options": ["light", "dark", "custom"], "default": "light"}
        },
        "settings": {
          "fullWidth": {"type": "boolean", "default": false},
          "overlay": {"type": "boolean", "default": false},
          "overlayOpacity": {"type": "number", "default": 0.4}
        }
      }
    }',
    true
  ),
  (
    'Image Banner',
    'system',
    'imagebanner',
    'marketing',
    'Full-width image banner with optional overlay content. Template variants: overlay, parallax, fixed, split',
    '{
      "defaultContent": {
        "image": "",
        "overlay": true,
        "content": null,
        "template": "overlay",
        "alignment": "center",
        "height": "",
        "theme": "light",
        "textColor": "",
        "overlayColor": "#000000"
      },
      "defaultSettings": {
        "parallax": false,
        "fixed": false,
        "overlayOpacity": 0.5,
        "backgroundSize": "cover",
        "contentPosition": {},
        "minHeight": "400px"
      },
      "schema": {
        "data": {
          "image": {"type": "string", "required": true, "description": "Background image URL"},
          "overlay": {"type": "boolean", "default": true},
          "content": {"type": "object", "description": "Content block to render"},
          "template": {"type": "string", "options": ["overlay", "parallax", "fixed", "split"], "default": "overlay"},
          "alignment": {"type": "string", "options": ["left", "center", "right", "top", "bottom"], "default": "center"},
          "theme": {"type": "string", "options": ["light", "dark"], "default": "light"}
        },
        "settings": {
          "parallax": {"type": "boolean", "default": false},
          "fixed": {"type": "boolean", "default": false},
          "overlayOpacity": {"type": "number", "default": 0.5}
        }
      }
    }',
    true
  ),
  (
    'Form Block',
    'system',
    'form',
    'utility',
    'Form with configurable fields and submission handling. Template variants: default, inline, compact, multi-step',
    '{
      "defaultContent": {
        "title": "",
        "description": "",
        "fields": [],
        "submitLabel": "Submit",
        "actionUrl": "",
        "method": "POST",
        "template": "default",
        "layout": "vertical"
      },
      "defaultSettings": {
        "successMessage": "Form submitted successfully!",
        "errorMessage": "There was an error submitting the form.",
        "redirectUrl": "",
        "fieldSpacing": "1rem",
        "labelPosition": "top",
        "submitButtonStyle": "primary"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Form title"},
          "description": {"type": "string", "description": "Form description"},
          "fields": {"type": "array", "required": true, "description": "Form fields"},
          "submitLabel": {"type": "string", "default": "Submit"},
          "actionUrl": {"type": "string", "description": "Form submission URL"},
          "method": {"type": "string", "options": ["GET", "POST"], "default": "POST"},
          "template": {"type": "string", "options": ["default", "inline", "compact", "multi-step"], "default": "default"},
          "layout": {"type": "string", "options": ["vertical", "horizontal"], "default": "vertical"}
        },
        "settings": {
          "successMessage": {"type": "string", "default": "Form submitted successfully!"},
          "errorMessage": {"type": "string", "default": "There was an error submitting the form."},
          "labelPosition": {"type": "string", "options": ["top", "left", "inline"], "default": "top"}
        }
      }
    }',
    true
  ),
  -- Phase 2: Content & Marketing Components (Priority P1)
  (
    'Video Block',
    'system',
    'video',
    'content',
    'Video content from YouTube, Vimeo, or self-hosted sources',
    '{
      "defaultContent": {
        "src": "",
        "provider": "self-hosted",
        "videoId": "",
        "poster": "",
        "autoplay": false,
        "loop": false,
        "muted": false,
        "controls": true,
        "caption": "",
        "width": "",
        "height": ""
      },
      "defaultSettings": {
        "aspectRatio": "16:9",
        "maxWidth": "",
        "responsive": true,
        "lazyLoad": false
      },
      "schema": {
        "data": {
          "src": {"type": "string", "description": "Self-hosted video URL"},
          "provider": {"type": "string", "options": ["youtube", "vimeo", "self-hosted", "custom"], "default": "self-hosted"},
          "videoId": {"type": "string", "description": "YouTube/Vimeo video ID"},
          "poster": {"type": "string", "description": "Thumbnail image URL"},
          "autoplay": {"type": "boolean", "default": false},
          "loop": {"type": "boolean", "default": false},
          "muted": {"type": "boolean", "default": false},
          "controls": {"type": "boolean", "default": true},
          "caption": {"type": "string", "description": "Video caption"}
        },
        "settings": {
          "aspectRatio": {"type": "string", "default": "16:9"},
          "responsive": {"type": "boolean", "default": true},
          "lazyLoad": {"type": "boolean", "default": false}
        }
      }
    }',
    true
  ),
  (
    'Breadcrumbs',
    'system',
    'breadcrumbs',
    'navigation',
    'Navigation breadcrumb trail',
    '{
      "defaultContent": {
        "items": [],
        "separator": "/",
        "showHome": true,
        "homeUrl": "/",
        "homeLabel": "Home"
      },
      "defaultSettings": {
        "maxItems": null,
        "collapse": false,
        "showCurrentAsLink": false
      },
      "schema": {
        "data": {
          "items": {"type": "array", "description": "Breadcrumb items array with label, url, and optional icon"},
          "separator": {"type": "string", "options": ["/", ">", "|", "•"], "default": "/", "description": "Separator between breadcrumb items"},
          "showHome": {"type": "boolean", "default": true, "description": "Show home link"},
          "homeUrl": {"type": "string", "default": "/", "description": "Home URL"},
          "homeLabel": {"type": "string", "default": "Home", "description": "Home link label"}
        },
        "settings": {
          "maxItems": {"type": "number", "description": "Maximum items to display before collapsing"},
          "collapse": {"type": "boolean", "default": false, "description": "Collapse middle items when maxItems is exceeded"},
          "showCurrentAsLink": {"type": "boolean", "default": false, "description": "Show current page as a clickable link"}
        }
      }
    }',
    true
  ),
  (
    'CTA Block',
    'system',
    'cta',
    'marketing',
    'Standalone call-to-action blocks with headline, description, and buttons',
    '{
      "defaultContent": {
        "headline": "",
        "description": "",
        "buttonLabel": "Get Started",
        "buttonUrl": "#",
        "buttonVariant": "primary",
        "buttonTarget": "_self",
        "secondaryButton": null,
        "background": "",
        "backgroundImage": ""
      },
      "defaultSettings": {
        "centered": true,
        "compact": false,
        "backgroundOverlay": false,
        "backgroundOverlayOpacity": 0.4,
        "maxWidth": "800px"
      },
      "schema": {
        "data": {
          "headline": {"type": "string", "description": "Headline text"},
          "description": {"type": "string", "description": "Description text"},
          "buttonLabel": {"type": "string", "default": "Get Started", "description": "Primary button label"},
          "buttonUrl": {"type": "string", "default": "#", "description": "Primary button URL"},
          "buttonVariant": {"type": "string", "options": ["primary", "secondary", "outline"], "default": "primary", "description": "Primary button style variant"},
          "buttonTarget": {"type": "string", "options": ["_self", "_blank"], "default": "_self", "description": "Primary button link target"},
          "secondaryButton": {"type": "object", "description": "Secondary button configuration with label, url, variant, and target"},
          "background": {"type": "string", "description": "Background color (hex, rgb, or CSS color name)"},
          "backgroundImage": {"type": "string", "description": "Background image URL"}
        },
        "settings": {
          "centered": {"type": "boolean", "default": true, "description": "Center align content"},
          "compact": {"type": "boolean", "default": false, "description": "Use compact spacing"},
          "backgroundOverlay": {"type": "boolean", "default": false, "description": "Add overlay when using background image"},
          "backgroundOverlayOpacity": {"type": "number", "default": 0.4, "description": "Overlay opacity (0-1)"},
          "maxWidth": {"type": "string", "default": "800px", "description": "Maximum content width"}
        }
      }
    }',
    true
  ),
  (
    'Features Block',
    'system',
    'features',
    'marketing',
    'Feature lists and benefit grids with multiple presentation styles. Template variants: grid, list, cards, icons-top, icons-left',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "items": [],
        "template": "grid",
        "columns": 3,
        "spacing": "2rem"
      },
      "defaultSettings": {
        "iconStyle": "rounded",
        "iconSize": "md",
        "cardStyle": false,
        "alignment": "left"
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "items": {"type": "array", "required": true, "description": "Feature items"},
          "template": {"type": "string", "options": ["grid", "list", "cards", "icons-top", "icons-left"], "default": "grid"},
          "columns": {"type": "number", "default": 3},
          "spacing": {"type": "string", "default": "2rem"}
        },
        "settings": {
          "iconStyle": {"type": "string", "options": ["filled", "outlined", "rounded", "square"], "default": "rounded", "description": "Icon style"},
          "iconSize": {"type": "string", "options": ["sm", "md", "lg"], "default": "md", "description": "Icon size"},
          "cardStyle": {"type": "boolean", "default": false, "description": "Use card styling"},
          "alignment": {"type": "string", "options": ["left", "center", "right"], "default": "left", "description": "Text alignment"}
        }
      }
    }',
    true
  ),
  (
    'Testimonials Block',
    'system',
    'testimonials',
    'marketing',
    'Customer testimonials and reviews with different display formats. Template variants: slider, grid, cards, quote-style',
    '{
      "defaultContent": {
        "title": "",
        "subtitle": "",
        "items": [],
        "template": "grid",
        "columns": 3,
        "spacing": "2rem"
      },
      "defaultSettings": {
        "autoplay": false,
        "autoplayInterval": 5000,
        "showNavigation": true,
        "showPagination": true,
        "cardStyle": true,
        "showStars": true
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Section title"},
          "subtitle": {"type": "string", "description": "Section subtitle"},
          "items": {"type": "array", "required": true, "description": "Testimonial items array with quote, author, role, avatar, and rating"},
          "template": {"type": "string", "options": ["slider", "grid", "cards", "quote-style"], "default": "grid", "description": "Display template"},
          "columns": {"type": "number", "default": 3, "description": "Number of columns for grid layout"},
          "spacing": {"type": "string", "default": "2rem", "description": "Spacing between items"}
        },
        "settings": {
          "autoplay": {"type": "boolean", "default": false, "description": "Auto-play slider"},
          "autoplayInterval": {"type": "number", "default": 5000, "description": "Autoplay interval in milliseconds"},
          "showNavigation": {"type": "boolean", "default": true, "description": "Show navigation arrows"},
          "showPagination": {"type": "boolean", "default": true, "description": "Show pagination dots"},
          "cardStyle": {"type": "boolean", "default": true, "description": "Use card styling"},
          "showStars": {"type": "boolean", "default": true, "description": "Show star ratings"}
        }
      }
    }',
    true
  ),
  (
    'Contact Form',
    'system',
    'contactform',
    'utility',
    'Pre-configured contact form with name, email, message, optional phone/subject. Template variants: default, compact, inline',
    '{
      "defaultContent": {
        "fields": {
          "name": true,
          "email": true,
          "message": true,
          "phone": false,
          "subject": false
        },
        "template": "default",
        "layout": "vertical",
        "title": "",
        "description": "",
        "submitLabel": "Send Message",
        "emailTo": "",
        "subjectPrefix": "Contact Form:"
      },
      "defaultSettings": {
        "successMessage": "Thank you! Your message has been sent.",
        "errorMessage": "There was an error sending your message. Please try again.",
        "redirectUrl": "",
        "fieldOrder": ["name", "email", "phone", "subject", "message"],
        "showLabels": true,
        "requiredFields": ["name", "email", "message"]
      },
      "schema": {
        "data": {
          "fields": {"type": "object", "description": "Field visibility config"},
          "template": {"type": "string", "options": ["default", "compact", "inline"], "default": "default"},
          "layout": {"type": "string", "options": ["vertical", "horizontal"], "default": "vertical"},
          "title": {"type": "string", "description": "Form title"},
          "description": {"type": "string", "description": "Form description"},
          "submitLabel": {"type": "string", "default": "Send Message"},
          "emailTo": {"type": "string", "description": "Recipient email address"}
        },
        "settings": {
          "successMessage": {"type": "string", "default": "Thank you! Your message has been sent."},
          "errorMessage": {"type": "string", "default": "There was an error sending your message. Please try again."},
          "requiredFields": {"type": "array", "default": ["name", "email", "message"]}
        }
      }
    }',
    true
  ),
  (
    'Newsletter Signup',
    'system',
    'newsletter',
    'marketing',
    'Email newsletter subscription form with different layouts. Template variants: inline, centered, compact, split',
    '{
      "defaultContent": {
        "title": "Subscribe to our newsletter",
        "description": "",
        "placeholder": "Enter your email",
        "buttonLabel": "Subscribe",
        "template": "inline",
        "service": "custom"
      },
      "defaultSettings": {
        "apiKey": "",
        "listId": "",
        "inputStyle": "default",
        "buttonStyle": "primary",
        "actionUrl": "",
        "successMessage": "Thank you for subscribing!",
        "errorMessage": "Failed to subscribe. Please try again."
      },
      "schema": {
        "data": {
          "title": {"type": "string", "default": "Subscribe to our newsletter"},
          "description": {"type": "string", "description": "Description text"},
          "placeholder": {"type": "string", "default": "Enter your email"},
          "buttonLabel": {"type": "string", "default": "Subscribe"},
          "template": {"type": "string", "options": ["inline", "centered", "compact", "split"], "default": "inline"},
          "service": {"type": "string", "options": ["mailchimp", "convertkit", "custom"], "default": "custom"}
        },
        "settings": {
          "apiKey": {"type": "string", "description": "API key for newsletter service"},
          "listId": {"type": "string", "description": "List ID for newsletter service"},
          "inputStyle": {"type": "string", "options": ["default", "outlined", "filled"], "default": "default", "description": "Input field style"},
          "buttonStyle": {"type": "string", "options": ["primary", "secondary", "outline"], "default": "primary", "description": "Button style variant"},
          "actionUrl": {"type": "string", "description": "Custom form submission URL"},
          "successMessage": {"type": "string", "default": "Thank you for subscribing!", "description": "Success message"},
          "errorMessage": {"type": "string", "default": "Failed to subscribe. Please try again.", "description": "Error message"}
        }
      }
    }',
    true
  ),
  (
    'Gallery Block',
    'system',
    'gallery',
    'content',
    'Image galleries with multiple display modes. Template variants: grid, masonry, carousel, lightbox',
    '{
      "defaultContent": {
        "title": "",
        "images": [],
        "template": "grid",
        "columns": 3,
        "spacing": "1rem"
      },
      "defaultSettings": {
        "lightbox": true,
        "lazyLoad": true,
        "aspectRatio": "16:9",
        "imageSize": "medium",
        "showCaptions": true,
        "autoplay": false,
        "showNavigation": true,
        "showPagination": true
      },
      "schema": {
        "data": {
          "title": {"type": "string", "description": "Gallery title"},
          "images": {"type": "array", "required": true, "description": "Gallery images"},
          "template": {"type": "string", "options": ["grid", "masonry", "carousel", "lightbox"], "default": "grid"},
          "columns": {"type": "number", "default": 3},
          "spacing": {"type": "string", "default": "1rem"}
        },
        "settings": {
          "lightbox": {"type": "boolean", "default": true, "description": "Enable lightbox for images"},
          "lazyLoad": {"type": "boolean", "default": true, "description": "Lazy load images"},
          "aspectRatio": {"type": "string", "default": "16:9", "description": "Image aspect ratio"},
          "imageSize": {"type": "string", "options": ["thumb", "small", "medium", "large", "full"], "default": "medium", "description": "Image display size"},
          "showCaptions": {"type": "boolean", "default": true, "description": "Show image captions"},
          "autoplay": {"type": "boolean", "default": false, "description": "Auto-play carousel"},
          "showNavigation": {"type": "boolean", "default": true, "description": "Show carousel navigation"},
          "showPagination": {"type": "boolean", "default": true, "description": "Show carousel pagination"}
        }
      }
    }',
    true
  ),
  (
    'Columns Block',
    'system',
    'columns',
    'layout',
    'Multi-column layouts with different distribution patterns. Template variants: equal, sidebar, content, asymmetric',
    '{
      "defaultContent": {
        "columns": [],
        "gap": "1rem",
        "template": "equal",
        "responsive": {}
      },
      "defaultSettings": {
        "equalHeight": false,
        "reverseOnMobile": false,
        "verticalAlign": "stretch"
      },
      "schema": {
        "data": {
          "columns": {"type": "array", "required": true, "description": "Column definitions"},
          "gap": {"type": "string", "default": "1rem"},
          "template": {"type": "string", "options": ["equal", "sidebar", "content", "asymmetric"], "default": "equal"},
          "responsive": {"type": "object", "description": "Responsive column settings"}
        },
        "settings": {
          "equalHeight": {"type": "boolean", "default": false},
          "reverseOnMobile": {"type": "boolean", "default": false},
          "verticalAlign": {"type": "string", "options": ["start", "center", "end", "stretch"], "default": "stretch"}
        }
      }
    }',
    true
  );

-- IMPORTANT: When adding a new component:
-- 1. First implement the React component in smartstore-app/components/smartstore/[type]/index.tsx
-- 2. Then add a registry entry here with type='system', is_system=true
-- 3. Ensure component_type matches the folder name in smartstore-app
-- 4. The config should reflect the actual props/schema of the React component

