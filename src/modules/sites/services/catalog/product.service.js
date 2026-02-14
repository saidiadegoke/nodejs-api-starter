const ProductModel = require('../../models/catalog/product.model');
const CurrencyService = require('./currency.service');
const { resolveImageRefs } = require('./product-image-resolver');

/**
 * List products for site. Dashboard: pass status to filter or omit for all. Public: pass status='published'.
 * Attaches computed prices (prices, compare_at_prices, costs) per product using platform currency rates.
 */
async function listBySite(siteId, options = {}) {
  const items = await ProductModel.listBySiteId(siteId, options);
  await CurrencyService.attachComputedPricesToMany(items);
  return items;
}

/**
 * Count products (same filters as list).
 */
async function countBySite(siteId, options = {}) {
  return ProductModel.countBySiteId(siteId, options);
}

/**
 * Get product by id (dashboard). Attaches computed prices.
 */
async function getById(id, siteId) {
  const product = await ProductModel.getById(id, siteId);
  if (product) await CurrencyService.attachComputedPrices(product);
  return product;
}

/**
 * Get product by slug or id (public or dashboard). Attaches computed prices.
 */
async function getBySlugOrId(slugOrId, siteId) {
  const product = await ProductModel.getBySlugOrId(slugOrId, siteId);
  if (product) await CurrencyService.attachComputedPrices(product);
  return product;
}

/**
 * Create product (dashboard). Resolves image refs (URLs or asset IDs) to URLs, then attaches computed prices.
 */
async function create(siteId, data) {
  if (data.images && Array.isArray(data.images)) {
    data = { ...data, images: await resolveImageRefs(siteId, data.images) };
  }
  const product = await ProductModel.create(siteId, data);
  if (product) await CurrencyService.attachComputedPrices(product);
  return product;
}

/**
 * Update product (dashboard). Resolves image refs (URLs or asset IDs) to URLs when present, then attaches computed prices.
 */
async function update(id, siteId, data) {
  if (data.images && Array.isArray(data.images)) {
    data = { ...data, images: await resolveImageRefs(siteId, data.images) };
  }
  const product = await ProductModel.update(id, siteId, data);
  if (product) await CurrencyService.attachComputedPrices(product);
  return product;
}

/**
 * Delete product (dashboard).
 */
async function remove(id, siteId) {
  return ProductModel.remove(id, siteId);
}

module.exports = {
  listBySite,
  countBySite,
  getById,
  getBySlugOrId,
  create,
  update,
  remove,
};
