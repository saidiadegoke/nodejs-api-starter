const SiteModel = require('../models/site.model');
const TemplateModel = require('../models/template.model');
const PageModel = require('../models/page.model');
const CustomizationModel = require('../models/customization.model');
const pool = require('../../../db/pool');

class SiteService {
  /**
   * Get all sites for user
   */
  static async getUserSites(userId) {
    return await SiteModel.getUserSites(userId);
  }

  /**
   * Get site by ID with ownership check
   */
  static async getSiteById(siteId, userId) {
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }
    return site;
  }

  /**
   * Get site by slug with ownership check
   */
  static async getSiteBySlug(slug, userId) {
    const site = await SiteModel.getSiteBySlug(slug);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }
    return site;
  }

  /**
   * Create new site
   * 
   * Architecture: Sites reference templates for pages.
   * Sites do NOT have their own pages - pages are stored in template.config.pages.
   * Sites focus on: domain, customization, settings.
   * 
   * Site creation flow:
   * 1. Site is created as 'draft' by default
   * 2. Site can exist without template (in draft mode)
   * 3. To activate site, template must be applied
   */
  static async createSite(siteData, userId) {
    // Check if slug is available
    const isAvailable = await SiteModel.isSlugAvailable(siteData.slug);
    if (!isAvailable) {
      throw new Error('Slug is already taken');
    }

    // Set default layout if not provided
    const defaultLayoutId = siteData.defaultLayoutId || 'header-main-footer';

    // Sites are created as 'draft' by default (unless explicitly set)
    // Template can be applied, but site activation is separate
    const site = await SiteModel.createSite({
      ...siteData,
      ownerId: userId,
      defaultLayoutId,
      status: siteData.status || 'draft', // Default to draft
    });

    // If template is provided during creation, apply it (does NOT activate the site)
    if (siteData.templateId) {
      try {
        // Verify template exists
        const template = await TemplateModel.getTemplateById(siteData.templateId);
        if (!template) {
          console.warn(`Template ${siteData.templateId} not found, site created without template`);
          // Site stays in draft mode if template not found
        } else {
          // Apply template (does not activate - activation is separate)
          await this.applyTemplateToSite(site.id, siteData.templateId, userId);
          
          // Return updated site (still in draft mode)
          return await SiteModel.getSiteById(site.id);
        }
      } catch (templateError) {
        console.error(`Error applying template ${siteData.templateId} to site ${site.id}:`, templateError);
        // Site stays in draft mode if template application fails
      }
    }

    // If no template provided, create default customization for draft site
    await CustomizationModel.upsertCustomization(site.id, {
      colors: {
        primary: '#4D16D1',
        secondary: '#6B7280',
        accent: '#F59E0B',
        background: '#ffffff',
        text: '#111827',
        textSecondary: '#6B7280',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        button: 'Inter, sans-serif',
      },
      logoUrl: null,
      spacing: null,
    });

    return site;
  }

  /**
   * Apply template to site (does NOT activate the site)
   * Template application and site activation are separate actions.
   * This method only associates the template and applies customization.
   */
  static async applyTemplateToSite(siteId, templateId, userId) {
    // Verify site ownership
    await this.getSiteById(siteId, userId);

    // Verify template exists
    const template = await TemplateModel.getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Apply template association
    await TemplateModel.applyTemplateToSite(siteId, templateId);
      
    // Parse template config
    let templateConfig = null;
    if (template.config) {
      try {
        templateConfig = typeof template.config === 'string' 
          ? JSON.parse(template.config) 
          : template.config;
      } catch (parseError) {
        console.error(`Failed to parse template config for template ${templateId}:`, parseError);
        throw new Error('Invalid template configuration');
      }
    }

    // Apply customization from template theme (if exists)
    if (templateConfig && templateConfig.theme) {
      try {
        const theme = templateConfig.theme;
        // Handle both camelCase and snake_case for logo
        const logoUrl = theme.logoUrl || theme.logo_url || null;
        
        await CustomizationModel.upsertCustomization(siteId, {
          colors: theme.colors || {
            primary: '#4D16D1',
            secondary: '#6B7280',
            accent: '#F59E0B',
            background: '#ffffff',
            text: '#111827',
            textSecondary: '#6B7280',
          },
          fonts: theme.fonts || {
            heading: 'Inter, sans-serif',
            body: 'Inter, sans-serif',
            button: 'Inter, sans-serif',
          },
          logoUrl: logoUrl,
          spacing: theme.spacing || null,
        });
      } catch (customError) {
        console.error(`Failed to apply template customization:`, customError);
        // Still create default customization if template theme fails
        await CustomizationModel.upsertCustomization(siteId, {
          colors: {
            primary: '#4D16D1',
            secondary: '#6B7280',
            accent: '#F59E0B',
            background: '#ffffff',
            text: '#111827',
            textSecondary: '#6B7280',
          },
          fonts: {
            heading: 'Inter, sans-serif',
            body: 'Inter, sans-serif',
            button: 'Inter, sans-serif',
          },
          logoUrl: null,
          spacing: null,
        });
      }
    } else {
      // No theme in template, use defaults
      await CustomizationModel.upsertCustomization(siteId, {
        colors: {
          primary: '#4D16D1',
          secondary: '#6B7280',
          accent: '#F59E0B',
          background: '#ffffff',
          text: '#111827',
          textSecondary: '#6B7280',
        },
        fonts: {
          heading: 'Inter, sans-serif',
          body: 'Inter, sans-serif',
          button: 'Inter, sans-serif',
        },
        logoUrl: null,
        spacing: null,
      });
    }

    // Note: Site is NOT automatically activated. Activation is a separate action.
    // Note: Pages are NOT created in sites table - they come from template.config.pages
    // Site rendering will use template pages directly

    return await SiteModel.getSiteById(siteId);
  }

  /**
   * Update site
   */
  static async updateSite(siteId, updates, userId) {
    // Verify ownership
    await this.getSiteById(siteId, userId);
    
    // Check slug availability if slug is being updated
    if (updates.slug) {
      const isAvailable = await SiteModel.isSlugAvailable(updates.slug, siteId);
      if (!isAvailable) {
        throw new Error('Slug is already taken');
      }
    }

    // Handle template_id separately (it's stored in site_templates table, not sites table)
    const templateId = updates.template_id || updates.templateId;
    if (templateId !== undefined) {
      // Remove template_id from updates object to avoid trying to update sites table
      delete updates.template_id;
      delete updates.templateId;
      
      // Apply template using the dedicated method
      if (templateId) {
        // If templateId is provided (not null/empty), apply it
        await this.applyTemplateToSite(siteId, templateId, userId);
      } else {
        // If templateId is null/empty, remove template association
        const TemplateModel = require('../models/template.model');
        await pool.query(
          'DELETE FROM site_templates WHERE site_id = $1',
          [siteId]
        );
      }
    }

    // Update site fields (excluding template_id)
    const siteUpdates = { ...updates };
    // Remove any remaining template_id references
    delete siteUpdates.template_id;
    delete siteUpdates.templateId;

    // Only update sites table if there are other fields to update
    if (Object.keys(siteUpdates).length > 0) {
      await SiteModel.updateSite(siteId, siteUpdates);
    }

    // Return updated site with template info (join with site_templates)
    const result = await pool.query(
      `SELECT 
        s.*,
        st.template_id
      FROM sites s
      LEFT JOIN site_templates st ON s.id = st.site_id
      WHERE s.id = $1`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Delete site
   */
  static async deleteSite(siteId, userId) {
    // Verify ownership
    await this.getSiteById(siteId, userId);
    return await SiteModel.deleteSite(siteId);
  }
}

module.exports = SiteService;

