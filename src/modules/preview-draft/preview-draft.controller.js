const previewDraftStore = require('./store');
const { sendSuccess, sendError } = require('../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../shared/constants/statusCodes');

/**
 * POST /preview-draft
 * Store block + componentId for preview; returns short token.
 * No auth required (short-lived draft for iframe preview).
 */
function createDraft(req, res) {
  try {
    const { block, componentId } = req.body || {};
    if (!block || typeof block !== 'object') {
      return sendError(res, 'Request body must include { block: object }', BAD_REQUEST);
    }
    const token = previewDraftStore.set(block, componentId);
    return sendSuccess(res, { token }, 'Preview draft created', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to create preview draft', BAD_REQUEST);
  }
}

/**
 * GET /preview-draft?token=...
 * Return stored block + componentId for the token.
 * No auth required.
 */
function getDraft(req, res) {
  try {
    const token = req.query.token;
    const entry = previewDraftStore.get(token);
    if (!entry) {
      return sendError(res, 'Preview draft not found or expired', NOT_FOUND);
    }
    return sendSuccess(res, entry, 'Preview draft retrieved', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to get preview draft', BAD_REQUEST);
  }
}

module.exports = { createDraft, getDraft };
