const FileModel = require('../../files/models/file.model');
const FileService = require('../../files/services/file.service');

class AssetService {
  /**
   * Get user assets with filters and pagination
   */
  static async getUserAssets(userId, filters = {}, page = 1, limit = 50) {
    return await FileModel.findUserAssets(userId, filters, page, limit);
  }

  /**
   * Get asset by ID
   */
  static async getAssetById(assetId, userId) {
    const asset = await FileModel.findById(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    if (asset.uploaded_by !== userId) {
      throw new Error('Unauthorized');
    }
    return asset;
  }

  /**
   * Upload a new asset
   */
  static async uploadAsset(file, userId, options = {}) {
    const {
      group_id = null,
      tags = null,
      alt_text = null
    } = options;

    // Upload file using FileService with user_assets context
    const uploadedFile = await FileService.uploadFile(file, userId, 'user_assets');

    // Update asset metadata if provided
    if (group_id || tags || alt_text) {
      const tagsArray = tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : null;
      return await FileModel.updateAsset(uploadedFile.id, {
        asset_group_id: group_id,
        tags: tagsArray,
        alt_text: alt_text
      });
    }

    return uploadedFile;
  }

  /**
   * Update asset metadata
   */
  static async updateAsset(assetId, updates, userId) {
    // Verify ownership
    const asset = await FileModel.findById(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    if (asset.uploaded_by !== userId) {
      throw new Error('Unauthorized');
    }

    // Process tags if provided
    if (updates.tags !== undefined) {
      if (typeof updates.tags === 'string') {
        updates.tags = updates.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }
    }

    return await FileModel.updateAsset(assetId, updates);
  }

  /**
   * Delete an asset
   */
  static async deleteAsset(assetId, userId) {
    // Verify ownership
    const asset = await FileModel.findById(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    if (asset.uploaded_by !== userId) {
      throw new Error('Unauthorized');
    }

    return await FileService.deleteFile(assetId, userId);
  }

  /**
   * Move assets to a group
   */
  static async moveAssets(assetIds, targetGroupId, userId) {
    // Verify target group ownership if provided
    if (targetGroupId) {
      const AssetGroupModel = require('../models/asset-group.model');
      const isOwner = await AssetGroupModel.isOwner(targetGroupId, userId);
      if (!isOwner) {
        throw new Error('Target group not found or not owned by user');
      }
    }

    return await FileModel.moveAssets(assetIds, targetGroupId, userId);
  }

  /**
   * Batch update tags
   */
  static async batchUpdateTags(assetIds, tagsToAdd = [], tagsToRemove = [], userId) {
    // Process tags
    const addTags = Array.isArray(tagsToAdd) ? tagsToAdd : tagsToAdd.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const removeTags = Array.isArray(tagsToRemove) ? tagsToRemove : tagsToRemove.split(',').map(t => t.trim()).filter(t => t.length > 0);

    return await FileModel.batchUpdateTags(assetIds, addTags, removeTags, userId);
  }
}

module.exports = AssetService;
