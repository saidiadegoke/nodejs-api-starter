const AssetService = require('../services/asset.service');
const AssetUsageService = require('../services/asset-usage.service');
const { getAssetInUse } = require('../services/asset-in-use.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN, PAYMENT_REQUIRED } = require('../../../shared/constants/statusCodes');

/**
 * Map file record from DB to API response shape
 */
function toAssetItem(file) {
  const originalName = (file.metadata && typeof file.metadata === 'object' && file.metadata.original_name) 
    || (typeof file.metadata === 'string' && JSON.parse(file.metadata)?.original_name)
    || file.provider_path?.split('/').pop() 
    || 'file';
  
  return {
    id: file.id,
    file_id: file.id,
    filename: file.provider_path?.split('/').pop() || file.id,
    originalName,
    mimeType: file.file_type,
    size: file.file_size,
    url: file.file_url,
    asset_group_id: file.asset_group_id,
    asset_group_name: file.asset_group_name,
    asset_group_color: file.asset_group_color,
    tags: file.tags || [],
    alt_text: file.alt_text,
    createdAt: file.created_at
  };
}

class AssetController {
  /**
   * GET /api/assets/usage
   * Get current storage usage and plan limits for the authenticated user
   */
  static async getUsage(req, res) {
    try {
      const userId = req.user.user_id;
      const usage = await AssetUsageService.getUsage(userId);
      sendSuccess(res, usage, 'Usage retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * GET /api/assets
   * List assets for the authenticated user with filters and pagination
   */
  static async getAllAssets(req, res) {
    try {
      const userId = req.user.user_id;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);

      const filters = {
        group_id: req.query.group_id === 'null' ? null : req.query.group_id || undefined,
        type: req.query.type, // 'image', 'video', 'document'
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : req.query.tags.split(',')) : undefined,
        search: req.query.search,
        sort: req.query.sort || 'created_at',
        order: req.query.order || 'desc'
      };

      const result = await AssetService.getUserAssets(userId, filters, page, limit);
      const items = (result.data || []).map(toAssetItem);
      const pagination = result.pagination || { page, limit, total: items.length, totalPages: 1 };

      res.status(OK).json({
        success: true,
        message: 'Assets retrieved successfully',
        data: items,
        pagination
      });
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * GET /api/assets/:assetId/in-use
   * Check if asset is referenced in any site or template
   */
  static async getAssetInUse(req, res) {
    try {
      const { assetId } = req.params;
      const userId = req.user.user_id;
      const result = await getAssetInUse(assetId, userId);
      sendSuccess(res, result, 'In-use check completed', OK);
    } catch (error) {
      if (error.message === 'Asset not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Unauthorized') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * GET /api/assets/:assetId
   * Get a specific asset
   */
  static async getAssetById(req, res) {
    try {
      const { assetId } = req.params;
      const userId = req.user.user_id;

      const asset = await AssetService.getAssetById(assetId, userId);
      sendSuccess(res, toAssetItem(asset), 'Asset retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Asset not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Unauthorized') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * POST /api/assets/upload
   * Upload a new asset
   */
  static async uploadAsset(req, res) {
    try {
      const userId = req.user.user_id;

      if (!req.file) {
        return sendError(res, 'No file uploaded', BAD_REQUEST);
      }

      const fileSize = req.file.size || 0;
      const { allowed, usage, reason } = await AssetUsageService.checkCanUpload(userId, fileSize);
      if (!allowed) {
        return sendError(res, reason || 'Storage limit exceeded', PAYMENT_REQUIRED, {
          storageUsedBytes: usage?.storageUsedBytes,
          storageLimitBytes: usage?.storageLimitBytes,
          storageUsedFormatted: usage?.storageUsedFormatted,
          storageLimitFormatted: usage?.storageLimitFormatted
        });
      }

      const options = {
        group_id: req.body.group_id || null,
        tags: req.body.tags || null,
        alt_text: req.body.alt_text || null
      };

      const asset = await AssetService.uploadAsset(req.file, userId, options);
      sendSuccess(res, toAssetItem(asset), 'Asset uploaded successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * PUT /api/assets/:assetId
   * Update asset metadata
   */
  static async updateAsset(req, res) {
    try {
      const { assetId } = req.params;
      const userId = req.user.user_id;
      const { asset_group_id, tags, alt_text } = req.body;

      const updates = {};
      if (asset_group_id !== undefined) updates.asset_group_id = asset_group_id;
      if (tags !== undefined) updates.tags = tags;
      if (alt_text !== undefined) updates.alt_text = alt_text;

      if (Object.keys(updates).length === 0) {
        return sendError(res, 'No updates provided', BAD_REQUEST);
      }

      const asset = await AssetService.updateAsset(assetId, updates, userId);
      sendSuccess(res, toAssetItem(asset), 'Asset updated successfully', OK);
    } catch (error) {
      if (error.message === 'Asset not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Unauthorized') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * DELETE /api/assets/:assetId
   * Delete an asset
   */
  static async deleteAsset(req, res) {
    try {
      const { assetId } = req.params;
      const userId = req.user.user_id;

      await AssetService.deleteAsset(assetId, userId);
      sendSuccess(res, null, 'Asset deleted successfully', OK);
    } catch (error) {
      if (error.message === 'Asset not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Unauthorized') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * POST /api/assets/move
   * Move multiple assets to a group
   */
  static async moveAssets(req, res) {
    try {
      const userId = req.user.user_id;
      const { asset_ids, target_group_id } = req.body;

      if (!asset_ids || !Array.isArray(asset_ids) || asset_ids.length === 0) {
        return sendError(res, 'asset_ids array is required', BAD_REQUEST);
      }

      const movedAssets = await AssetService.moveAssets(asset_ids, target_group_id || null, userId);
      sendSuccess(res, movedAssets.map(toAssetItem), 'Assets moved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * POST /api/assets/batch-tag
   * Batch update tags for multiple assets
   */
  static async batchUpdateTags(req, res) {
    try {
      const userId = req.user.user_id;
      const { asset_ids, tags_to_add = [], tags_to_remove = [] } = req.body;

      if (!asset_ids || !Array.isArray(asset_ids) || asset_ids.length === 0) {
        return sendError(res, 'asset_ids array is required', BAD_REQUEST);
      }

      const updatedAssets = await AssetService.batchUpdateTags(
        asset_ids,
        tags_to_add,
        tags_to_remove,
        userId
      );
      sendSuccess(res, updatedAssets.map(toAssetItem), 'Tags updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = AssetController;
