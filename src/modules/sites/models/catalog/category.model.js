const pool = require('../../../../db/pool');

/**
 * List categories for a site (dashboard: all; public: N/A - categories are used with products).
 */
async function listBySiteId(siteId) {
  const result = await pool.query(
    `SELECT id, site_id, name, slug, description, sort_order, created_at, updated_at
     FROM catalog_categories
     WHERE site_id = $1
     ORDER BY sort_order ASC, name ASC`,
    [siteId]
  );
  return result.rows;
}

/**
 * Get category by id; must belong to siteId.
 */
async function getById(id, siteId) {
  const result = await pool.query(
    'SELECT * FROM catalog_categories WHERE id = $1 AND site_id = $2',
    [id, siteId]
  );
  return result.rows[0] || null;
}

/**
 * Get category by slug; must belong to siteId.
 */
async function getBySlug(slug, siteId) {
  const result = await pool.query(
    'SELECT * FROM catalog_categories WHERE slug = $1 AND site_id = $2',
    [slug, siteId]
  );
  return result.rows[0] || null;
}

/**
 * Ensure slug is unique per site; if taken, append -2, -3, etc.
 */
async function ensureUniqueSlug(siteId, baseSlug, excludeId = null) {
  if (!baseSlug || !baseSlug.trim()) return baseSlug;
  let candidate = baseSlug.trim().toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'category';
  let suffix = 0;
  for (;;) {
    const slugToTry = suffix === 0 ? candidate : `${candidate}-${suffix}`;
    const params = [siteId, slugToTry];
    const excludeClause = excludeId != null ? ` AND id != $${params.length + 1}` : '';
    if (excludeId != null) params.push(excludeId);
    const r = await pool.query(
      `SELECT 1 FROM catalog_categories WHERE site_id = $1 AND slug = $2${excludeClause} LIMIT 1`,
      params
    );
    if (r.rows.length === 0) return slugToTry;
    suffix = suffix === 0 ? 2 : suffix + 1;
  }
}

/**
 * Create category. Slug optional; auto-generated from name and made unique per site.
 */
async function create(siteId, data) {
  const { name, slug, description, sort_order } = data;
  const baseSlug = (slug && String(slug).trim()) ? String(slug).trim() : slugify(name);
  const slugVal = await ensureUniqueSlug(siteId, baseSlug || 'category', null);
  const result = await pool.query(
    `INSERT INTO catalog_categories (site_id, name, slug, description, sort_order)
     VALUES ($1, $2, $3, $4, COALESCE($5, 0))
     RETURNING *`,
    [siteId, name, slugVal, description || null, sort_order]
  );
  return result.rows[0];
}

/**
 * Update category. If slug is empty string and name is provided, slug is auto-derived and made unique.
 */
async function update(id, siteId, data) {
  const updates = { ...data };
  if ((updates.slug === '' || (updates.slug === undefined && updates.name !== undefined)) && updates.name) {
    const baseSlug = slugify(updates.name);
    updates.slug = await ensureUniqueSlug(siteId, baseSlug || 'category', id);
  }
  const fields = [];
  const values = [];
  let i = 1;
  if (updates.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(updates.name);
  }
  if (updates.slug !== undefined) {
    fields.push(`slug = $${i++}`);
    values.push(updates.slug);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${i++}`);
    values.push(updates.description);
  }
  if (updates.sort_order !== undefined) {
    fields.push(`sort_order = $${i++}`);
    values.push(updates.sort_order);
  }
  if (fields.length === 0) return getById(id, siteId);
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id, siteId);
  const result = await pool.query(
    `UPDATE catalog_categories SET ${fields.join(', ')} WHERE id = $${i} AND site_id = $${i + 1} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete category. Products with this category_id will have category_id set NULL (FK ON DELETE SET NULL).
 */
async function remove(id, siteId) {
  const result = await pool.query(
    'DELETE FROM catalog_categories WHERE id = $1 AND site_id = $2 RETURNING id',
    [id, siteId]
  );
  return result.rowCount > 0;
}

function slugify(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = {
  listBySiteId,
  getById,
  getBySlug,
  create,
  update,
  remove,
};
