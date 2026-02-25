const pool = require('../../../../db/pool');

/**
 * List products for a site. Dashboard: all statuses. Public: published only.
 * Options: categorySlug, categoryId, type, status, limit, offset, sort (newest|price_asc|price_desc|name), tag.
 */
async function listBySiteId(siteId, options = {}) {
  const { categorySlug, categoryId, type, status, limit = 50, offset = 0, sort = 'newest', tag, exclude, q, min_price, max_price } = options;
  const params = [siteId];
  const conditions = ['p.site_id = $1'];
  let i = 2;

  if (categoryId) {
    conditions.push(`p.category_id = $${i++}`);
    params.push(categoryId);
  }
  if (categorySlug) {
    conditions.push(`c.slug = $${i++}`);
    params.push(categorySlug);
  }
  if (type) {
    conditions.push(`p.type = $${i++}`);
    params.push(type);
  }
  if (status) {
    conditions.push(`p.status = $${i++}`);
    params.push(status);
  }
  if (tag) {
    conditions.push(`p.tags @> $${i++}::jsonb`);
    params.push(JSON.stringify([tag]));
  }
  if (exclude && (Array.isArray(exclude) ? exclude.length > 0 : exclude)) {
    const ids = Array.isArray(exclude) ? exclude : [exclude];
    const placeholders = ids.map((_, idx) => `$${i + idx + 1}`).join(', ');
    conditions.push(`p.id NOT IN (${placeholders})`);
    ids.forEach((id) => params.push(id));
    i += ids.length;
  }
  if (q && String(q).trim()) {
    const searchTerm = `%${String(q).trim().replace(/%/g, '\\%')}%`;
    conditions.push(`(p.name ILIKE $${i} OR p.description::text ILIKE $${i})`);
    params.push(searchTerm);
    i += 1;
  }
  if (min_price != null && !Number.isNaN(Number(min_price))) {
    conditions.push(`p.price >= $${i++}`);
    params.push(Number(min_price));
  }
  if (max_price != null && !Number.isNaN(Number(max_price))) {
    conditions.push(`p.price <= $${i++}`);
    params.push(Number(max_price));
  }

  const joinCategory = 'LEFT JOIN catalog_categories c ON c.id = p.category_id AND c.site_id = p.site_id';
  const orderBy = {
    newest: 'p.created_at DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    name: 'p.name ASC',
  }[sort] || 'p.created_at DESC';

  params.push(limit, offset);
  const result = await pool.query(
    `SELECT p.id, p.site_id, p.category_id, p.type, p.name, p.slug, p.description,
            p.price, p.price_currency, p.prices, p.compare_at_price, p.cost, p.sku, p.barcode, p.images, p.tags,
            p.status, p.sort_order, p.created_at, p.updated_at,
            p.variants, p.track_inventory, p.stock_quantity, p.variant_stock,
            c.name AS category_name, c.slug AS category_slug
     FROM catalog_products p
     ${joinCategory}
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.sort_order ASC, ${orderBy}
     LIMIT $${i++} OFFSET $${i}`,
    params
  );
  return result.rows;
}

/**
 * Count products for a site (same filters as list).
 */
