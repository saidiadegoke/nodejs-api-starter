const SiteService = require('../../services/site.service');
const ProductService = require('../../services/catalog/product.service');
const { sendSuccess, sendError } = require('../../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../../shared/constants/statusCodes');

async function ensureSiteAccess(req, res) {
  const { siteId } = req.params;
  try {
    await SiteService.getSiteById(siteId, req.user.user_id);
    return null;
  } catch (err) {
    if (err.message === 'Site not found') return sendError(res, err.message, NOT_FOUND);
    if (err.message === 'Unauthorized') return sendError(res, err.message, FORBIDDEN);
    return sendError(res, err.message, BAD_REQUEST);
  }
}

/**
 * GET /sites/:siteId/products - List products (dashboard; all statuses).
 */
async function list(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId } = req.params;
    const { category_id, category_slug, type, status, limit, offset, sort, tag, exclude, q, min_price, max_price } = req.query;
    const options = {};
    if (category_id) options.categoryId = category_id;
    if (category_slug) options.categorySlug = category_slug;
    if (type) options.type = type;
    if (status) options.status = status;
    if (limit) options.limit = Math.min(parseInt(limit, 10) || 50, 100);
    if (offset) options.offset = parseInt(offset, 10) || 0;
    if (sort) options.sort = sort;
    if (tag) options.tag = tag;
    if (exclude) options.exclude = Array.isArray(exclude) ? exclude : exclude.split(',').map((id) => id.toString().trim()).filter(Boolean);
    if (q) options.q = q;
    if (min_price !== undefined && min_price !== '') options.min_price = min_price;
    if (max_price !== undefined && max_price !== '') options.max_price = max_price;
    const [items, total] = await Promise.all([
      ProductService.listBySite(siteId, options),
      ProductService.countBySite(siteId, options),
    ]);
    sendSuccess(res, { items, total }, 'Products retrieved successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to list products', BAD_REQUEST);
  }
}

/**
 * GET /sites/:siteId/products/:productId - Get one product (dashboard).
 */
async function getById(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId, productId } = req.params;
    const product = await ProductService.getById(productId, siteId);
    if (!product) return sendError(res, 'Product not found', NOT_FOUND);
    sendSuccess(res, product, 'Product retrieved successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to get product', BAD_REQUEST);
  }
}

/**
 * POST /sites/:siteId/products - Create product (dashboard).
 */
async function create(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId } = req.params;
    const product = await ProductService.create(siteId, req.body);
    sendSuccess(res, product, 'Product created successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to create product', BAD_REQUEST);
  }
}

/**
 * PATCH /sites/:siteId/products/:productId - Update product (dashboard).
 */
async function update(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId, productId } = req.params;
    const product = await ProductService.update(productId, siteId, req.body);
    if (!product) return sendError(res, 'Product not found', NOT_FOUND);
    sendSuccess(res, product, 'Product updated successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to update product', BAD_REQUEST);
  }
}

/**
 * DELETE /sites/:siteId/products/:productId - Delete product (dashboard).
 */
async function remove(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId, productId } = req.params;
    const deleted = await ProductService.remove(productId, siteId);
    if (!deleted) return sendError(res, 'Product not found', NOT_FOUND);
    sendSuccess(res, { id: productId }, 'Product deleted successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to delete product', BAD_REQUEST);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
