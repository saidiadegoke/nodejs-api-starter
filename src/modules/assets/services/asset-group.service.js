const AssetGroupModel = require('../models/asset-group.model');

class AssetGroupService {
  /**
   * Get all asset groups for a user
   */
  static async getUserAssetGroups(userId, parentId = null) {
    return await AssetGroupModel.findByUserIdWithCounts(userId, parentId);
  }

  /**
   * Get asset group tree for a user
   */
  static async getFolderTree(userId) {
    return await AssetGroupModel.getFolderTree(userId);
  }

  /**
   * Get asset group by ID
   */
  static async getAssetGroupById(groupId, userId) {
    const group = await AssetGroupModel.findById(groupId);
    if (!group) {
      throw new Error('Asset group not found');
    }
    if (group.user_id !== userId) {
      throw new Error('Unauthorized');
    }
    return await AssetGroupModel.findByIdWithCount(groupId);
  }

  /**
   * Create a new asset group
   */
  static async createAssetGroup(groupData, userId) {
    // Validate parent if provided
    if (groupData.parent_id) {
      const parentExists = await AssetGroupModel.isOwner(groupData.parent_id, userId);
      if (!parentExists) {
        throw new Error('Parent group not found or not owned by user');
      }
    }

    // Check for duplicate name at same level
    const existingGroups = await AssetGroupModel.findByUserId(userId, groupData.parent_id || null);
    const duplicate = existingGroups.find(g => g.name.toLowerCase() === groupData.name.toLowerCase());
    if (duplicate) {
      throw new Error('A group with this name already exists at this level');
    }

    return await AssetGroupModel.create({
      ...groupData,
      user_id: userId
    });
  }

  /**
   * Update an asset group
   */
  static async updateAssetGroup(groupId, updates, userId) {
    // Verify ownership
    const isOwner = await AssetGroupModel.isOwner(groupId, userId);
    if (!isOwner) {
      throw new Error('Asset group not found or not owned by user');
    }

    // Validate parent if being changed
    if (updates.parent_id !== undefined) {
      if (updates.parent_id === groupId) {
        throw new Error('Group cannot be its own parent');
      }
      if (updates.parent_id) {
        const parentExists = await AssetGroupModel.isOwner(updates.parent_id, userId);
        if (!parentExists) {
          throw new Error('Parent group not found or not owned by user');
        }
      }
    }

    // Check for duplicate name if name is being changed
    if (updates.name) {
      const group = await AssetGroupModel.findById(groupId);
      const existingGroups = await AssetGroupModel.findByUserId(userId, updates.parent_id !== undefined ? updates.parent_id : group.parent_id);
      const duplicate = existingGroups.find(g => g.id !== groupId && g.name.toLowerCase() === updates.name.toLowerCase());
      if (duplicate) {
        throw new Error('A group with this name already exists at this level');
      }
    }

    return await AssetGroupModel.update(groupId, updates);
  }

  /**
   * Delete an asset group
   */
  static async deleteAssetGroup(groupId, userId, moveAssetsTo = null) {
    // Verify ownership
    const isOwner = await AssetGroupModel.isOwner(groupId, userId);
    if (!isOwner) {
      throw new Error('Asset group not found or not owned by user');
    }

    // If moving assets to another group, verify target ownership
    if (moveAssetsTo) {
      const targetOwner = await AssetGroupModel.isOwner(moveAssetsTo, userId);
      if (!targetOwner) {
        throw new Error('Target group not found or not owned by user');
      }

      // Move assets
      const FileModel = require('../../files/models/file.model');
      const assets = await FileModel.findUserAssets(userId, { group_id: groupId }, 1, 1000);
      if (assets.data.length > 0) {
        const assetIds = assets.data.map(a => a.id);
        await FileModel.moveAssets(assetIds, moveAssetsTo, userId);
      }
    }

    return await AssetGroupModel.softDelete(groupId);
  }
}

module.exports = AssetGroupService;
