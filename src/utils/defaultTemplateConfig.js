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
 * Generate complete default template config
 * Returns an object that can be merged into template.config
 */
function generateDefaultTemplateConfig() {
  const blocks = getDefaultBlocks();
  const pages = getDefaultPages();

  return {
    blocks,
    pages,
    theme: {
      colors: {
        primary: '#3b82f6',
        secondary: '#6b7280',
        accent: '#f59e0b',
        background: '#ffffff',
        text: '#1f2937',
        textSecondary: '#6b7280',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        button: 'Inter, sans-serif',
      },
    },
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
  const mergedBlocks = [
    ...(config.blocks || []), // Keep existing blocks first
    ...(defaults.blocks || []).filter(
      (defaultBlock) => !existingBlockIds.has(defaultBlock.id)
    ),
  ];

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
  
  return {
    ...defaults,
    ...config,
    blocks: mergedBlocks,
    pages: mergedPages,
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

module.exports = {
  generateDefaultTemplateConfig,
  getDefaultBlocks,
  getDefaultPages,
  isMinimalConfig,
  mergeWithDefaults,
  hasDefaultPages,
};

