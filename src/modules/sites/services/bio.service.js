const SiteModel = require('../models/site.model');
const CustomizationModel = require('../models/customization.model');
const SiteService = require('./site.service');
const TemplateService = require('./template.service');
const pool = require('../../../db/pool');
const { logger } = require('../../../shared/utils/logger');

class BioService {
  
  /**
   * Quick setup for a bio site
   * @param {Object} data - { businessName, whatsappNumber, logoFile }
   * @param {number} userId - Owner ID
   */
  static async quickSetup(data, userId) {
    const { businessName, whatsappNumber, logoFile } = data;
    
    // Validate userId exists and is valid
    if (!userId) {
      throw new Error('User not authenticated. Please log in again.');
    }
    
    // Verify user exists in database
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new Error('User not found. Please log in again.');
    }
    let slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    // Ensure uniqueness
    let isAvailable = await SiteModel.isSlugAvailable(slug);
    let counter = 1;
    let originalSlug = slug;
    while (!isAvailable) {
      slug = `${originalSlug}-${counter}`;
      isAvailable = await SiteModel.isSlugAvailable(slug);
      counter++;
    }

    // 2. Always create a new bio template for this user (don't reuse existing)
    // Look up component IDs so blocks get the correct componentId reference
    const componentIds = await BioService._getComponentIds(['bio-header', 'bio-links', 'product-grid']);

    const templateData = {
        name: 'Bio Commerce',
        description: 'Link-in-bio page optimized for social sellers.',
        category: 'bio',
        is_premium: false,
        is_active: true,
        config: {
          layout: "linear",
          blocks: [
            { id: "block-bio-header", type: "bio-header", componentName: "BioHeader", componentId: componentIds['bio-header'] || null, config: { templateId: "bio-header-default", showAvatar: true, showBio: true } },
            { id: "block-bio-products", type: "product-grid", componentName: "ProductGrid", componentId: componentIds['product-grid'] || null, config: { templateId: "productgrid-section-4", layout: "compact", columns: 2, ctaType: "whatsapp" } },
            { id: "block-bio-links", type: "bio-links", componentName: "BioLinks", componentId: componentIds['bio-links'] || null, config: { templateId: "bio-links-default", links: [] } },
            { id: "block-bio-footer", type: "footer", componentName: "Footer", config: { templateId: "footer-section-3" } },
            { id: "block-bio-store-products", type: "product-grid", componentName: "ProductGrid", componentId: componentIds['product-grid'] || null, config: { templateId: "productgrid-section-1", columns: 3, ctaType: "whatsapp" } }
          ],
          pages: [
            { 
              slug: "home", 
              title: "Home", 
              layout: "linear",
              layoutTemplate: "linear",
              regions: [
                { regionId: "main", regionName: "Main Content", regionType: "main", blockIds: ["block-bio-header", "block-bio-products", "block-bio-links", "block-bio-footer"] }
              ]
            },
            { 
              slug: "store", 
              title: "Store", 
              layout: "linear",
              layoutTemplate: "linear",
              regions: [
                { regionId: "main", regionName: "Main Content", regionType: "main", blockIds: ["block-bio-store-products"] }
              ]
            }
          ]
        }
    };
    const bioTemplate = await TemplateService.createTemplate(templateData, userId);

    // 3. Use SiteService to create site with template - handles everything (creation + pages)
    const siteData = {
      name: businessName,
      slug,
      status: 'active',
      ownerId: userId,
      defaultLayoutId: 'linear',
      siteType: 'bio',  // Set site type to bio
      templateId: bioTemplate.id  // SiteService applies template automatically
    };

    const site = await SiteService.createSite(siteData, userId);

    // 4. BioService only configures bio-specific settings (no DB writes for site/template)
    // Update customization (Logo + bio settings stored in theme for settings page)
    const themeDefaults = {
        mode: 'light',
        whatsappNumber: whatsappNumber || null,
        bioText: `Welcome to ${businessName}`,
        socialLinks: [],
        links: []
    };
    await CustomizationModel.upsertCustomization(site.id, {
        logoUrl: logoFile || null,
        theme: themeDefaults
    });

