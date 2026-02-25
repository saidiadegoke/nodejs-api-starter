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
const SiteFeatureModel = require('../models/site-feature.model');
const ProductService = require('../services/catalog/product.service');
const CategoryService = require('../services/catalog/category.service');
const BioController = require('../controllers/bio.controller');
const WhatsAppOrderService = require('../services/whatsappOrder.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, NOT_FOUND, BAD_REQUEST } = require('../../../shared/constants/statusCodes');
const { logger } = require('../../../shared/utils/logger');

router.get('/by-slug/:slug/bio', BioController.getBioPage);
router.get('/:id/bio', BioController.getBioPageById);

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
 * @desc    Get site by custom domain (public, no auth required). Resolves via custom_domains table.
 * @access  Public
 * @param   {string} domain - Custom domain (e.g. testapp.morgengreen.cloud)
 * @returns {object} Site data (only for active sites)
 */
router.get('/by-domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    if (!domain || domain.trim() === '') {
      return sendError(res, 'Domain is required', BAD_REQUEST);
    }

    const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./, '');

    // Resolve site via custom_domains (any custom domain linked to a site)
    const domainResult = await pool.query(
      `SELECT cd.site_id FROM custom_domains cd
       INNER JOIN sites s ON s.id = cd.site_id
       WHERE LOWER(TRIM(cd.domain)) = $1 AND s.status = $2`,
      [normalizedDomain, 'active']
    );

    let site = null;
    if (domainResult.rows.length > 0) {
      site = await SiteModel.getSiteById(domainResult.rows[0].site_id);
    }

    // Fallback: primary_domain on sites (legacy)
    if (!site) {
      const primaryResult = await pool.query(
        'SELECT * FROM sites WHERE LOWER(TRIM(primary_domain)) = $1 AND status = $2',
        [normalizedDomain, 'active']
      );
      site = primaryResult.rows[0];
    }

    if (!site) {
      return sendError(res, `Site with domain "${domain}" not found`, NOT_FOUND);
    }

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
      const has_ecommerce = await SiteFeatureModel.hasEcommerce(id);
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
          has_ecommerce: !!has_ecommerce,
        },
        customization: customization ? {
          ...customization,
          colors: typeof customization.colors === 'string' ? JSON.parse(customization.colors) : customization.colors,
          fonts: typeof customization.fonts === 'string' ? JSON.parse(customization.fonts) : customization.fonts,
          spacing: typeof customization.spacing === 'string' ? JSON.parse(customization.spacing) : customization.spacing,
          theme: typeof customization.theme === 'string' ? JSON.parse(customization.theme) : (customization.theme || null),
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
    
    // Ensure template has an id (required for validation)
    if (!template.id || template.id === null || template.id === undefined) {
      logger.error(`Template ${site.template_id} is missing or has invalid id field`, { 
        template,
        templateId: template.id,
        templateIdType: typeof template.id,
      });
      return sendError(res, `Template for site "${id}" is invalid (missing or invalid id)`, 500);
    }

    // Parse template config
    const templateConfig = typeof template.config === 'string' 
      ? JSON.parse(template.config) 
      : template.config;

    // Get customization settings (site-specific)
    const customization = await CustomizationModel.getCustomization(id);

    // Use PreviewService to resolve pages (same logic as template preview)
    // This ensures consistent page resolution with blockIds -> blocks conversion
    const PreviewService = require('../services/preview.service');
    
    // Build config object for preview service
    // Ensure template.id is a valid number/string (already validated above)
    const templateId = template.id;
    
    // Build template object - ensure id is always a valid number/string
    // Use undefined instead of null for optional fields to match Zod schema expectations
    // thumbnail_url is nullable, so include it even if null
    const templateObj = {
      id: templateId, // Use validated templateId (already checked above)
      ...(template.name ? { name: template.name } : {}),
      ...(template.slug ? { slug: template.slug } : {}),
      ...(template.category ? { category: template.category } : {}),
      config: templateConfig,
      ...(template.thumbnail_url !== undefined ? { thumbnail_url: template.thumbnail_url } : {}),
      ...(template.created_at ? { created_at: template.created_at } : {}),
      ...(template.updated_at ? { updated_at: template.updated_at } : {}),
    };
    
    // DEBUG: Log template object before passing to preview service
    logger.info(`[PublicAPI] Template object before preview service for site ${id}:`, {
      hasId: !!templateObj.id,
      id: templateObj.id,
      idType: typeof templateObj.id,
      idValue: templateObj.id,
      templateKeys: Object.keys(templateObj),
    });
    
    // For bio sites, pages are stored in the DB (not in template config)
    // For standard sites, pages come from template config
    let sitePages = templateConfig?.pages || [];
    if (template.category === 'bio') {
      const PageModel = require('../models/page.model');
      const dbPages = await PageModel.getSitePages(id);
      if (dbPages && dbPages.length > 0) {
        // Parse page content from JSON string if needed
        sitePages = dbPages.map(p => ({
          ...p,
          content: typeof p.content === 'string' ? JSON.parse(p.content) : (p.content || {}),
        }));
      }
    }

    const previewConfig = {
      site: {
        id: site.id,
        name: site.name,
        slug: site.slug,
        status: site.status,
        owner_id: site.owner_id,
        template_id: site.template_id,
        default_layout_id: site.default_layout_id,
        primary_domain: site.primary_domain,
        engine_version: site.engine_version,
        created_at: site.created_at,
        updated_at: site.updated_at,
      },
      customization: customization ? {
        ...customization,
        colors: typeof customization.colors === 'string' ? JSON.parse(customization.colors) : customization.colors,
        fonts: typeof customization.fonts === 'string' ? JSON.parse(customization.fonts) : customization.fonts,
        spacing: typeof customization.spacing === 'string' ? JSON.parse(customization.spacing) : customization.spacing,
        theme: typeof customization.theme === 'string' ? JSON.parse(customization.theme) : (customization.theme || null),
      } : null,
      pages: sitePages,
      template: templateObj, // Use the validated template object
    };

    // Use preview service to resolve pages (converts blockIds to blocks)
    const resolvedConfig = PreviewService.generateConfigForPreview(previewConfig);
    
    // DEBUG: Log template after preview service
    logger.info(`[PublicAPI] Template object after preview service for site ${id}:`, {
      hasTemplate: !!resolvedConfig.template,
      hasId: !!resolvedConfig.template?.id,
      id: resolvedConfig.template?.id,
      idType: resolvedConfig.template?.id ? typeof resolvedConfig.template.id : 'null',
      templateKeys: resolvedConfig.template ? Object.keys(resolvedConfig.template) : [],
    });
    
    // Filter pages based on published status (for active sites only)
    let pages = resolvedConfig.pages || [];
    
    if (site.status === 'active') {
      // For active sites, filter to published pages only
      const originalCount = pages.length;
      pages = pages.filter(page => {
        // Check both top-level published and settings.visibility.published
        const isPublished = page.published === true || 
                          page.settings?.visibility?.published === true;
        if (!isPublished) {
          return false;
        }
        // Only exclude if explicitly set to 'draft' status AND not published
        if (page.status === 'draft' && page.published !== true && page.settings?.visibility?.published !== true) {
          return false;
        }
        return true;
      });
      
      if (pages.length === 0 && originalCount > 0) {
        console.error(`[PublicAPI] All ${originalCount} pages were filtered out for active site ${site.id}. This site has no published pages.`);
      }
    }
    // For draft sites, return all pages (already resolved by preview service)

    // Add has_ecommerce for storefront (e.g. topnav cart icon)
    const has_ecommerce = await SiteFeatureModel.hasEcommerce(id);

    // Build config object using resolved config from preview service
    // PreviewService.generateConfigForPreview already validates the template, so we can trust it
    const config = {
      site: { ...resolvedConfig.site, has_ecommerce: !!has_ecommerce },
      customization: resolvedConfig.customization,
      pages: pages,
      template: resolvedConfig.template, // Use template as-is from preview service
    };
    
    // DEBUG: Log template in final config (only if there's an issue)
    if (!config.template || !config.template.id) {
      logger.warn(`[PublicAPI] Template missing or invalid in final config for site ${id}:`, {
        hasTemplate: !!config.template,
        templateId: config.template?.id,
        templateIdType: config.template?.id ? typeof config.template.id : 'null',
      });
    }

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

    // If site has no template, return minimal config
    if (!site.template_id) {
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
          theme: typeof customization.theme === 'string' ? JSON.parse(customization.theme) : (customization.theme || null),
        } : null,
        pages: [],
        template: null,
      };
      return sendSuccess(res, config, 'Draft config retrieved (no template assigned)', OK);
    }

    // Get template - pages come from template.config.pages
    const template = await TemplateModel.getTemplateById(site.template_id);
    if (!template) {
      return sendError(res, `Template for site "${id}" not found`, NOT_FOUND);
    }
    
    // Ensure template has an id (required for validation)
    if (!template.id || template.id === null || template.id === undefined) {
      logger.error(`Template ${site.template_id} is missing or has invalid id field`, { 
        template,
        templateId: template.id,
        templateIdType: typeof template.id,
      });
      return sendError(res, `Template for site "${id}" is invalid (missing or invalid id)`, 500);
    }

    // Parse template config
    const templateConfig = typeof template.config === 'string' 
      ? JSON.parse(template.config) 
      : template.config;

    // Get customization settings (site-specific)
    const customization = await CustomizationModel.getCustomization(id);

    // Use PreviewService to resolve pages (same logic as template preview)
    // This ensures consistent page resolution with blockIds -> blocks conversion
    const PreviewService = require('../services/preview.service');
    
    // Build config object for preview service
    // Ensure template.id is a valid number/string (already validated above)
    const templateId = template.id;
    
    // For bio sites, pages are stored in the DB (not in template config)
    let draftSitePages = templateConfig?.pages || [];
    if (template.category === 'bio') {
      const PageModel = require('../models/page.model');
      const dbPages = await PageModel.getSitePages(id);
      if (dbPages && dbPages.length > 0) {
        draftSitePages = dbPages.map(p => ({
          ...p,
          content: typeof p.content === 'string' ? JSON.parse(p.content) : (p.content || {}),
        }));
      }
    }

    const previewConfig = {
      site: {
        id: site.id,
        name: site.name,
        slug: site.slug,
        status: site.status,
        owner_id: site.owner_id,
        template_id: site.template_id,
        default_layout_id: site.default_layout_id,
        primary_domain: site.primary_domain,
        engine_version: site.engine_version,
        created_at: site.created_at,
        updated_at: site.updated_at,
      },
      customization: customization ? {
        ...customization,
        colors: typeof customization.colors === 'string' ? JSON.parse(customization.colors) : customization.colors,
        fonts: typeof customization.fonts === 'string' ? JSON.parse(customization.fonts) : customization.fonts,
        spacing: typeof customization.spacing === 'string' ? JSON.parse(customization.spacing) : customization.spacing,
        theme: typeof customization.theme === 'string' ? JSON.parse(customization.theme) : (customization.theme || null),
      } : null,
      pages: draftSitePages,
      template: {
        id: templateId, // Use validated templateId
        name: template.name || undefined,
        slug: template.slug || undefined,
        category: template.category || undefined,
        config: templateConfig,
        thumbnail_url: template.thumbnail_url || null, // thumbnail_url is nullable in schema
        created_at: template.created_at || undefined,
        updated_at: template.updated_at || undefined,
      },
    };

    // Use preview service to resolve pages (converts blockIds to blocks)
    const resolvedConfig = PreviewService.generateConfigForPreview(previewConfig);
    
    // For draft config, include ALL pages (already resolved by preview service)
    const pages = resolvedConfig.pages || [];

    // Build config object using resolved config from preview service
    // Build config object using resolved config from preview service
    // PreviewService.generateConfigForPreview already validates the template, so we can trust it
    const config = {
      site: resolvedConfig.site,
      customization: resolvedConfig.customization,
      pages: resolvedConfig.pages || [], // Draft config returns all pages
      template: resolvedConfig.template, // Use template as-is from preview service
    };
    
    // DEBUG: Log template in final config
    logger.info(`[PublicAPI] Final draft config for site ${id}:`, {
      hasTemplate: !!config.template,
      templateId: config.template?.id,
      templateIdType: config.template?.id ? typeof config.template.id : 'null',
    });

    return sendSuccess(res, config, 'Draft site config retrieved successfully', OK);
  } catch (error) {
    logger.error('Error getting draft site config (public):', error);
    return sendError(res, error.message || 'Failed to retrieve draft site config', 500);
  }
});

