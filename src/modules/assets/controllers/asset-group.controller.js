const AssetGroupService = require('../services/asset-group.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

/**
 * Map asset group from DB to API response shape
 */
function toAssetGroupResponse(group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    parent_id: group.parent_id,
    color: group.color,
    icon: group.icon,
    sort_order: group.sort_order,
    asset_count: parseInt(group.asset_count || 0),
    created_at: group.created_at,
    updated_at: group.updated_at
  };
}

class AssetGroupController {
  /**
   * GET /api/assets/groups
   * List all asset groups for the authenticated user
   */
  static async getAllGroups(req, res) {
    try {
      const userId = req.user.user_id;
      const parentId = req.query.parent_id === 'null' ? null : req.query.parent_id || null;
      const treeView = req.query.tree === 'true';

      let groups;
      if (treeView) {
        groups = await AssetGroupService.getFolderTree(userId);
      } else {
        groups = await AssetGroupService.getUserAssetGroups(userId, parentId);
      }

      const response = Array.isArray(groups) 
        ? groups.map(toAssetGroupResponse)
        : toAssetGroupResponse(groups);

      sendSuccess(res, response, 'Asset groups retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * GET /api/assets/groups/:groupId
   * Get a specific asset group
   */
  static async getGroupById(req, res) {
    try {
      const { groupId } = req.params;
      const userId = req.user.user_id;

      const group = await AssetGroupService.getAssetGroupById(groupId, userId);
      sendSuccess(res, toAssetGroupResponse(group), 'Asset group retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Asset group not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Unauthorized') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * POST /api/assets/groups
   * Create a new asset group
   */
  static async createGroup(req, res) {
    try {
      const userId = req.user.user_id;
      const { name, description, parent_id, color, icon, sort_order } = req.body;

      if (!name || name.trim().length === 0) {
        return sendError(res, 'Group name is required', BAD_REQUEST);
      }

      const group = await AssetGroupService.createAssetGroup({
        name: name.trim(),
        description,
        parent_id,
        color,
        icon,
        sort_order
      }, userId);

      sendSuccess(res, toAssetGroupResponse(group), 'Asset group created successfully', CREATED);
    } catch (error) {
      if (error.message.includes('already exists')) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * PUT /api/assets/groups/:groupId
   * Update an asset group
   */
  static async updateGroup(req, res) {
    try {
      const { groupId } = req.params;
      const userId = req.user.user_id;
      const { name, description, parent_id, color, icon, sort_order } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (parent_id !== undefined) updates.parent_id = parent_id;
      if (color !== undefined) updates.color = color;
      if (icon !== undefined) updates.icon = icon;
      if (sort_order !== undefined) updates.sort_order = sort_order;

      if (Object.keys(updates).length === 0) {
        return sendError(res, 'No updates provided', BAD_REQUEST);
      }

      const group = await AssetGroupService.updateAssetGroup(groupId, updates, userId);
      sendSuccess(res, toAssetGroupResponse(group), 'Asset group updated successfully', OK);
    } catch (error) {
      if (error.message === 'Asset group not found' || error.message.includes('not owned')) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('already exists') || error.message.includes('cannot be its own parent')) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * DELETE /api/assets/groups/:groupId
   * Delete an asset group
   */
  static async deleteGroup(req, res) {
    try {
      const { groupId } = req.params;
      const userId = req.user.user_id;
      const moveAssetsTo = req.query.move_assets_to || null;

      await AssetGroupService.deleteAssetGroup(groupId, userId, moveAssetsTo);
      sendSuccess(res, null, 'Asset group deleted successfully', OK);
    } catch (error) {
      if (error.message === 'Asset group not found' || error.message.includes('not owned')) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = AssetGroupController;
