const SiteService = require('../../services/site.service');
const CategoryService = require('../../services/catalog/category.service');
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
 * GET /sites/:siteId/categories - List categories (dashboard).
 */
async function list(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId } = req.params;
    const categories = await CategoryService.listBySite(siteId);
    sendSuccess(res, categories, 'Categories retrieved successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to list categories', BAD_REQUEST);
  }
}

/**
 * GET /sites/:siteId/categories/:categoryId - Get one category (dashboard).
 */
async function getById(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId, categoryId } = req.params;
    const category = await CategoryService.getById(categoryId, siteId);
    if (!category) return sendError(res, 'Category not found', NOT_FOUND);
    sendSuccess(res, category, 'Category retrieved successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to get category', BAD_REQUEST);
  }
}

/**
 * POST /sites/:siteId/categories - Create category (dashboard).
 */
async function create(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId } = req.params;
    const category = await CategoryService.create(siteId, req.body);
    sendSuccess(res, category, 'Category created successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to create category', BAD_REQUEST);
  }
}

/**
 * PATCH /sites/:siteId/categories/:categoryId - Update category (dashboard).
 */
async function update(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId, categoryId } = req.params;
    const category = await CategoryService.update(categoryId, siteId, req.body);
    if (!category) return sendError(res, 'Category not found', NOT_FOUND);
    sendSuccess(res, category, 'Category updated successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to update category', BAD_REQUEST);
  }
}

/**
 * DELETE /sites/:siteId/categories/:categoryId - Delete category (dashboard).
 */
async function remove(req, res) {
  const errRes = await ensureSiteAccess(req, res);
  if (errRes) return errRes;
  try {
    const { siteId, categoryId } = req.params;
    const deleted = await CategoryService.remove(categoryId, siteId);
    if (!deleted) return sendError(res, 'Category not found', NOT_FOUND);
    sendSuccess(res, { id: categoryId }, 'Category deleted successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to delete category', BAD_REQUEST);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