/**
 * Public catalog (products & categories) – read-only for storefront
 * Only returns published products. Site must exist and not be suspended.
 */
router.get('/:id/products', async (req, res) => {
  try {
    const { id: siteId } = req.params;
    const site = await SiteModel.getSiteById(siteId);
    if (!site) return sendError(res, 'Site not found', NOT_FOUND);
    if (site.status === 'suspended') return sendError(res, 'Site not available', NOT_FOUND);
    const { category_slug, category_id, type, limit, offset, sort, tag, exclude, q, min_price, max_price } = req.query;
    const options = { status: 'published' };
    if (category_slug) options.categorySlug = category_slug;
    if (category_id) options.categoryId = category_id;
    if (type) options.type = type;
    if (limit) options.limit = Math.min(parseInt(limit, 10) || 50, 100);
    if (offset) options.offset = parseInt(offset, 10) || 0;
    if (sort) options.sort = sort;
    if (tag) options.tag = tag;
    if (exclude) options.exclude = Array.isArray(exclude) ? exclude : exclude.split(',').map((id) => id.trim()).filter(Boolean);
    if (q) options.q = q;
    if (min_price !== undefined && min_price !== '') options.min_price = min_price;
    if (max_price !== undefined && max_price !== '') options.max_price = max_price;
    const [items, total] = await Promise.all([
      ProductService.listBySite(siteId, options),
      ProductService.countBySite(siteId, options),
    ]);
    return sendSuccess(res, { items, total }, 'Products retrieved successfully', OK);
  } catch (error) {
    logger.error('Error listing products (public):', error);
    return sendError(res, error.message || 'Failed to retrieve products', 500);
  }
});

