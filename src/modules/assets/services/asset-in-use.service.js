const pool = require('../../../db/pool');
const AssetService = require('./asset.service');

/**
 * Check where an asset (by URL or id) is referenced:
 * - site_customization.logo_url (sites owned by user)
 * - pages.content (sites owned by user)
 * - templates.config (global templates)
 * Returns { inUse, sites: [{ id, name, slug }], templates: [{ id, name }] }.
 */
async function getAssetInUse(assetId, userId) {
  const asset = await AssetService.getAssetById(assetId, userId);
  const fileUrl = asset.file_url || '';
  const idStr = asset.id;

  const sites = [];
  const templates = [];

  // Sites: logo_url exact match (user-owned sites only)
  const logoRows = await pool.query(
    `SELECT s.id, s.name, s.slug
     FROM site_customization sc
     JOIN sites s ON s.id = sc.site_id
     WHERE s.owner_id = $1 AND sc.logo_url IS NOT NULL AND sc.logo_url = $2`,
    [userId, fileUrl]
  );
  logoRows.rows.forEach((r) => {
    if (!sites.find((x) => x.id === r.id)) sites.push({ id: r.id, name: r.name, slug: r.slug });
  });

  // Sites: pages.content contains URL or asset id (user-owned sites only)
  if (fileUrl || idStr) {
    const contentRows = await pool.query(
      `SELECT s.id, s.name, s.slug
       FROM pages p
       JOIN sites s ON s.id = p.site_id
       WHERE s.owner_id = $1 AND p.content IS NOT NULL
         AND (position($2 in p.content::text) > 0 OR ($3::text <> '' AND position($3 in p.content::text) > 0))`,
      [userId, fileUrl, idStr]
    );
    contentRows.rows.forEach((r) => {
      if (!sites.find((x) => x.id === r.id)) sites.push({ id: r.id, name: r.name, slug: r.slug });
    });
  }

  // Templates: config contains URL or asset id
  if (fileUrl || idStr) {
    const templateRows = await pool.query(
      `SELECT id, name FROM templates
       WHERE config IS NOT NULL
         AND (position($1 in config::text) > 0 OR ($2::text <> '' AND position($2 in config::text) > 0))`,
      [fileUrl, idStr]
    );
    templateRows.rows.forEach((r) => templates.push({ id: r.id, name: r.name }));
  }

  const inUse = sites.length > 0 || templates.length > 0;
  return { inUse, sites, templates };
}

module.exports = { getAssetInUse };
