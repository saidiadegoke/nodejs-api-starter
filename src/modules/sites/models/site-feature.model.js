const pool = require('../../../db/pool');

const FEATURE_ECOMMERCE = 'ecommerce';

/**
 * Set e-commerce feature for the given site IDs (idempotent).
 * Does not remove the feature when template no longer has e-commerce blocks (Phase 1).
 */
async function setEcommerceForSites(siteIds) {
  if (!Array.isArray(siteIds) || siteIds.length === 0) return;
  for (const siteId of siteIds) {
    await pool.query(
      `INSERT INTO site_features (site_id, feature) VALUES ($1, $2)
       ON CONFLICT (site_id, feature) DO NOTHING`,
      [siteId, FEATURE_ECOMMERCE]
    );
  }
}

/**
 * Return true if the site has the e-commerce feature (for has_ecommerce flag).
 */
async function hasEcommerce(siteId) {
  const result = await pool.query(
    'SELECT 1 FROM site_features WHERE site_id = $1 AND feature = $2 LIMIT 1',
    [siteId, FEATURE_ECOMMERCE]
  );
  return result.rows.length > 0;
}

/**
 * Return site IDs that have the e-commerce feature (for batch has_ecommerce on list).
 */
async function getSiteIdsWithEcommerce(siteIds) {
  if (!Array.isArray(siteIds) || siteIds.length === 0) return [];
  const result = await pool.query(
    `SELECT site_id FROM site_features
     WHERE feature = $1 AND site_id = ANY($2::int[])`,
    [FEATURE_ECOMMERCE, siteIds]
  );
  return result.rows.map((r) => r.site_id);
}

module.exports = {
  FEATURE_ECOMMERCE,
  setEcommerceForSites,
  hasEcommerce,
  getSiteIdsWithEcommerce,
};