router.get('/:id/products/:slugOrId', async (req, res) => {
  try {
    const { id: siteId, slugOrId } = req.params;
    const site = await SiteModel.getSiteById(siteId);
    if (!site) return sendError(res, 'Site not found', NOT_FOUND);
    if (site.status === 'suspended') return sendError(res, 'Site not available', NOT_FOUND);
    const product = await ProductService.getBySlugOrId(slugOrId, siteId);
    if (!product) return sendError(res, 'Product not found', NOT_FOUND);
    if (product.status !== 'published') return sendError(res, 'Product not found', NOT_FOUND);
    return sendSuccess(res, product, 'Product retrieved successfully', OK);
  } catch (error) {
    logger.error('Error getting product (public):', error);
    return sendError(res, error.message || 'Failed to retrieve product', 500);
  }
});

router.get('/:id/categories', async (req, res) => {
  try {
    const { id: siteId } = req.params;
    const site = await SiteModel.getSiteById(siteId);
    if (!site) return sendError(res, 'Site not found', NOT_FOUND);
    if (site.status === 'suspended') return sendError(res, 'Site not available', NOT_FOUND);
    const categories = await CategoryService.listBySite(siteId);
    return sendSuccess(res, categories, 'Categories retrieved successfully', OK);
  } catch (error) {
    logger.error('Error listing categories (public):', error);
    return sendError(res, error.message || 'Failed to retrieve categories', 500);
  }
});

