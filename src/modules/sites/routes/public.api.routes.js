/**
 * Public API Routes for Site Rendering
 * These routes provide JSON responses for smartstore-app without authentication
 * Only returns data for active sites (except draft endpoint)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../../db/pool');
const SiteModel = require('../models/site.model');
const CustomizationModel = require('../models/customization.model');
const PageModel = require('../models/page.model');
const TemplateModel = require('../models/template.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, NOT_FOUND, BAD_REQUEST } = require('../../../shared/constants/statusCodes');
const { logger } = require('../../../shared/utils/logger');

/**
 * @route   GET /public/sites/by-slug/:slug
 * @desc    Get site by slug (public, no auth required)
 * @access  Public
 * @param   {string} slug - Site slug
 * @returns {object} Site data (only for active sites)
 */
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || slug.trim() === '') {
      return sendError(res, 'Slug is required', BAD_REQUEST);
    }

    // Get site by slug
    const site = await SiteModel.getSiteBySlug(slug);

    if (!site) {
      return sendError(res, `Site with slug "${slug}" not found`, NOT_FOUND);
    }

    // Allow active sites and draft sites (draft sites can be accessed for development/preview)
    // Also allow preview sites (preview sites have slug starting with 'template-preview-' or 'preview-')
    const isPreviewSite = site.slug?.startsWith('template-preview-') || site.slug?.startsWith('preview-');
    // Allow active and draft sites (draft sites are accessible for development)
    // Only block suspended sites
    if (site.status === 'suspended' && !isPreviewSite) {
      return sendError(res, `Site with slug "${slug}" is suspended`, NOT_FOUND);
    }

    // Return minimal site data (exclude sensitive fields)
    const publicSiteData = {
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
    };

    return sendSuccess(res, publicSiteData, 'Site retrieved successfully', OK);
  } catch (error) {
    logger.error('Error getting site by slug (public):', error);
    return sendError(res, error.message || 'Failed to retrieve site', 500);
  }
});

/**
 * @route   GET /public/sites/by-domain/:domain
 * @desc    Get site by custom domain (public, no auth required)
 * @access  Public
 * @param   {string} domain - Custom domain
 * @returns {object} Site data (only for active sites)
 */
router.get('/by-domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    if (!domain || domain.trim() === '') {
      return sendError(res, 'Domain is required', BAD_REQUEST);
    }

    // Get site by custom domain
    // Note: This assumes primary_domain field in sites table
    const result = await pool.query(
      'SELECT * FROM sites WHERE primary_domain = $1 AND status = $2',
      [domain, 'active']
    );

    const site = result.rows[0];

    if (!site) {
      return sendError(res, `Site with domain "${domain}" not found`, NOT_FOUND);
    }

    // Return minimal site data
    const publicSiteData = {
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
    };

    return sendSuccess(res, publicSiteData, 'Site retrieved successfully', OK);
  } catch (error) {
    logger.error('Error getting site by domain (public):', error);
    return sendError(res, error.message || 'Failed to retrieve site', 500);
  }
});

/**
 * @route   GET /public/sites/:id/config
 * @desc    Get complete site configuration (public, no auth required)
 * @access  Public
 * @param   {string} id - Site ID
 * @returns {object} Complete site config (site, template, customization, pages)
 */
