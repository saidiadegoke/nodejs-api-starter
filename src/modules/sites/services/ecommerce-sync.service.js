const TemplateModel = require('../models/template.model');
const SiteFeatureModel = require('../models/site-feature.model');
const { isEcommerceBlockType } = require('../constants/ecommerce-block-types');

/**
 * Resolve page content from template format (regions with blockIds) into regions with blocks.
 * @param {object} pageContent - page.content (may have regions[].blockIds or regions[].blocks)
 * @param {object} templateConfig - template.config with blocks array
 * @returns {object} content in form { regions: [{ id, blocks: [...] }] }
 */
function resolveContentBlockIds(pageContent, templateConfig) {
  const templateBlocks = templateConfig?.blocks || [];
  const blockMap = new Map();
  templateBlocks.forEach((b) => {
    if (b && b.id) {
      blockMap.set(b.id, { ...b, type: b.type || b.componentId || b.component_id });
    }
  });
  const pageRegions = pageContent?.regions || pageContent?.regionIds || [];
  if (!Array.isArray(pageRegions) || pageRegions.length === 0) {
    return pageContent || {};
  }
  const regions = pageRegions.map((region) => {
    const resolved = { id: region.regionId || region.id, blocks: [] };
    if (region.blockIds && Array.isArray(region.blockIds)) {
      resolved.blocks = region.blockIds.map((bid) => blockMap.get(bid)).filter(Boolean);
    } else if (region.blocks && Array.isArray(region.blocks)) {
      resolved.blocks = region.blocks;
    }
    return resolved;
  });
  return { regions };
}

/**
 * Collect all blocks from content (content.regions[].blocks[] or content.blocks[]).
 * @param {object} content
 * @returns {object[]} blocks with id and type/componentId
 */
function collectBlocksFromContent(content) {
  if (!content || typeof content !== 'object') return [];
  const blocks = [];
  if (Array.isArray(content.blocks)) {
    blocks.push(...content.blocks.filter((b) => b && (b.id || b.blockId)));
  }
  const regions = content.regions || content.regionIds;
  if (Array.isArray(regions)) {
    for (const region of regions) {
      const regionBlocks = region.blocks || [];
      blocks.push(...regionBlocks.filter((b) => b && (b.id || b.blockId)));
    }
  }
  return blocks;
}

/**
 * Returns true if template config contains at least one e-commerce block.
 * Checks config.blocks and every config.pages[].content (resolved with config.blocks).
 */
function configHasEcommerceBlock(templateConfig) {
  const configObj = typeof templateConfig === 'string' ? JSON.parse(templateConfig) : templateConfig;
  if (!configObj) return false;

  const blocksToCheck = [];

  // Direct blocks array
  const globalBlocks = configObj.blocks || [];
  blocksToCheck.push(...globalBlocks);

  // Blocks from each page's content (resolve blockIds from config.blocks)
  const pages = configObj.pages || [];
  for (const page of pages) {
    const pageContent = page.content || page;
    const resolved = resolveContentBlockIds(pageContent, configObj);
    blocksToCheck.push(...collectBlocksFromContent(resolved));
  }

  for (const block of blocksToCheck) {
    const blockType = block.type || block.componentId || block.component_id;
    if (isEcommerceBlockType(blockType)) return true;
  }
  return false;
}

/**
 * Sync e-commerce feature for all sites using this template after template config is updated.
 * If config contains any e-commerce block type, sets site_features(site_id, 'ecommerce') for each site.
 * Does not clear the feature when config no longer has e-commerce (Phase 1).
 * @param {number|string} templateId
 * @param {object} templateConfig - template.config (pages + blocks)
 * @returns {{ sitesProcessed: number, hasEcommerce: boolean }}
 */
async function syncEcommerceForSitesUsingTemplate(templateId, templateConfig) {
  const configObj = typeof templateConfig === 'string' ? JSON.parse(templateConfig) : templateConfig;
  const hasEcommerce = configHasEcommerceBlock(configObj);
  if (!hasEcommerce) {
    return { sitesProcessed: 0, hasEcommerce: false };
  }

  const siteIds = await TemplateModel.getSiteIdsByTemplateId(parseInt(templateId, 10));
  if (siteIds.length === 0) return { sitesProcessed: 0, hasEcommerce: true };

  await SiteFeatureModel.setEcommerceForSites(siteIds);
  return { sitesProcessed: siteIds.length, hasEcommerce: true };
}

module.exports = {
  configHasEcommerceBlock,
  syncEcommerceForSitesUsingTemplate,
};
