const FormInstanceService = require('../services/form-instance.service');
const SiteService = require('../../sites/services/site.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

/**
 * GET /api/sites/:siteId/forms
 * List form instances for the site (dashboard).
 */
async function listForms(req, res) {
  try {
    const { siteId } = req.params;
    const { page_slug: pageSlug } = req.query;
    await SiteService.getSiteById(siteId, req.user.user_id);
    const forms = await FormInstanceService.listBySite(siteId, pageSlug || null);
    sendSuccess(res, forms, 'Forms retrieved successfully', OK);
  } catch (err) {
    if (err.message === 'Site not found') {
      return sendError(res, err.message, NOT_FOUND);
    }
    if (err.message === 'Unauthorized') {
      return sendError(res, err.message, FORBIDDEN);
    }
    sendError(res, err.message, BAD_REQUEST);
  }
}

module.exports = {
  listForms,
};