/**
 * @route   POST /public/sites/:id/whatsapp-order
 * @desc    Generate a WhatsApp order message + URL from cart/product data (public, no auth).
 * @access  Public
 * @body    { items: [{name, variants, quantity, unitPrice}], deliveryZone: {name, fee}, currency? }
 */
router.post('/:id/whatsapp-order', async (req, res) => {
  try {
    const { id: siteId } = req.params;
    const site = await SiteModel.getSiteById(siteId);
    if (!site) return sendError(res, 'Site not found', NOT_FOUND);
    if (site.status === 'suspended') return sendError(res, 'Site not available', NOT_FOUND);

    const { items, deliveryZone, currency } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return sendError(res, 'items must be a non-empty array', BAD_REQUEST);
    }

    // Get WhatsApp number from site customization theme (established in Strategy 1)
    const customization = await CustomizationModel.getCustomization(siteId);
    const theme = typeof customization?.theme === 'string'
      ? JSON.parse(customization.theme)
      : (customization?.theme || {});

    const whatsappNumber = theme.whatsappNumber;
    if (!whatsappNumber) {
      return sendError(res, 'WhatsApp number not configured for this store', BAD_REQUEST);
    }

    // Get custom order template if configured
    const orderTemplate = theme.orderTemplate || undefined;

    const message = WhatsAppOrderService.generateOrderMessage(
      { items, deliveryZone: deliveryZone || null, currency: currency || '₦' },
      orderTemplate
    );
    const whatsappUrl = WhatsAppOrderService.generateWhatsAppURL(whatsappNumber, message);

    return sendSuccess(res, { whatsappUrl, message }, 'WhatsApp order URL generated', OK);
  } catch (error) {
    logger.error('Error generating WhatsApp order URL (public):', error);
    return sendError(res, error.message || 'Failed to generate WhatsApp order', 500);
  }
});

module.exports = router;

