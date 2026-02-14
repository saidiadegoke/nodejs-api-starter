/**
 * Default Template Config Utility
 * Generates default template configuration with pages and blocks
 * Used when creating new templates to provide starter pages
 */

const fs = require('fs');
const path = require('path');

// Load default pages and blocks from JSON files
const blocksPath = path.join(__dirname, 'default-pages', 'blocks.json');
const homePagePath = path.join(__dirname, 'default-pages', 'home.json');
const aboutPagePath = path.join(__dirname, 'default-pages', 'about.json');
const contactPagePath = path.join(__dirname, 'default-pages', 'contact.json');
const servicesPagePath = path.join(__dirname, 'default-pages', 'services.json');
const storePagePath = path.join(__dirname, 'default-pages', 'store.json');

/**
 * Get default blocks
 */
function getDefaultBlocks() {
  try {
    const blocksData = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));
    return blocksData.blocks || [];
  } catch (error) {
    console.error('Error loading default blocks:', error);
    return [];
  }
}

/**
 * Get default pages
 */
function getDefaultPages() {
  try {
    const pages = [];
    
    // Load each page file
    const pageFiles = [
      { path: homePagePath, required: true },
      { path: aboutPagePath, required: false },
      { path: contactPagePath, required: false },
      { path: servicesPagePath, required: false },
      { path: storePagePath, required: false },
    ];

    for (const { path: filePath, required } of pageFiles) {
      if (fs.existsSync(filePath)) {
        try {
          const pageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          pages.push(pageData);
        } catch (error) {
          console.error(`Error loading page from ${filePath}:`, error);
          if (required) throw error;
        }
      } else if (required) {
        throw new Error(`Required page file not found: ${filePath}`);
      }
    }

    return pages;
  } catch (error) {
    console.error('Error loading default pages:', error);
    return [];
  }
}

/**
 * First color set (Teal default) and first font (Modern Sans / Inter) for new templates.
 * Matches ThemeCustomizer STANDARD_THEME_PRESETS['teal-default'] and first font pairing.
 */