router.get('/:id/config', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || (isNaN(id) && !id.match(/^\d+$/))) {
      return sendError(res, 'Valid site ID is required', BAD_REQUEST);
    }

    // Get site (allow active and draft sites)
    const site = await SiteModel.getSiteById(id);

    if (!site) {
      return sendError(res, `Site with ID "${id}" not found`, NOT_FOUND);
    }

    // Allow active and draft sites (block suspended)
    if (site.status === 'suspended') {
      return sendError(res, `Site with ID "${id}" is suspended`, NOT_FOUND);
    }

    // If site has no template, return minimal config (site can exist without template)
    if (!site.template_id) {
      // Return minimal config with empty pages
      const customization = await CustomizationModel.getCustomization(id);
      const config = {
        site: {
          id: site.id,
          name: site.name,
          slug: site.slug,
          status: site.status,
          owner_id: site.owner_id,
          template_id: null,
          primary_domain: site.primary_domain,
          engine_version: site.engine_version,
          default_layout_id: site.default_layout_id,
          created_at: site.created_at,
          updated_at: site.updated_at,
        },
        customization: customization ? {
          ...customization,
          colors: typeof customization.colors === 'string' ? JSON.parse(customization.colors) : customization.colors,
          fonts: typeof customization.fonts === 'string' ? JSON.parse(customization.fonts) : customization.fonts,
          spacing: typeof customization.spacing === 'string' ? JSON.parse(customization.spacing) : customization.spacing,
        } : null,
        pages: [],
        template: null,
      };
      return sendSuccess(res, config, 'Site config retrieved (no template assigned)', OK);
    }

    // Get template - pages come from template.config.pages
    const template = await TemplateModel.getTemplateById(site.template_id);
    if (!template) {
      return sendError(res, `Template for site "${id}" not found`, NOT_FOUND);
    }

    // Parse template config
    const templateConfig = typeof template.config === 'string' 
      ? JSON.parse(template.config) 
      : template.config;

    // Get customization settings (site-specific)
    const customization = await CustomizationModel.getCustomization(id);

    // Pages come from template.config.pages (filter to published only for public)
    const allPages = templateConfig?.pages || [];
    const pages = allPages
      .filter(page => page.published === true && page.status === 'published')
      .map(page => ({
        id: `page-${page.slug}`, // Generate ID from slug
        site_id: id,
        slug: page.slug,
        title: page.title,
        content: page.content || {},
        published: page.published || false,
        status: page.status || 'draft',
        meta_description: page.metaDescription || page.meta_description || null,
        meta_keywords: page.metaKeywords || page.meta_keywords || null,
        layout_id: page.layoutId || page.layout_id || site.default_layout_id,
      }));

    // Build config object
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
        default_layout_id: site.default_layout_id,
        created_at: site.created_at,
        updated_at: site.updated_at,
      },
      customization: customization ? {
        ...customization,
        colors: typeof customization.colors === 'string' ? JSON.parse(customization.colors) : customization.colors,
        fonts: typeof customization.fonts === 'string' ? JSON.parse(customization.fonts) : customization.fonts,
        spacing: typeof customization.spacing === 'string' ? JSON.parse(customization.spacing) : customization.spacing,
      } : null,
      pages: pages || [],
      template: template ? {
        id: template.id,
        name: template.name,
        slug: template.slug,
        category: template.category,
        config: typeof template.config === 'string' ? JSON.parse(template.config) : template.config, // Parse JSONB config
        thumbnail_url: template.thumbnail_url,
        created_at: template.created_at,
        updated_at: template.updated_at,
      } : null,
    };

    return sendSuccess(res, config, 'Site config retrieved successfully', OK);
  } catch (error) {
    logger.error('Error getting site config (public):', error);
    return sendError(res, error.message || 'Failed to retrieve site config', 500);
  }
});

/**
 * @route   GET /public/sites/:id/config/draft
 * @desc    Get draft site configuration for preview (public, no auth required)
 * @access  Public (for preview mode - may need token validation in future)
 * @param   {string} id - Site ID
 * @returns {object} Draft site config (includes draft pages and unpublished content)
 */
router.get('/:id/config/draft', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || (isNaN(id) && !id.match(/^\d+$/))) {
      return sendError(res, 'Valid site ID is required', BAD_REQUEST);
    }

    // Get site (draft config works for draft and active sites)
    const site = await SiteModel.getSiteById(id);

    if (!site) {
      return sendError(res, `Site with ID "${id}" not found`, NOT_FOUND);
    }

    // Draft config is allowed for active and draft sites (for preview)
    if (site.status === 'suspended') {
      return sendError(res, `Site with ID "${id}" is suspended`, NOT_FOUND);
    }

    // Get related data (include draft pages for preview)
    const [customization, allPages, template] = await Promise.all([
      CustomizationModel.getCustomization(id),
      PageModel.getSitePages(id), // Get all pages for draft preview
      site.template_id ? TemplateModel.getTemplateById(site.template_id) : null,
    ]);

    // For draft config, include all pages (published and draft) for preview and parse JSONB content
    const pages = (allPages || []).map(page => ({
      ...page,
      content: typeof page.content === 'string' ? JSON.parse(page.content) : page.content,
      meta_keywords: typeof page.meta_keywords === 'string' ? JSON.parse(page.meta_keywords) : page.meta_keywords,
    }));

    // Build config object (same structure as regular config)
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
        default_layout_id: site.default_layout_id,
        created_at: site.created_at,
        updated_at: site.updated_at,
      },
      customization: customization ? {
        ...customization,
        colors: typeof customization.colors === 'string' ? JSON.parse(customization.colors) : customization.colors,
        fonts: typeof customization.fonts === 'string' ? JSON.parse(customization.fonts) : customization.fonts,
        spacing: typeof customization.spacing === 'string' ? JSON.parse(customization.spacing) : customization.spacing,
      } : null,
      pages: pages || [], // Includes draft pages for preview
      template: template ? {
        id: template.id,
        name: template.name,
        slug: template.slug,
        category: template.category,
        config: template.config,
        thumbnail_url: template.thumbnail_url,
        created_at: template.created_at,
        updated_at: template.updated_at,
      } : null,
    };

    return sendSuccess(res, config, 'Draft site config retrieved successfully', OK);
  } catch (error) {
    logger.error('Error getting draft site config (public):', error);
    return sendError(res, error.message || 'Failed to retrieve draft site config', 500);
  }
});

module.exports = router;

