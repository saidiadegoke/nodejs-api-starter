const SiteService = require('../services/site.service');
const FileService = require('../../files/services/file.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

const SITE_ASSETS_CONTEXT_PREFIX = 'site_assets_';

function siteAssetsContext(siteId) {
  return `${SITE_ASSETS_CONTEXT_PREFIX}${siteId}`;
}

/**
 * Ensure user has access to the site (throws if not)
 */
async function ensureSiteAccess(siteId, userId) {
  await SiteService.getSiteById(siteId, userId);
}

/**
 * Map file record from DB to API response shape (compatible with MediaManager-style UI)
 */
function toAssetItem(file) {
  const originalName = (file.metadata && file.metadata.original_name) || file.provider_path?.split('/').pop() || 'file';
  return {
    id: file.id,
    file_id: file.id,
    filename: file.provider_path?.split('/').pop() || file.id,
    originalName,
    mimeType: file.file_type,
    size: file.file_size,
    url: file.file_url,
    createdAt: file.created_at,
  };
}

class AssetController {
  /**
   * GET /sites/:siteId/assets
   * List assets for the site (files with context site_assets_${siteId})
   */
  static async getSiteAssets(req, res) {
    try {
      const { siteId } = req.params;
      const userId = req.user.user_id;
      await ensureSiteAccess(siteId, userId);

      const context = siteAssetsContext(siteId);
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);

      const result = await FileService.getUserFiles(userId, { context }, page, limit);
      const items = (result.data || []).map(toAssetItem);

      sendSuccess(res, items, 'Site assets retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Site not found' || error.message === 'Unauthorized') {
        return sendError(res, error.message, error.message === 'Unauthorized' ? FORBIDDEN : NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * POST /sites/:siteId/assets/upload
   * Upload a file to the site's asset library (stored in S3, context site_assets_${siteId})
   */
  static async uploadSiteAsset(req, res) {
    try {
      const { siteId } = req.params;
      const userId = req.user.user_id;
      await ensureSiteAccess(siteId, userId);

      if (!req.file) {
        return sendError(res, 'No file uploaded', BAD_REQUEST);
      }

      const context = siteAssetsContext(siteId);
      const file = await FileService.uploadFile(req.file, userId, context);

      sendSuccess(res, toAssetItem(file), 'Asset uploaded successfully', CREATED);
    } catch (error) {
      if (error.message === 'Site not found' || error.message === 'Unauthorized') {
        return sendError(res, error.message, error.message === 'Unauthorized' ? FORBIDDEN : NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * DELETE /sites/:siteId/assets/:fileId
   * Delete an asset (must belong to this site's context and user)
   */
  static async deleteSiteAsset(req, res) {
    try {
      const { siteId, fileId } = req.params;
      const userId = req.user.user_id;
      await ensureSiteAccess(siteId, userId);

      const FileModel = require('../../files/models/file.model');
      const file = await FileModel.findById(fileId);
      if (!file) {
        return sendError(res, 'File not found', NOT_FOUND);
      }
      if (file.uploaded_by !== userId) {
        return sendError(res, 'Not authorized to delete this file', FORBIDDEN);
      }
      if (file.context !== siteAssetsContext(siteId)) {
        return sendError(res, 'File does not belong to this site', FORBIDDEN);
      }

      await FileService.deleteFile(fileId, userId);
      sendSuccess(res, null, 'Asset deleted successfully', OK);
    } catch (error) {
      if (error.message === 'Site not found' || error.message === 'Unauthorized') {
        return sendError(res, error.message, error.message === 'Unauthorized' ? FORBIDDEN : NOT_FOUND);
      }
      if (error.message === 'File not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = AssetController;