const DEFAULT_THEME_FOR_NEW_TEMPLATE = {
  colors: {
    primary: '#008284',
    primaryLight: '#00a3a5',
    primaryDark: '#006263',
    secondary: '#475569',
    secondaryLight: '#64748b',
    secondaryDark: '#334155',
    accent: '#008284',
    accentLight: '#e0f7f7',
    accentDark: '#006263',
    background: '#ffffff',
    backgroundAlt: '#f9fafb',
    surface: '#ffffff',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textInverse: '#ffffff',
    border: '#e5e7eb',
    borderLight: '#f3f4f6',
    borderDark: '#d1d5db',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
  fonts: {
    heading: 'Inter, sans-serif',
    body: 'Inter, sans-serif',
    button: 'Inter, sans-serif',
  },
};

/**
 * Generate complete default template config
 * Returns an object that can be merged into template.config.
 * Uses first color set (Teal) and first font (Modern Sans / Inter).
 */
function generateDefaultTemplateConfig() {
  const blocks = getDefaultBlocks();
  const pages = getDefaultPages();

  return {
    blocks,
    pages,
    theme: { ...DEFAULT_THEME_FOR_NEW_TEMPLATE },
    defaultLayout: 'regions',
    defaultPage: 'home',
  };
}

/**
 * Check if a template config is minimal (empty or has only empty home page)
 */
function isMinimalConfig(config) {
  if (!config) return true;
  
  // Check if pages array is empty or has only one empty home page
  const pages = config.pages || [];
  if (pages.length === 0) return true;
  if (pages.length === 1 && pages[0].slug === 'home') {
    // Check if home page has no content
    const homePage = pages[0];
    const hasContent = (
      (homePage.regions && homePage.regions.length > 0) ||
      (homePage.blockIds && homePage.blockIds.length > 0) ||
      (homePage.content && Object.keys(homePage.content).length > 0)
    );
    return !hasContent;
  }
  
  return false;
}

/**
 * Merge default config with provided config
 * Default config fills in missing parts but doesn't override existing content
 * Avoids duplicating pages (by slug) and blocks (by id)
 */
function mergeWithDefaults(config = {}) {
  const defaults = generateDefaultTemplateConfig();
  
  // Get existing page slugs and block IDs to avoid duplicates
  const existingPageSlugs = new Set((config.pages || []).map(p => p.slug));
  const existingBlockIds = new Set((config.blocks || []).map(b => b.id));

  // Merge blocks (only add defaults that don't exist)
  const defaultBlocksById = new Map((defaults.blocks || []).map((b) => [b.id, b]));
  const mergedBlocks = [
    ...(config.blocks || []), // Keep existing blocks first
    ...(defaults.blocks || []).filter(
      (defaultBlock) => !existingBlockIds.has(defaultBlock.id)
    ),
  ].map((block) => {
    const defaultBlock = defaultBlocksById.get(block.id);
    if (!defaultBlock) return block;
    // Enrich existing blocks that match a default: ensure templateId and componentName for builder UI
    const enriched = { ...block };
    if (!enriched.templateId && defaultBlock.templateId) enriched.templateId = defaultBlock.templateId;
    if (!enriched.componentName && defaultBlock.componentName) enriched.componentName = defaultBlock.componentName;
    // For hero blocks with subdued defaults (about/contact/services), ensure subdued keys exist so override works
    const subduedHeroIds = ['block-about-hero', 'block-contact-hero', 'block-services-hero'];
    const subduedKeys = ['showPrimaryButton', 'showSecondaryButton', 'showStats', 'headlineSize'];
    if (subduedHeroIds.includes(block.id) && defaultBlock.data) {
      const data = enriched.data || {};
      enriched.data = { ...data };
      subduedKeys.forEach((key) => {
        if (defaultBlock.data[key] !== undefined && data[key] === undefined) {
          enriched.data[key] = defaultBlock.data[key];
        }
      });
    }
    return enriched;
  });

  // Merge pages: merge default structure into existing pages if they're incomplete
  const mergedPages = (config.pages || []).map(existingPage => {
    const defaultPage = defaults.pages?.find(dp => dp.slug === existingPage.slug);
    
    // If default page exists and existing page is incomplete (no regions, empty content)
    if (defaultPage) {
      const hasRegions = existingPage.regions && existingPage.regions.length > 0;
      const hasContentRegions = existingPage.content?.regions && existingPage.content.regions.length > 0;
      const hasBlocks = existingPage.content?.blocks && existingPage.content.blocks.length > 0;
      const hasBlockIds = existingPage.blockIds && existingPage.blockIds.length > 0;
      
      // If page is incomplete (no regions/blocks), merge with default
      if (!hasRegions && !hasContentRegions && !hasBlocks && !hasBlockIds) {
        console.log(`[defaultTemplateConfig] Merging incomplete page "${existingPage.slug}" with default structure`);
        // Merge default page structure into existing page, preserving any custom fields
        return {
          ...defaultPage,
          ...existingPage, // Keep existing fields (slug, title, etc.)
          // But ensure regions are included if default has them
          regions: defaultPage.regions || existingPage.regions,
          // Merge settings if both exist
          settings: {
            ...defaultPage.settings,
            ...existingPage.settings,
          },
        };
      }
    }
    
    // Page is complete or no default exists, keep as is
    return existingPage;
  });
  
  // Add default pages that don't exist yet
  const newDefaultPages = (defaults.pages || []).filter(
    (defaultPage) => !existingPageSlugs.has(defaultPage.slug)
  );
  
  const finalMergedPages = [...mergedPages, ...newDefaultPages];
  
  // Debug logging
  if (newDefaultPages.length > 0) {
    console.log(`[defaultTemplateConfig] Adding ${newDefaultPages.length} new default pages:`, 
      newDefaultPages.map(p => p.slug).join(', '));
  }
  console.log(`[defaultTemplateConfig] Total pages after merge: ${finalMergedPages.length} (was ${(config.pages || []).length})`);
  
  return {
    ...defaults,
    ...config,
    blocks: mergedBlocks,
    pages: finalMergedPages, // Use finalMergedPages which includes new default pages
    // Merge theme (provided theme overrides defaults)
    theme: {
      ...defaults.theme,
      ...(config.theme || {}),
      colors: {
        ...defaults.theme.colors,
        ...(config.theme?.colors || {}),
      },
      fonts: {
        ...defaults.theme.fonts,
        ...(config.theme?.fonts || {}),
      },
    },
  };
}

/**
 * Check if default pages are missing from config
 */
function hasDefaultPages(config = {}) {
  const defaultSlugs = ['home', 'about', 'contact', 'services', 'store'];
  const existingSlugs = new Set((config.pages || []).map(p => p.slug));
  
  return defaultSlugs.every(slug => existingSlugs.has(slug));
}

const PAGE_TYPE_TO_FILE = {
  home: homePagePath,
  about: aboutPagePath,
  contact: contactPagePath,
  services: servicesPagePath,
  store: storePagePath,
};

/**
 * Get default page structure for a single page type.
 * Used when adding a page from a template (e.g. "Add Page" → choose "About").
 * @param {string} pageType - One of: 'home' | 'about' | 'contact' | 'services' | 'store'
 * @returns {object|null} Page object (slug, title, layout, regions, blockIds, settings) or null
 */
function getDefaultPageStructure(pageType) {
  const filePath = PAGE_TYPE_TO_FILE[pageType];
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const pageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return pageData;
  } catch (error) {
    console.error(`Error loading default page structure for ${pageType}:`, error);
    return null;
  }
}

/**
 * Get blocks required for a specific page type (all blockIds referenced in that page's regions).
 * @param {string} pageType - One of: 'home' | 'about' | 'contact' | 'services' | 'store'
 * @returns {Array} Block configs for that page
 */
function getDefaultBlocksForPage(pageType) {
  const page = getDefaultPageStructure(pageType);
  if (!page || !page.regions) return [];
  const blockIds = new Set();
  for (const region of page.regions) {
    (region.blockIds || []).forEach((id) => blockIds.add(id));
  }
  const allBlocks = getDefaultBlocks();
  return allBlocks.filter((b) => blockIds.has(b.id));
}

module.exports = {
  generateDefaultTemplateConfig,
  getDefaultBlocks,
  getDefaultPages,
  getDefaultPageStructure,
  getDefaultBlocksForPage,
  isMinimalConfig,
  mergeWithDefaults,
  hasDefaultPages,
};