    // 5. Update Bio Header Config with specific details
    const defaultDeliveryZones = [
      { name: 'Nationwide', fee: 2500, estimatedDays: '3-5 days' },
      { name: 'Lagos', fee: 1500, estimatedDays: '1-2 days' }
    ];
    
    const bioSetupData = {
      whatsappNumber,
      bioText: `Welcome to ${businessName}`,
      deliveryZones: defaultDeliveryZones
    };
    await this._updateBioContent(site.id, bioSetupData);
    
    // Also sync template block config so template preview shows the data
    await this._updateTemplateBlocks(site.id, bioSetupData);

    const baseDomain = process.env.BASE_DOMAIN || 'smartstore.ng';
    const storeUrl = `https://${site.slug}.${baseDomain}`;

    // Ensure site_type is returned as expected by tests
    site.site_type = 'bio';

    logger.info('BioService.quickSetup returning:', { siteId: site.id, storeUrl });

    return {
        site,
        storeUrl
    };
  }

  static async getBioPage(slug) {
    const site = await SiteModel.getSiteBySlug(slug);
    if (!site) throw new Error('Site not found');
    return this._getBioPageData(site);
  }

  static async getBioPageById(siteId) {
    const site = await SiteModel.getSiteById(siteId);
    if (!site) throw new Error('Site not found');
    return this._getBioPageData(site);
  }

  static async _getBioPageData(site) {
    const customization = await CustomizationModel.getCustomization(site.id);
    const theme = customization?.theme || {};
    const ProductService = require('./catalog/product.service');
    let products = await ProductService.listBySite(site.id, { status: 'published' });
    
    // Ensure numeric fields are numbers (PG returns numeric as string)
    products = products.map(p => ({
        ...p,
        price: Number(p.price),
        compare_price: p.compare_price ? Number(p.compare_price) : null
    }));

    // Extract commerce settings from page content OR use site-level defaults
    const PageModel = require('../models/page.model');
    const pages = await PageModel.getSitePages(site.id);
    const homePage = pages.find(p => p.slug === 'home');
    
    let commerceSettings = { 
        whatsappNumber: theme.whatsappNumber || null, 
        deliveryZones: theme.deliveryZones || [] 
    };
    let profile = { 
        bioText: theme.bioText || null, 
        socialLinks: theme.socialLinks || [], 
        links: theme.links || [] 
    };

    if (homePage && homePage.content) {
        // Bio pages store blocks in content.regions[].blocks (regions-based structure)
        const allBlocks = [];
        if (homePage.content.regions && Array.isArray(homePage.content.regions)) {
            homePage.content.regions.forEach(region => {
                if (region.blocks && Array.isArray(region.blocks)) {
                    allBlocks.push(...region.blocks);
                }
            });
        }

        const bioHeader = allBlocks.find(b => b.type === 'bio-header');
        if (bioHeader && bioHeader.config) {
            // Block-level config overrides site-level defaults
            commerceSettings.whatsappNumber = bioHeader.config.whatsappNumber || theme.whatsappNumber;
            commerceSettings.deliveryZones = bioHeader.config.deliveryZones || theme.deliveryZones || [];

            profile.bioText = bioHeader.config.bioText || theme.bioText;
            profile.socialLinks = (bioHeader.config.socialLinks && bioHeader.config.socialLinks.length > 0)
                ? bioHeader.config.socialLinks
                : (theme.socialLinks || []);
        }
        const bioLinks = allBlocks.find(b => b.type === 'bio-links');
        if (bioLinks && bioLinks.config) {
            profile.links = (bioLinks.config.links && bioLinks.config.links.length > 0)
                ? bioLinks.config.links
                : (theme.links || []);
        }
    }

    return {
        site,
        customization,
        products,
        commerceSettings,
        profile,
        // For backwards compatibility or specific test expectations
        ...profile
    };
  }

  /**
   * Get commerce settings (site-level defaults)
   * These are stored in site_customization.theme and serve as defaults
   * Block-level config can override these
   */
  static async getCommerceSettings(siteId, userId) {
      // Verify ownership
      await SiteService.getSiteById(siteId, userId);
      
      // Get site-level defaults from customization.theme
      const customization = await CustomizationModel.getCustomization(siteId);
      const theme = customization?.theme || {};
      
      // Get page-level overrides (if any)
      const PageModel = require('../models/page.model');
      const pages = await PageModel.getSitePages(siteId);
      const homePage = pages.find(p => p.slug === 'home');
      
      // Bio pages store blocks in content.regions[].blocks (regions-based structure)
      let blockOverrides = { whatsappNumber: null, deliveryZones: [], bioText: null, socialLinks: [], links: [] };
      if (homePage && homePage.content) {
          const allBlocks = [];
          if (homePage.content.regions && Array.isArray(homePage.content.regions)) {
              homePage.content.regions.forEach(region => {
                  if (region.blocks && Array.isArray(region.blocks)) {
                      allBlocks.push(...region.blocks);
                  }
              });
          }
          const bioHeader = allBlocks.find(b => b.type === 'bio-header');
          if (bioHeader && bioHeader.config) {
              blockOverrides.whatsappNumber = bioHeader.config.whatsappNumber || null;
              blockOverrides.deliveryZones = bioHeader.config.deliveryZones || [];
              blockOverrides.bioText = bioHeader.config.bioText || null;
              blockOverrides.socialLinks = bioHeader.config.socialLinks || [];
          }
          const bioLinks = allBlocks.find(b => b.type === 'bio-links');
          if (bioLinks && bioLinks.config) {
              blockOverrides.links = bioLinks.config.links || [];
          }
      }

      // Return effective settings: block-level overrides take priority over site-level theme
      // Override order: site (theme) → block (config)
      return {
          whatsappNumber: blockOverrides.whatsappNumber || theme.whatsappNumber || null,
          deliveryZones: blockOverrides.deliveryZones.length > 0 ? blockOverrides.deliveryZones : (theme.deliveryZones || []),
          bioText: blockOverrides.bioText || theme.bioText || null,
          socialLinks: blockOverrides.socialLinks.length > 0 ? blockOverrides.socialLinks : (theme.socialLinks || []),
          links: blockOverrides.links.length > 0 ? blockOverrides.links : (theme.links || []),
      };
  }

  /**
   * Update commerce settings (site-level defaults)
   * These are stored in site_customization.theme
   */
  static async updateCommerceSettings(siteId, data, userId) {
      // Verify ownership
      await SiteService.getSiteById(siteId, userId);
      
      // Get existing theme
      const customization = await CustomizationModel.getCustomization(siteId);
      const existingTheme = customization?.theme || {};
      
      // Merge new bio settings into theme (these become defaults)
      const newTheme = {
          ...existingTheme,
          ...(data.whatsappNumber !== undefined && { whatsappNumber: data.whatsappNumber }),
          ...(data.deliveryZones !== undefined && { deliveryZones: data.deliveryZones }),
          ...(data.bioText !== undefined && { bioText: data.bioText }),
          ...(data.socialLinks !== undefined && { socialLinks: data.socialLinks }),
          ...(data.links !== undefined && { links: data.links })
      };
      
      // Save to customization
      await CustomizationModel.upsertCustomization(siteId, {
          theme: newTheme
      });
      
      // Always sync page block content with updated settings
      await this._updateBioContent(siteId, data);
      
      // Also sync template block config so template preview shows latest data
      await this._updateTemplateBlocks(siteId, data);
      
      // Return updated settings
      return await this.getCommerceSettings(siteId, userId);
  }

  static async updateBioProfile(siteId, data, userId) {
    // Verify ownership
    const site = await SiteService.getSiteById(siteId, userId);
    
    // Update customization if needed
    if (data.logoUrl || data.theme) {
       await CustomizationModel.upsertCustomization(siteId, {
         logoUrl: data.logoUrl,
         theme: data.theme
       });
    }

    // Update page content (Bio text, social links, whatsapp)
    await this._updateBioContent(siteId, data);
    
    // Also sync template block config so template preview shows latest data
    await this._updateTemplateBlocks(siteId, data);
    
    // Return updated profile data from customization.theme (source of truth)
    const customization = await CustomizationModel.getCustomization(siteId);
    const theme = customization?.theme ?
        (typeof customization.theme === 'string' ? JSON.parse(customization.theme) : customization.theme)
        : {};
    
    return {
        bioText: theme.bioText || null,
        socialLinks: theme.socialLinks || [],
        links: theme.links || [],
        whatsappNumber: theme.whatsappNumber || null
    };
  }

  // --- Helpers ---

  static async _updateBioContent(siteId, data) {
      const PageModel = require('../models/page.model');
      
      const pages = await PageModel.getSitePages(siteId);
      const homePage = pages.find(p => p.slug === 'home');
      
      if (!homePage || !homePage.content) return;

      // Pages use regions-based structure: content.regions[].blocks
      // This is the standard system structure - no flat blocks support
      const allBlocks = [];
      if (homePage.content.regions && Array.isArray(homePage.content.regions)) {
          homePage.content.regions.forEach(region => {
              if (region.blocks && Array.isArray(region.blocks)) {
                  allBlocks.push(...region.blocks);
              }
          });
      }

      if (allBlocks.length === 0) return;

      let modified = false;

      // Normalize WhatsApp number helper
      const normalizePhone = (phone) => {
          if (phone && phone.startsWith('0')) {
              return '234' + phone.substring(1);
          }
          return phone;
      };

      // Update Bio Header
      const bioHeader = allBlocks.find(b => b.type === 'bio-header');
      if (bioHeader) {
          if (!bioHeader.config) bioHeader.config = {};
          if (data.whatsappNumber !== undefined) {
              bioHeader.config.whatsappNumber = normalizePhone(data.whatsappNumber);
          }
          if (data.deliveryZones !== undefined) bioHeader.config.deliveryZones = data.deliveryZones;
          if (data.bioText !== undefined) bioHeader.config.bioText = data.bioText;
          if (data.socialLinks !== undefined) bioHeader.config.socialLinks = data.socialLinks;
          if (data.showAvatar !== undefined) bioHeader.config.showAvatar = data.showAvatar;
          modified = true;
      }

      // Update Bio Links
      const bioLinks = allBlocks.find(b => b.type === 'bio-links');
      if (bioLinks) {
          if (!bioLinks.config) bioLinks.config = {};
          if (data.links !== undefined) {
              bioLinks.config.links = data.links;
              modified = true;
          }
          // Upsert WhatsApp link: update URL if number changed, insert if not present
          if (data.whatsappNumber) {
              const phone = normalizePhone(data.whatsappNumber);
              const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent('Hi, I found your store and would like to connect!')}`;
              const existingLinks = bioLinks.config.links || [];
              const whatsappIdx = existingLinks.findIndex(link =>
                  (link.title && link.title.toLowerCase().includes('whatsapp')) ||
                  (link.url && link.url.includes('wa.me'))
              );
              if (whatsappIdx >= 0) {
                  existingLinks[whatsappIdx] = { ...existingLinks[whatsappIdx], url: whatsappUrl };
                  bioLinks.config.links = existingLinks;
              } else {
                  bioLinks.config.links = [
                      { title: 'WhatsApp', url: whatsappUrl, icon: 'phone' },
                      ...existingLinks
                  ];
              }
              modified = true;
          }
      }

      if (modified) {
          await PageModel.updatePage(homePage.id, siteId, { content: homePage.content });
      }
  }

  /**
   * Update the template's block config with bio settings.
   * This ensures template preview shows the latest bio data.
   * Called whenever bio settings are saved/edited.
   */
  static async _updateTemplateBlocks(siteId, data) {
      const TemplateModel = require('../models/template.model');
      
      // Get the site's template
      const siteTemplate = await TemplateModel.getSiteTemplate(siteId);
      if (!siteTemplate || !siteTemplate.config) return;
      
      const templateConfig = typeof siteTemplate.config === 'string'
          ? JSON.parse(siteTemplate.config)
          : siteTemplate.config;
      
      if (!templateConfig.blocks || !Array.isArray(templateConfig.blocks)) return;
      
      let modified = false;
      
      // Normalize WhatsApp number helper
      const normalizePhone = (phone) => {
          if (phone && phone.startsWith('0')) {
              return '234' + phone.substring(1);
          }
          return phone;
      };
      
      // Update bio-header block config
      const bioHeader = templateConfig.blocks.find(b => b.type === 'bio-header');
      if (bioHeader) {
          if (!bioHeader.config) bioHeader.config = {};
          if (data.whatsappNumber !== undefined) {
              bioHeader.config.whatsappNumber = normalizePhone(data.whatsappNumber);
          }
          if (data.deliveryZones !== undefined) bioHeader.config.deliveryZones = data.deliveryZones;
          if (data.bioText !== undefined) bioHeader.config.bioText = data.bioText;
          if (data.socialLinks !== undefined) bioHeader.config.socialLinks = data.socialLinks;
          modified = true;
      }
      
      // Update bio-links block config
      const bioLinks = templateConfig.blocks.find(b => b.type === 'bio-links');
      if (bioLinks) {
          if (!bioLinks.config) bioLinks.config = {};
          if (data.links !== undefined) {
              bioLinks.config.links = data.links;
              modified = true;
          }
          // Upsert WhatsApp link: update URL if number changed, insert if not present
          if (data.whatsappNumber) {
              const phone = normalizePhone(data.whatsappNumber);
              const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent('Hi, I found your store and would like to connect!')}`;
              const existingLinks = bioLinks.config.links || [];
              const whatsappIdx = existingLinks.findIndex(link =>
                  (link.title && link.title.toLowerCase().includes('whatsapp')) ||
                  (link.url && link.url.includes('wa.me'))
              );
              if (whatsappIdx >= 0) {
                  existingLinks[whatsappIdx] = { ...existingLinks[whatsappIdx], url: whatsappUrl };
                  bioLinks.config.links = existingLinks;
              } else {
                  bioLinks.config.links = [
                      { title: 'WhatsApp', url: whatsappUrl, icon: 'phone' },
                      ...existingLinks
                  ];
              }
              modified = true;
          }
      }
      
      if (modified) {
          await TemplateModel.updateTemplate(siteTemplate.id, { config: templateConfig });
      }
  }

  static async configureBioStore(siteId, bioConfig) {
    // This method could be used to configure bio settings after site is created
    // For now it delegates to _updateBioContent
    return await this._updateBioContent(siteId, bioConfig);
  }

  /**
   * Look up component registry IDs by component_type.
   * Returns a map of { componentType: id } for use when creating blocks.
   * Fails gracefully so quickSetup can proceed even if registry is unavailable.
   */
  static async _getComponentIds(types) {
    try {
      const result = await pool.query(
        `SELECT component_type, id FROM component_registry
         WHERE component_type = ANY($1::text[]) AND is_system = true`,
        [types]
      );
      const map = {};
      for (const row of result.rows) {
        map[row.component_type] = row.id;
      }
      return map;
    } catch (err) {
      logger.warn('BioService._getComponentIds: could not look up component IDs:', err?.message);
      return {};
    }
  }
}

module.exports = BioService;
