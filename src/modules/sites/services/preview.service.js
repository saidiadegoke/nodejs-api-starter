const SiteModel = require('../models/site.model');
const PageModel = require('../models/page.model');
const TemplateModel = require('../models/template.model');
const CustomizationModel = require('../models/customization.model');
const ComponentModel = require('../models/component.model');
const BlockRendererService = require('./blockRenderer.service');
const { getDefaultPages, getDefaultBlocks } = require('../../../utils/defaultTemplateConfig');

class PreviewService {
  /**
   * Preview Component (system, custom, or composite)
   * Creates a minimal site config with just the component for preview
   */
  static async previewComponent(componentId, userId = null) {
    try {
      // Get component from registry
      const component = await ComponentModel.getComponentById(componentId);
      if (!component) {
        throw new Error('Component not found');
      }

      // Handle composite components differently
      let blocks = [];
      
      if (component.type === 'composite' && component.children && component.children.length > 0) {
        // For composite components, resolve child component types
        blocks = await Promise.all(
          component.children.map(async (child, index) => {
            try {
              // Try to get child component to resolve its type
              const childComponent = await ComponentModel.getComponentById(child.componentId);
              if (childComponent) {
                // component.type = component_type (e.g., 'cookie-consent', 'topnav')
                // component.componentType = type (e.g., 'system', 'custom')
                // For custom components, use baseComponentType; for system/custom, use type (component_type)
                const childType = childComponent.baseComponentType || childComponent.type;
                return {
                  id: `block-${child.componentId}-${index}`,
                  type: childType, // This should be the component_type (e.g., 'cookie-consent')
                  componentId: child.componentId, // Also include componentId for fallback lookup
                  data: childComponent.config?.defaultContent || child.arrangement?.data || {},
                  settings: childComponent.config?.defaultSettings || child.arrangement?.settings || {},
                  order: child.order || index,
                };
              }
            } catch (err) {
              console.warn(`Failed to resolve child component ${child.componentId}:`, err);
            }
            
            // Fallback: use componentId as type (will be resolved in smartstore-app)
            return {
              id: `block-${child.componentId}-${index}`,
              type: child.componentId, // smartstore-app will resolve this to actual component type
              data: child.arrangement?.data || {},
              settings: child.arrangement?.settings || {},
              order: child.order || index,
            };
          })
        );
      } else {
        // For regular components (system or custom), create single block
        // component.type is mapped to component_type (e.g., 'cookie-consent', 'topnav')
        // component.componentType is the original type field (e.g., 'system', 'custom')
        // For custom components, use baseComponentType; for system/custom, use type (component_type)
        const componentType = component.baseComponentType || component.type;
        if (!componentType) {
          throw new Error(`Component ${componentId} missing component type. component.type: ${component.type}, component.componentType: ${component.componentType}`);
        }
        blocks = [
          {
            id: `block-${componentId}`,
            type: componentType, // This should be 'cookie-consent', 'topnav', etc. (component_type from DB)
            componentId: componentId, // Also include componentId for fallback lookup
            data: component.config?.defaultContent || {},
            settings: component.config?.defaultSettings || {},
            order: 0,
          },
        ];
      }

      // Create minimal site config for component preview
      const previewSiteId = `preview-component-${componentId}`;
      const config = {
        site: {
          id: previewSiteId,
          name: `${component.name} Preview`,
          slug: previewSiteId,
          status: 'draft',
          owner_id: userId || 'preview-user', // Required field, use default if no userId
          template_id: null,
          primary_domain: null,
          // engine_version is optional, omit if null
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        customization: {
          site_id: previewSiteId, // Required field for customization object
          colors: {
            primary: '#2563eb',
            secondary: '#6b7280',
            accent: '#f59e0b',
            background: '#ffffff',
            text: '#111827',
          },
          fonts: {
            heading: 'Inter, sans-serif',
            body: 'Inter, sans-serif',
            button: 'Inter, sans-serif',
          },
          logo_url: null,
          spacing: null,
        },
        pages: [
          {
            id: 'preview-page',
            site_id: `preview-component-${componentId}`,
            slug: 'preview',
            title: `${component.name} Preview`,
            layoutTemplate: 'linear', // Use linear layout (single region) for component preview
            content: {
              regions: [
                {
                  id: 'main',
                  type: 'main',
                  blocks: blocks, // Embed blocks directly in region
                },
              ],
            },
            published: true,
            status: 'published',
            meta_description: `Preview of ${component.name} component`,
            meta_keywords: [],
          },
        ],
        template: null,
        previewType: 'component',
      };

      return this.generateConfigForPreview(config);
    } catch (error) {
      console.error('Preview component error:', error);
      throw error;
    }
  }

  /**
   * Preview Template
   * Returns template config with all its pages and components
   */
  static async previewTemplate(templateId, userId = null) {
    try {
      const template = await TemplateModel.getTemplateById(templateId);
      if (!template || !template.id) {
        throw new Error('Template not found or invalid');
      }

      // Parse template config
      const templateConfig = typeof template.config === 'string' 
        ? JSON.parse(template.config) 
        : template.config;

      // DEBUG: Log template config structure
      console.log('[PreviewService] Template config structure:', {
        hasPages: !!templateConfig?.pages,
        pagesCount: templateConfig?.pages?.length || 0,
        pagesStructure: templateConfig?.pages?.map(p => ({
          slug: p.slug,
          hasRegions: !!p.regions,
          regionsCount: p.regions?.length || 0,
          hasContent: !!p.content,
          hasContentRegions: !!p.content?.regions,
          contentRegionsCount: p.content?.regions?.length || 0,
          pageKeys: Object.keys(p),
          // Log full page structure for home page to debug
          ...(p.slug === 'home' ? { fullPageStructure: JSON.stringify(p, null, 2).substring(0, 1000) } : {}),
        })) || [],
        hasBlocks: !!templateConfig?.blocks,
        blocksCount: templateConfig?.blocks?.length || 0,
      });

      // Create preview site config from template
      const previewSiteId = `preview-template-${templateId}`;
      const config = {
        site: {
          id: previewSiteId,
          name: template.name, // Use template name directly, no "Preview" suffix
          slug: previewSiteId,
          status: 'draft',
          owner_id: userId || 'preview-user',
          template_id: templateId,
          default_layout_id: 'header-main-footer', // Set default layout for template preview
          primary_domain: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        customization: {
          site_id: previewSiteId,
          colors: templateConfig?.theme?.colors || {
            primary: '#2563eb',
            secondary: '#6b7280',
            accent: '#f59e0b',
            background: '#ffffff',
            text: '#111827',
          },
          fonts: templateConfig?.theme?.fonts || {
            heading: 'Inter, sans-serif',
            body: 'Inter, sans-serif',
            button: 'Inter, sans-serif',
          },
          logo_url: template.thumbnail_url || null,
          spacing: templateConfig?.theme?.spacing || null,
        },
        pages: templateConfig?.pages || [],
        blocks: templateConfig?.blocks || [], // Include blocks for resolution
        template: {
          id: template.id, // Required - already validated above
          name: template.name || undefined,
          slug: template.slug || undefined,
          category: template.category || undefined,
          config: templateConfig,
          thumbnail_url: template.thumbnail_url || null,
          created_at: template.created_at || undefined,
          updated_at: template.updated_at || undefined,
        },
        components: templateConfig?.components || [],
      };

      return this.generateConfigForPreview(config);
    } catch (error) {
      console.error('Preview template error:', error);
      throw error;
    }
  }

  /**
   * Preview Page
   * Returns page config with its parent site
   */
  static async previewPage(pageId, siteId, userId = null) {
    try {
      const page = await PageModel.getPageById(pageId, siteId);
      if (!page) {
        throw new Error('Page not found');
      }

      // Get site data
      const site = await SiteModel.getSiteById(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      // Get template if available
      let template = null;
      if (site.template_id) {
        template = await TemplateModel.getTemplateById(site.template_id);
      }

      // Get customization settings
      let customization = await CustomizationModel.getCustomization(siteId);
      if (customization) {
        if (customization.colors && typeof customization.colors === 'string') {
          customization.colors = JSON.parse(customization.colors);
        }
        if (customization.fonts && typeof customization.fonts === 'string') {
          customization.fonts = JSON.parse(customization.fonts);
        }
        if (customization.spacing && typeof customization.spacing === 'string') {
          customization.spacing = JSON.parse(customization.spacing);
        }
      }

      // Parse page content
      const pageContent = typeof page.content === 'string' 
        ? JSON.parse(page.content) 
        : page.content;

      const config = {
        site: {
          id: site.id,
          name: site.name,
          slug: site.slug,
          status: site.status,
          owner_id: site.owner_id,
          template_id: site.template_id,
          primary_domain: site.primary_domain,
          engine_version: site.engine_version,
          created_at: site.created_at,
          updated_at: site.updated_at,
        },
        customization: customization || {
          colors: {
            primary: '#2563eb',
            secondary: '#6b7280',
            accent: '#f59e0b',
            background: '#ffffff',
            text: '#111827',
          },
          fonts: {
            heading: 'Inter, sans-serif',
            body: 'Inter, sans-serif',
            button: 'Inter, sans-serif',
          },
          logo_url: null,
          spacing: null,
        },
        pages: [
          {
            ...page,
            content: pageContent,
            meta_keywords: typeof page.meta_keywords === 'string' 
              ? JSON.parse(page.meta_keywords) 
              : page.meta_keywords,
          },
        ],
        template: template ? {
          id: template.id,
          name: template.name,
          slug: template.slug,
          category: template.category,
          config: typeof template.config === 'string' ? JSON.parse(template.config) : template.config,
          thumbnail_url: template.thumbnail_url,
          created_at: template.created_at,
          updated_at: template.updated_at,
        } : null,
      };

      return this.generateConfigForPreview(config);
    } catch (error) {
      console.error('Preview page error:', error);
      throw error;
    }
  }

  /**
   * Preview Site (homepage or specific page)
   * Site preview = Template preview with site customization
   * Pages come from template.config.pages, NOT from site's pages table
   */
  static async previewSite(siteId, pageSlug = null, userId = null) {
    try {
      // Get site data
      const site = await SiteModel.getSiteById(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      // Site should have a template (pages come from template)
      // If no template, site is in draft mode and cannot be previewed with pages
      if (!site.template_id) {
        throw new Error('Site is in draft mode and has no template. Add a template to activate the site.');
      }

      // Get template - this is where pages come from
      const template = await TemplateModel.getTemplateById(site.template_id);
      if (!template || !template.id) {
        throw new Error('Template not found or invalid');
      }

      // Parse template config to get pages
      const templateConfig = typeof template.config === 'string' 
        ? JSON.parse(template.config) 
        : template.config;

      // Pages come from template.config.pages
      const templatePages = templateConfig?.pages || [];
      
      // Get customization settings (site-specific)
      let customization = await CustomizationModel.getCustomization(siteId);
      if (customization) {
        if (customization.colors && typeof customization.colors === 'string') {
          customization.colors = JSON.parse(customization.colors);
        }
        if (customization.fonts && typeof customization.fonts === 'string') {
          customization.fonts = JSON.parse(customization.fonts);
        }
        if (customization.spacing && typeof customization.spacing === 'string') {
          customization.spacing = JSON.parse(customization.spacing);
        }
      } else {
        // Fallback to template theme if no site customization
        customization = {
          colors: templateConfig?.theme?.colors || {
            primary: '#2563eb',
            secondary: '#6b7280',
            accent: '#f59e0b',
            background: '#ffffff',
            text: '#111827',
          },
          fonts: templateConfig?.theme?.fonts || {
            heading: 'Inter, sans-serif',
            body: 'Inter, sans-serif',
            button: 'Inter, sans-serif',
          },
          logo_url: templateConfig?.theme?.logoUrl || templateConfig?.theme?.logo_url || null,
          spacing: templateConfig?.theme?.spacing || null,
        };
      }

      // Filter to specific page if pageSlug provided
      let selectedPage = null;
      if (pageSlug) {
        selectedPage = templatePages.find(p => p.slug === pageSlug);
      } else {
        // Default to homepage
        selectedPage = templatePages.find(p => p.slug === 'home' || p.slug === 'index') || templatePages[0];
      }

      const config = {
        site: {
          id: site.id,
          name: site.name,
          slug: site.slug,
          status: site.status,
          owner_id: site.owner_id,
          template_id: site.template_id,
          default_layout_id: site.default_layout_id || 'header-main-footer',
          primary_domain: site.primary_domain,
          engine_version: site.engine_version,
          created_at: site.created_at,
          updated_at: site.updated_at,
        },
        customization: {
          ...customization,
          site_id: site.id, // Ensure site_id is set
        },
        pages: templatePages, // Pages from template
        template: {
          id: template.id, // Required - already validated above
          name: template.name || undefined,
          slug: template.slug || undefined,
          category: template.category || undefined,
          config: templateConfig,
          thumbnail_url: template.thumbnail_url || null,
          created_at: template.created_at || undefined,
          updated_at: template.updated_at || undefined,
        },
        previewPage: selectedPage ? selectedPage.slug : null, // Indicate which page to render
      };

      return this.generateConfigForPreview(config);
    } catch (error) {
      console.error('Preview site error:', error);
      throw error;
    }
  }

  /**
   * Generate preview config in standard format
   * Ensures all required fields are present and properly formatted
   * Resolves blockIds to actual blocks and embeds them in page content
   */
  static generateConfigForPreview(config) {
    // Ensure customization has required site_id field
    const customization = config.customization || {
      colors: {
        primary: '#2563eb',
        secondary: '#6b7280',
        accent: '#f59e0b',
        background: '#ffffff',
        text: '#111827',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        button: 'Inter, sans-serif',
      },
      logo_url: null,
      spacing: null,
    };
    
    // Ensure customization has site_id
    if (!customization.site_id && config.site?.id) {
      customization.site_id = config.site.id;
    }
    
    // Clean up site object - remove null engine_version, ensure owner_id is set
    const site = { ...config.site };
    if (site.engine_version === null || site.engine_version === undefined) {
      delete site.engine_version;
    }
    if (!site.owner_id) {
      site.owner_id = 'preview-user';
    }
    
    // Get all blocks from template config
    const templateBlocks = config.template?.config?.blocks || config.blocks || [];
    
    // Also get default blocks to ensure all referenced blocks are available
    // This ensures blocks referenced in default pages are always available
    const defaultBlocks = getDefaultBlocks();
    
    // Combine template blocks with default blocks (template blocks take precedence)
    const allBlocks = [...defaultBlocks];
    const templateBlockIds = new Set(templateBlocks.map(b => b.id));
    
    // Add template blocks, and override default blocks if they exist in template
    templateBlocks.forEach(block => {
      const existingIndex = allBlocks.findIndex(b => b.id === block.id);
      if (existingIndex >= 0) {
        allBlocks[existingIndex] = block; // Override with template block
      } else {
        allBlocks.push(block); // Add new template block
      }
    });
    
    // Normalize blocks: ensure type is set from componentId if missing
    const normalizedBlocks = allBlocks.map(block => {
      // If block has componentId but no type, use componentId as type
      if (!block.type && block.componentId) {
        return {
          ...block,
          type: block.componentId,
        };
      }
      return block;
    });
    
    // Create a map of blocks by ID for efficient lookup
    const blockMap = new Map();
    normalizedBlocks.forEach(block => {
      blockMap.set(block.id, block);
    });
    
    // DEBUG: Log template blocks
    console.log('[PreviewService] Template blocks available:', {
      totalBlocks: normalizedBlocks.length,
      blockIds: normalizedBlocks.map(b => b.id).slice(0, 10),
      blockTypes: normalizedBlocks.map(b => ({ id: b.id, type: b.type, componentId: b.componentId })).slice(0, 10),
    });
    
    // Get default pages for fallback (in case pages are incomplete)
    const defaultPages = getDefaultPages();
    const defaultPagesMap = new Map();
    defaultPages.forEach(dp => {
      defaultPagesMap.set(dp.slug, dp);
    });
    
    // Resolve pages: convert blockIds to actual blocks in content
    // Pages are stored with: { regions: [{ regionId, blockIds: [...] }], layoutTemplate: 'header-main-footer' }
    // Preview converts to: { content: { regions: [{ id, blocks: [...] }] } }
    const resolvedPages = (config.pages || []).map(page => {
      // Check if page is incomplete (no regions)
      const hasRegions = page.regions && page.regions.length > 0;
      const hasContentRegions = page.content?.regions && page.content.regions.length > 0;
      const isIncomplete = !hasRegions && !hasContentRegions;
      
      // If page is incomplete, try to use default page structure
      if (isIncomplete) {
        const defaultPage = defaultPagesMap.get(page.slug);
        if (defaultPage && defaultPage.regions) {
          console.log(`[PreviewService] Page "${page.slug}" is incomplete, using default page structure`);
          // Merge default page structure, keeping existing page metadata
          page = {
            ...defaultPage,
            ...page, // Keep existing fields (slug, title, etc. from database)
            regions: defaultPage.regions, // Use default regions
            layoutTemplate: defaultPage.layoutTemplate || page.layoutTemplate, // Preserve layoutTemplate (layout ID)
            layout: defaultPage.layout || page.layout, // Preserve layout (type)
            settings: {
              ...defaultPage.settings,
              ...page.settings, // Merge settings
            },
          };
        }
      }
      
      const resolvedPage = { ...page };
      
      // Initialize content if not present
      if (!resolvedPage.content) {
        resolvedPage.content = {};
      }
      
      // VALIDATION: Page must have layoutTemplate (layout ID)
      if (!resolvedPage.layoutTemplate) {
        console.error(`[PreviewService] Page "${resolvedPage.slug}" is missing layoutTemplate (layout ID). This is required.`);
      }
      
      // DEBUG: Log page before resolution - check both top-level and content.regions
      // For home page, log full structure to understand why it has no regions
      const isHomePage = page.slug === 'home';
      console.log(`[PreviewService] Resolving page "${page.slug}":`, {
        hasTopLevelRegions: !!page.regions,
        topLevelRegionsCount: page.regions?.length || 0,
        hasContentRegions: !!page.content?.regions,
        contentRegionsCount: page.content?.regions?.length || 0,
        hasContent: !!page.content,
        contentKeys: page.content ? Object.keys(page.content) : [],
        regionBlockIds: (page.regions || page.content?.regions || []).map(r => ({ id: r.regionId || r.id, blockIds: r.blockIds })) || [],
        pageKeys: Object.keys(page),
        // Log full page structure for home page to debug why it has no regions
        ...(isHomePage ? { 
          fullPageStructure: JSON.stringify(page, null, 2),
          contentStructure: page.content ? JSON.stringify(page.content, null, 2) : 'no content',
        } : {}),
      });
      
      // Handle regions with blockIds - check both top-level regions and content.regions
      // Pages are stored with: regions: [{ regionId, blockIds: [...] }]
      // Preview converts to: content.regions: [{ id, blocks: [...] }]
      // Priority: page.regions (top-level) > page.content.regions (already in content)
      const pageRegions = page.regions || page.content?.regions || [];
      if (pageRegions && Array.isArray(pageRegions) && pageRegions.length > 0) {
        resolvedPage.content.regions = pageRegions.map(region => {
          // Normalize region structure: regionId -> id, regionType -> type
          const resolvedRegion = {
            id: region.regionId || region.id,
            type: region.regionType || region.type,
            name: region.regionName || region.name,
            order: region.order,
            styles: region.styles,
            visibility: region.visibility,
            blocks: [], // Will be populated below
          };
          
          // Resolve blockIds to actual blocks
          if (region.blockIds && Array.isArray(region.blockIds) && region.blockIds.length > 0) {
            const missingBlockIds = [];
            const resolvedBlocks = region.blockIds
              .map(blockId => {
                const block = blockMap.get(blockId);
                if (!block) {
                  missingBlockIds.push(blockId);
                  console.error(`[PreviewService] Block "${blockId}" not found in template blocks for region "${resolvedRegion.id}"`);
                  return null;
                }
                // Ensure block has type set from componentId if needed
                return {
                  ...block,
                  type: block.type || block.componentId || 'text',
                };
              })
              .filter(Boolean); // Remove null entries
            
            // Log region resolution with missing blocks warning
            if (missingBlockIds.length > 0) {
              console.error(`[PreviewService] Region "${resolvedRegion.id}" is missing ${missingBlockIds.length} block(s):`, missingBlockIds);
            }
            
            resolvedRegion.blocks = resolvedBlocks;
          } else if (region.blocks && Array.isArray(region.blocks)) {
            // Blocks already embedded, just normalize them
            resolvedRegion.blocks = region.blocks.map(block => ({
              ...block,
              type: block.type || block.componentId || 'text',
            }));
          } else {
            // Region has no blocks - this is allowed, will show "No content" message
            resolvedRegion.blocks = [];
          }
          
          return resolvedRegion;
        });
      } else {
        // Page has no regions - this is an error, page must have regions
        console.error(`[PreviewService] Page "${page.slug}" has no regions defined. This is required.`);
        resolvedPage.content.regions = [];
      }
      
      // Note: Legacy blockIds (linear layout) are no longer supported
      // All pages must use regions with blocks defined
      
      // Remove top-level regions after moving to content.regions (clean up)
      if (resolvedPage.content.regions && resolvedPage.content.regions.length > 0) {
        delete resolvedPage.regions; // Remove top-level regions to avoid confusion
      }
      
      // VALIDATION: Ensure layoutTemplate is set (layout ID, required)
      if (!resolvedPage.layoutTemplate) {
        console.error(`[PreviewService] Page "${resolvedPage.slug}" is missing layoutTemplate (layout ID). This is required.`);
      }
      
      // DEBUG: Log resolved page - verify regions are in content
      console.log(`[PreviewService] Resolved page "${resolvedPage.slug}":`, {
        hasContent: !!resolvedPage.content,
        hasRegions: !!resolvedPage.content.regions,
        regionsCount: resolvedPage.content.regions?.length || 0,
        regionsWithBlocks: resolvedPage.content.regions?.map(r => ({
          id: r.regionId || r.id,
          type: r.regionType || r.type,
          blocksCount: r.blocks?.length || 0,
          blockTypes: r.blocks?.map(b => b.type || b.componentId) || [],
          blockIds: r.blocks?.map(b => b.id) || [],
        })) || [],
        hasBlocks: !!resolvedPage.content.blocks,
        blocksCount: resolvedPage.content.blocks?.length || 0,
        // Verify top-level regions are removed
        hasTopLevelRegions: !!resolvedPage.regions,
        topLevelRegionsCount: resolvedPage.regions?.length || 0,
        // Log the actual content structure
        contentKeys: Object.keys(resolvedPage.content || {}),
      });
      
      return resolvedPage;
    });
    
    // DEBUG: Log final config
    console.log('[PreviewService] Final preview config:', {
      pagesCount: resolvedPages.length,
      pageSlugs: resolvedPages.map(p => p.slug),
      totalBlocksInAllPages: resolvedPages.reduce((sum, p) => {
        const regionBlocks = p.content?.regions?.reduce((s, r) => s + (r.blocks?.length || 0), 0) || 0;
        const linearBlocks = p.content?.blocks?.length || 0;
        return sum + regionBlocks + linearBlocks;
      }, 0),
    });
    
    // Ensure template has id if it exists (required for validation)
    // Only set to null if template exists but id is explicitly missing (not 0, not empty string)
    let template = config.template || null;
    if (template) {
      // Check if id is null or undefined (but allow 0 and empty string as valid)
      if (template.id === null || template.id === undefined) {
        console.error('[PreviewService] Template object exists but missing id field:', {
          templateKeys: Object.keys(template),
          templateType: typeof template,
          templateValue: template,
        });
        template = null; // Set to null if id is missing (validation will fail otherwise)
      } else {
        // Ensure id is a string or number (convert if needed)
        if (typeof template.id !== 'string' && typeof template.id !== 'number') {
          console.error('[PreviewService] Template id is not a string or number:', {
            id: template.id,
            idType: typeof template.id,
          });
          template = null;
        }
      }
    }
    
    return {
      site: site,
      customization: customization,
      pages: resolvedPages,
      template: template,
      components: config.components || [],
      previewPage: config.previewPage || null,
      previewType: config.previewType || 'site', // 'component', 'template', 'page', 'site'
    };
  }

  /**
   * Render site homepage (legacy method - kept for backward compatibility)
   */
  static async renderSite(siteId) {
    const config = await this.previewSite(siteId);
    return this.generateHTML(config);
  }

  /**
   * Render specific page (legacy method - kept for backward compatibility)
   */
  static async renderPage(siteId, pageId) {
    const config = await this.previewPage(pageId, siteId);
    return this.generateHTML(config);
  }

  /**
   * Generate HTML from preview config (legacy method)
   * This is kept for backward compatibility but should use smartstore-app rendering
   */
  static generateHTML(config) {
    const site = config.site;
    const customization = config.customization;
    const pages = config.pages || [];
    const selectedPage = config.previewPage 
      ? pages.find(p => p.slug === config.previewPage) 
      : pages.find(p => p.slug === 'home' || p.slug === 'index') || pages[0];

    const colors = customization?.colors || {
      primary: '#4D16D1',
      secondary: '#6B7280',
      accent: '#F59E0B',
      background: '#ffffff',
      text: '#111827',
      textSecondary: '#6B7280',
    };

    const fonts = customization?.fonts || {
      heading: 'Inter, sans-serif',
      body: 'Inter, sans-serif',
      button: 'Inter, sans-serif',
    };

    const logoUrl = customization?.logo_url || customization?.logoUrl || '';

    // Get page content
    let pageContent = '';
    if (selectedPage) {
      if (selectedPage.content) {
        const content = selectedPage.content;
        
        if (content.html) {
          pageContent = content.html;
        } else if (content.regions && Array.isArray(content.regions)) {
          pageContent = BlockRendererService.renderRegions(content.regions, colors, fonts);
        } else if (content.blocks && Array.isArray(content.blocks)) {
          pageContent = BlockRendererService.renderBlocks(content.blocks, colors, fonts);
        } else {
          pageContent = `<h1>${selectedPage.title || 'Untitled'}</h1>`;
        }
      } else {
        pageContent = `<h1>${selectedPage.title || 'Untitled'}</h1>`;
      }
    } else {
      pageContent = '<h1>Welcome</h1><p>No content available.</p>';
    }

    // Generate full HTML
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${selectedPage?.title || site.name || 'Site'}</title>
  <meta name="description" content="${selectedPage?.meta_description || selectedPage?.metaDescription || ''}">
  
  <!-- Google Fonts -->
  ${this.generateGoogleFontsLink(fonts)}
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <style>
    body {
      font-family: ${fonts.body};
      color: ${colors.text};
      background-color: ${colors.background};
      line-height: 1.6;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: ${fonts.heading};
      color: ${colors.primary};
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }
  </style>
</head>
<body>
  <main class="container" style="padding: 2rem 0;">
    ${pageContent}
  </main>
</body>
</html>`;
  }

  /**
   * Generate Google Fonts link
   */
  static generateGoogleFontsLink(fonts) {
    const fontFamilies = new Set();
    
    Object.values(fonts).forEach(font => {
      const match = font.match(/^([^,]+)/);
      if (match) {
        const fontName = match[1].replace(/['"]/g, '').trim();
        const googleFonts = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Playfair Display', 'Merriweather', 'Lora', 'Source Sans Pro', 'Nunito', 'Ubuntu', 'Crimson Text', 'Libre Baskerville'];
        if (googleFonts.includes(fontName)) {
          fontFamilies.add(fontName.replace(/\s+/g, '+'));
        }
      }
    });

    if (fontFamilies.size === 0) {
      return '';
    }

    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${Array.from(fontFamilies).map(f => `family=${f}:wght@400;500;600;700`).join('&')}&display=swap" rel="stylesheet">`;
  }
}

module.exports = PreviewService;
