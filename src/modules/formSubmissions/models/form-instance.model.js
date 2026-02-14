const pool = require('../../../db/pool');

const FORM_BLOCK_TYPES = ['contactform', 'form', 'newsletter', 'hero-quote-form'];

/**
 * Find block in page content (supports content.regions[].blocks[] or content.blocks[])
 */
function findBlockInContent(content, blockId) {
  if (!content) return null;
  if (Array.isArray(content.blocks)) {
    return content.blocks.find((b) => b && (b.id === blockId || b.blockId === blockId));
  }
  const regions = content.regions || content.regionIds;
  if (Array.isArray(regions)) {
    for (const region of regions) {
      const blocks = region.blocks || [];
      const found = blocks.find((b) => b && (b.id === blockId || b.blockId === blockId));
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get block type from block (componentId or type)
 */
function getBlockType(block) {
  return block.type || block.componentId || block.component_id || null;
}

/**
 * Create or get form instance for (site_id, page_id, block_id)
 */
async function upsert(siteId, pageId, blockId, blockType, displayName = null, configSnapshot = null) {
  const result = await pool.query(
    `INSERT INTO form_instances (site_id, page_id, block_id, block_type, display_name, config_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (site_id, page_id, block_id)
     DO UPDATE SET block_type = $4, display_name = COALESCE(EXCLUDED.display_name, form_instances.display_name),
                   config_snapshot = COALESCE(EXCLUDED.config_snapshot, form_instances.config_snapshot), updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [siteId, pageId, blockId, blockType, displayName, configSnapshot ? JSON.stringify(configSnapshot) : null]
  );
  return result.rows[0];
}

/**
 * Get form instance by id; ensure it belongs to siteId
 */
async function getById(id, siteId) {
  const result = await pool.query(
    'SELECT * FROM form_instances WHERE id = $1 AND site_id = $2',
    [id, siteId]
  );
  return result.rows[0];
}

/**
 * List form instances for a site (optional filter by page slug)
 */
async function listBySite(siteId, pageSlug = null) {
  let query = `
    SELECT fi.*, p.slug AS page_slug,
           (SELECT COUNT(*) FROM form_submissions fs WHERE fs.form_instance_id = fi.id) AS submissions_count
    FROM form_instances fi
    JOIN pages p ON p.id = fi.page_id AND p.site_id = fi.site_id
    WHERE fi.site_id = $1
  `;
  const params = [siteId];
  if (pageSlug) {
    params.push(pageSlug);
    query += ` AND p.slug = $2`;
  }
  query += ' ORDER BY fi.created_at DESC';
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Return true if the site has at least one form instance (for has_forms flag).
 */
async function hasAny(siteId) {
  const result = await pool.query(
    'SELECT 1 FROM form_instances WHERE site_id = $1 LIMIT 1',
    [siteId]
  );
  return result.rows.length > 0;
}

/**
 * Return set of site IDs that have at least one form instance (for batch has_forms on list).
 */
async function getSiteIdsWithForms(siteIds) {
  if (!Array.isArray(siteIds) || siteIds.length === 0) {
    return [];
  }
  const result = await pool.query(
    'SELECT DISTINCT site_id FROM form_instances WHERE site_id = ANY($1::int[])',
    [siteIds]
  );
  return result.rows.map((r) => r.site_id);
}

module.exports = {
  FORM_BLOCK_TYPES,
  findBlockInContent,
  getBlockType,
  upsert,
  getById,
  listBySite,
  hasAny,
  getSiteIdsWithForms,
};
