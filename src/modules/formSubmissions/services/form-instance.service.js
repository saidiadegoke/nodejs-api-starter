const FormInstanceModel = require('../models/form-instance.model');
const PageModel = require('../../sites/models/page.model');
const SiteModel = require('../../sites/models/site.model');
const TemplateModel = require('../../sites/models/template.model');

/**
 * Resolve page content when stored in template format (regions with blockIds).
 * Builds regions[].blocks from templateConfig.blocks so findBlockInContent can find the block.
 * @param {object} pageContent - page.content (may have regions[].blockIds or regions[].blocks)
 * @param {object} templateConfig - template.config with blocks array
 * @returns {object} content in form { regions: [{ id, blocks: [...] }] }
 */
function resolveContentBlockIds(pageContent, templateConfig) {
  const templateBlocks = templateConfig?.blocks || [];
  const blockMap = new Map();
  templateBlocks.forEach((b) => {
    if (b && b.id) blockMap.set(b.id, { ...b, type: b.type || b.componentId || b.component_id });
  });
  const pageRegions = pageContent?.regions || [];
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
 * Collect all blocks that are form types from page content.
 * Supports content.regions[].blocks[] and content.blocks[].
 * Returns array of { block, blockType } (blockType may be 'hero-quote-form' for hero with form).
 */
function collectFormBlocksFromContent(content) {
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
  const out = [];
  for (const block of blocks) {
    let blockType = FormInstanceModel.getBlockType(block);
    if (blockType === 'hero') {
      const data = block.data || {};
      const settings = block.settings || {};
      const hasQuoteForm = data.primaryButtonType === 'quoteForm' || data.visualElement === 'form' || settings.visualElement === 'form';
      if (hasQuoteForm) blockType = 'hero-quote-form';
    }
    if (blockType && FormInstanceModel.FORM_BLOCK_TYPES.includes(blockType)) {
      out.push({ block, blockType });
    }
  }
  return out;
}

/**
 * Sync form instances for a page: upsert one form_instance per form block in content.
 * Call after page create/update when content has resolved blocks (regions[].blocks or content.blocks).
 * Does not remove form_instances when blocks are removed (Phase 1).
 * @param {number} siteId
 * @param {number} pageId
 * @param {object} content - page content with regions[].blocks[] or blocks[]
 * @returns {{ synced: number }}
 */
async function syncFormInstancesForPage(siteId, pageId, content) {
  const siteIdNum = parseInt(siteId, 10);
  const formBlocks = collectFormBlocksFromContent(content);
  let synced = 0;
  for (const { block, blockType } of formBlocks) {
    const blockId = block.id || block.blockId;
    if (!blockId) continue;
    const displayName = block.name || block.displayName || null;
    const configSnapshot = block.data || block.settings ? { data: block.data, settings: block.settings } : null;
    await FormInstanceModel.upsert(siteIdNum, pageId, blockId, blockType, displayName, configSnapshot);
    synced++;
  }
  return { synced };
}

/**
 * Sync form instances for all sites using this template after template config is updated.
 * For each site that has a page row matching a template page slug, resolves blockIds from
 * template.blocks and upserts form_instances so the dashboard shows form links without waiting for first submit.
 * @param {number|string} templateId
 * @param {object} templateConfig - template.config (pages + blocks)
 * @returns {{ sitesProcessed: number, totalSynced: number }}
 */
async function syncFormInstancesForSitesUsingTemplate(templateId, templateConfig) {
  const templateConfigObj = typeof templateConfig === 'string' ? JSON.parse(templateConfig) : templateConfig;
  const siteIds = await TemplateModel.getSiteIdsByTemplateId(parseInt(templateId, 10));
  let sitesProcessed = 0;
  let totalSynced = 0;
  const templatePages = templateConfigObj?.pages || [];
  if (templatePages.length === 0) return { sitesProcessed: 0, totalSynced: 0 };

  for (const siteId of siteIds) {
    try {
      const sitePages = await PageModel.getSitePages(siteId);
      const slugToPage = new Map(sitePages.map((p) => [p.slug, p]));
      for (const templatePage of templatePages) {
        const slug = templatePage.slug;
        if (!slug) continue;
        const page = slugToPage.get(slug);
        if (!page) continue;
        const pageContent = templatePage.content || templatePage;
        const resolvedContent = resolveContentBlockIds(pageContent, templateConfigObj);
        const formBlocks = collectFormBlocksFromContent(resolvedContent);
        if (formBlocks.length === 0) continue;
        const { synced } = await syncFormInstancesForPage(siteId, page.id, resolvedContent);
        totalSynced += synced;
      }
      sitesProcessed++;
    } catch (err) {
      // Log but continue with other sites
      const { logger } = require('../../../shared/utils/logger');
      logger.warn(`[FormInstanceService] Sync for site ${siteId} (template ${templateId}) failed:`, err.message);
    }
  }
  return { sitesProcessed, totalSynced };
}

/**
 * Resolve form instance by id (must belong to siteId)
 */
async function getById(id, siteId) {
  return FormInstanceModel.getById(id, siteId);
}

/**
 * List form instances for site, optional filter by page slug
 */
async function listBySite(siteId, pageSlug = null) {
  return FormInstanceModel.listBySite(siteId, pageSlug);
}

/**
 * Resolve or create form instance for submit.
 * - If formInstanceId provided: validate it belongs to siteId and return it.
 * - If pageSlug + blockId provided: load page from DB, find block, upsert form instance and return it.
 * Page must exist in pages table. If page content uses blockIds (template format), resolve from site template.
 * @returns { formInstance, error? }
 */
async function resolveForSubmit(siteId, { formInstanceId, pageSlug, blockId }) {
  if (formInstanceId) {
    const instance = await FormInstanceModel.getById(formInstanceId, siteId);
    if (!instance) {
      return { error: 'Form not found or does not belong to this site' };
    }
    return { formInstance: instance };
  }
  if (!pageSlug || !blockId) {
    return { error: 'Either form_instance_id or both page_slug and block_id are required' };
  }

  const site = await SiteModel.getSiteById(siteId);
  if (!site) {
    return { error: 'Site not found' };
  }

  const page = await PageModel.getPageBySlug(siteId, pageSlug);
  if (!page) {
    return { error: 'Page not found' };
  }

  let content = page.content || {};
  let block = FormInstanceModel.findBlockInContent(content, blockId);
  if (!block && site.template_id) {
    const template = await TemplateModel.getTemplateById(site.template_id);
    if (template && template.config) {
      const templateConfig = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
      content = resolveContentBlockIds(content, templateConfig);
      block = FormInstanceModel.findBlockInContent(content, blockId);
      if (!block) {
        const templatePage = (templateConfig?.pages || []).find((p) => p && p.slug === pageSlug);
        if (templatePage) {
          const templatePageContent = templatePage.content || templatePage;
          content = resolveContentBlockIds(templatePageContent, templateConfig);
          block = FormInstanceModel.findBlockInContent(content, blockId);
        }
      }
    }
  }
  if (!block) {
    return { error: 'Block not found on page' };
  }

  let blockType = FormInstanceModel.getBlockType(block);
  if (blockType === 'hero') {
    const data = block.data || {};
    const settings = block.settings || {};
    const hasQuoteForm = data.primaryButtonType === 'quoteForm' || data.visualElement === 'form' || settings.visualElement === 'form';
    if (hasQuoteForm) {
      blockType = 'hero-quote-form';
    }
  }
  if (!blockType || !FormInstanceModel.FORM_BLOCK_TYPES.includes(blockType)) {
    return { error: 'Block is not a form type' };
  }

  const displayName = block.name || block.displayName || null;
  const configSnapshot = block.data || block.settings ? { data: block.data, settings: block.settings } : null;
  const formInstance = await FormInstanceModel.upsert(
    parseInt(siteId, 10),
    page.id,
    blockId,
    blockType,
    displayName,
    configSnapshot
  );
  return { formInstance };
}

module.exports = {
  getById,
  listBySite,
  resolveForSubmit,
  syncFormInstancesForPage,
  syncFormInstancesForSitesUsingTemplate,
  collectFormBlocksFromContent,
};