async function countBySiteId(siteId, options = {}) {
  const { categorySlug, categoryId, type, status, tag, exclude, q, min_price, max_price } = options;
  const params = [siteId];
  const conditions = ['site_id = $1'];
  let i = 2;

  if (categoryId) {
    conditions.push(`category_id = $${i++}`);
    params.push(categoryId);
  }
  if (type) {
    conditions.push(`type = $${i++}`);
    params.push(type);
  }
  if (status) {
    conditions.push(`status = $${i++}`);
    params.push(status);
  }
  if (tag) {
    conditions.push(`tags @> $${i++}::jsonb`);
    params.push(JSON.stringify([tag]));
  }
  if (exclude && (Array.isArray(exclude) ? exclude.length > 0 : exclude)) {
    const ids = Array.isArray(exclude) ? exclude : [exclude];
    const placeholders = ids.map((_, idx) => `$${i + idx + 1}`).join(', ');
    conditions.push(`id NOT IN (${placeholders})`);
    ids.forEach((id) => params.push(id));
    i += ids.length;
  }
  if (q && String(q).trim()) {
    const searchTerm = `%${String(q).trim().replace(/%/g, '\\%')}%`;
    conditions.push(`(name ILIKE $${i} OR description::text ILIKE $${i})`);
    params.push(searchTerm);
    i += 1;
  }
  if (min_price != null && !Number.isNaN(Number(min_price))) {
    conditions.push(`price >= $${i++}`);
    params.push(Number(min_price));
  }
  if (max_price != null && !Number.isNaN(Number(max_price))) {
    conditions.push(`price <= $${i++}`);
    params.push(Number(max_price));
  }
  if (categorySlug) {
    const catResult = await pool.query(
      'SELECT id FROM catalog_categories WHERE site_id = $1 AND slug = $2',
      [siteId, categorySlug]
    );
    const catId = catResult.rows[0]?.id;
    if (catId) {
      conditions.push(`category_id = $${i++}`);
      params.push(catId);
    } else {
      return 0;
    }
  }

  const result = await pool.query(
    `SELECT COUNT(*) AS total FROM catalog_products WHERE ${conditions.join(' AND ')}`,
    params
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Get product by id; must belong to siteId.
 */
async function getById(id, siteId) {
  const result = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM catalog_products p
     LEFT JOIN catalog_categories c ON c.id = p.category_id AND c.site_id = p.site_id
     WHERE p.id = $1 AND p.site_id = $2`,
    [id, siteId]
  );
  return result.rows[0] || null;
}

/**
 * Get product by slug or id (numeric string); must belong to siteId.
 */
async function getBySlugOrId(slugOrId, siteId) {
  const idNum = parseInt(slugOrId, 10);
  if (!Number.isNaN(idNum)) {
    const byId = await getById(idNum, siteId);
    if (byId) return byId;
  }
  const result = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM catalog_products p
     LEFT JOIN catalog_categories c ON c.id = p.category_id AND c.site_id = p.site_id
     WHERE p.slug = $1 AND p.site_id = $2`,
    [slugOrId, siteId]
  );
  return result.rows[0] || null;
}

/**
 * Ensure slug is unique per site; if taken, append -2, -3, etc.
 */
async function ensureUniqueSlug(siteId, baseSlug, excludeId = null) {
  if (!baseSlug || !baseSlug.trim()) return baseSlug;
  let candidate = baseSlug.trim().toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'product';
  let suffix = 0;
  for (;;) {
    const slugToTry = suffix === 0 ? candidate : `${candidate}-${suffix}`;
    const params = [siteId, slugToTry];
    const excludeClause = excludeId != null ? ` AND id != $${params.length + 1}` : '';
    if (excludeId != null) params.push(excludeId);
    const r = await pool.query(
      `SELECT 1 FROM catalog_products WHERE site_id = $1 AND slug = $2${excludeClause} LIMIT 1`,
      params
    );
    if (r.rows.length === 0) return slugToTry;
    suffix = suffix === 0 ? 2 : suffix + 1;
  }
}

/**
 * Create product. Slug optional; auto-generated from name and made unique per site.
 */
async function create(siteId, data) {
  const {
    category_id,
    type = 'product',
    name,
    slug,
    description,
    price = 0,
    price_currency = 'NGN',
    prices,
    compare_at_price,
    cost,
    sku,
    barcode,
    images = [],
    tags = [],
    status = 'draft',
    sort_order = 0,
    variants = [],
    track_inventory = false,
    stock_quantity = 0,
    variant_stock = {},
  } = data;
  const baseSlug = (slug && String(slug).trim()) ? String(slug).trim() : slugify(name);
  const slugVal = await ensureUniqueSlug(siteId, baseSlug || 'product', null);
  const currency = (price_currency || 'NGN').toUpperCase().slice(0, 3);
  const pricesVal = normalizePricesJson(prices);
  const result = await pool.query(
    `INSERT INTO catalog_products (
      site_id, category_id, type, name, slug, description, price, price_currency, prices, compare_at_price, cost,
      sku, barcode, images, tags, status, sort_order, variants, track_inventory, stock_quantity, variant_stock
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *`,
    [
      siteId,
      category_id ?? null,
      type,
      name,
      slugVal,
      description ?? null,
      price,
      currency,
      pricesVal,
      compare_at_price ?? null,
      cost ?? null,
      sku ?? null,
      barcode ?? null,
      JSON.stringify(Array.isArray(images) ? images : []),
      JSON.stringify(Array.isArray(tags) ? tags : []),
      status,
      sort_order,
      JSON.stringify(Array.isArray(variants) ? variants : []),
      !!track_inventory,
      parseInt(stock_quantity, 10) || 0,
      JSON.stringify(typeof variant_stock === 'object' && variant_stock !== null ? variant_stock : {}),
    ]
  );
  return result.rows[0];
}

/**
 * Update product. If slug is empty string and name is provided, slug is auto-derived and made unique.
 */
async function update(id, siteId, data) {
  const allowed = [
    'category_id', 'type', 'name', 'slug', 'description', 'price', 'price_currency', 'prices', 'compare_at_price', 'cost',
    'sku', 'barcode', 'images', 'tags', 'status', 'sort_order',
    'variants', 'track_inventory', 'stock_quantity', 'variant_stock',
  ];
  const updates = { ...data };
  if ((updates.slug === '' || (updates.slug === undefined && updates.name !== undefined)) && updates.name) {
    const baseSlug = slugify(updates.name);
    updates.slug = await ensureUniqueSlug(siteId, baseSlug || 'product', id);
  }
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (updates[key] === undefined) continue;
    if (key === 'images' || key === 'tags' || key === 'variants') {
      fields.push(`${key} = $${i++}::jsonb`);
      values.push(JSON.stringify(Array.isArray(updates[key]) ? updates[key] : []));
    } else if (key === 'variant_stock') {
      fields.push(`${key} = $${i++}::jsonb`);
      values.push(JSON.stringify(typeof updates[key] === 'object' && updates[key] !== null ? updates[key] : {}));
    } else if (key === 'prices') {
      fields.push(`${key} = $${i++}::jsonb`);
      values.push(normalizePricesJson(updates[key]));
    } else if (key === 'price_currency') {
      fields.push(`${key} = $${i++}`);
      values.push((updates[key] || 'NGN').toUpperCase().slice(0, 3));
    } else {
      fields.push(`${key} = $${i++}`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) return getById(id, siteId);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, siteId);
  const result = await pool.query(
    `UPDATE catalog_products SET ${fields.join(', ')} WHERE id = $${i++} AND site_id = $${i} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete product.
 */
async function remove(id, siteId) {
  const result = await pool.query(
    'DELETE FROM catalog_products WHERE id = $1 AND site_id = $2 RETURNING id',
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

/** Normalize prices object for DB: only NGN, USD, EUR, GBP with numeric values; null if empty. */
function normalizePricesJson(prices) {
  if (prices == null || typeof prices !== 'object') return null;
  const codes = ['NGN', 'USD', 'EUR', 'GBP'];
  const out = {};
  for (const code of codes) {
    const v = prices[code];
    if (typeof v === 'number' && !Number.isNaN(v) && v >= 0) out[code] = v;
  }
  return Object.keys(out).length === 0 ? null : JSON.stringify(out);
}

module.exports = {
  listBySiteId,
  countBySiteId,
  getById,
  getBySlugOrId,
  create,
  update,
  remove,
};
