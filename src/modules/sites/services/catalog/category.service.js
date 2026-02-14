const CategoryModel = require('../../models/catalog/category.model');

/**
 * List categories for site (dashboard).
 */
async function listBySite(siteId) {
  return CategoryModel.listBySiteId(siteId);
}

/**
 * Get category by id (dashboard).
 */
async function getById(id, siteId) {
  return CategoryModel.getById(id, siteId);
}

/**
 * Create category (dashboard). Ensures slug is unique per site.
 */
async function create(siteId, data) {
  return CategoryModel.create(siteId, data);
}

/**
 * Update category (dashboard).
 */
async function update(id, siteId, data) {
  return CategoryModel.update(id, siteId, data);
}

/**
 * Delete category (dashboard).
 */
async function remove(id, siteId) {
  return CategoryModel.remove(id, siteId);
}

module.exports = {
  listBySite,
  getById,
  create,
  update,
  remove,
};
