const router = require('express').Router();
const { requireAuth } = require('../../shared/middleware/rbac.middleware');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { uploadSingle } = require('../../shared/middleware/upload.middleware');

const AssetGroupController = require('./controllers/asset-group.controller');
const AssetController = require('./controllers/asset.controller');

/**
 * Asset Groups Routes
 */
router.get('/groups', requireAuth, AssetGroupController.getAllGroups);
router.get('/groups/:groupId', requireAuth, AssetGroupController.getGroupById);
router.post(
  '/groups',
  requireAuth,
  [
    body('name').notEmpty().trim().withMessage('Group name is required'),
    body('description').optional().isString(),
    body('parent_id').optional().isUUID(),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
    body('icon').optional().isString(),
    body('sort_order').optional().isInt(),
    validate,
  ],
  AssetGroupController.createGroup
);
router.put(
  '/groups/:groupId',
  requireAuth,
  [
    body('name').optional().trim().notEmpty().withMessage('Group name cannot be empty'),
    body('description').optional().isString(),
    body('parent_id').optional().isUUID(),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
    body('icon').optional().isString(),
    body('sort_order').optional().isInt(),
    validate,
  ],
  AssetGroupController.updateGroup
);
router.delete('/groups/:groupId', requireAuth, AssetGroupController.deleteGroup);

/**
 * Assets Routes
 */
router.get('/usage', requireAuth, AssetController.getUsage);
router.get('/', requireAuth, AssetController.getAllAssets);
router.get('/:assetId/in-use', requireAuth, AssetController.getAssetInUse);
router.get('/:assetId', requireAuth, AssetController.getAssetById);
router.post(
  '/upload',
  requireAuth,
  uploadSingle('file'),
  [
    body('group_id').optional().isUUID(),
    body('tags').optional().isString(),
    body('alt_text').optional().isString(),
    validate,
  ],
  AssetController.uploadAsset
);
router.put(
  '/:assetId',
  requireAuth,
  [
    body('asset_group_id').optional().isUUID(),
    body('tags').optional().custom((value) => {
      if (typeof value === 'string') return true;
      if (Array.isArray(value)) return value.every(tag => typeof tag === 'string');
      return false;
    }),
    body('alt_text').optional().isString(),
    validate,
  ],
  AssetController.updateAsset
);
router.delete('/:assetId', requireAuth, AssetController.deleteAsset);
router.post(
  '/move',
  requireAuth,
  [
    body('asset_ids').isArray().notEmpty().withMessage('asset_ids array is required'),
    body('asset_ids.*').isUUID().withMessage('Each asset_id must be a valid UUID'),
    body('target_group_id').optional().isUUID(),
    validate,
  ],
  AssetController.moveAssets
);
router.post(
  '/batch-tag',
  requireAuth,
  [
    body('asset_ids').isArray().notEmpty().withMessage('asset_ids array is required'),
    body('asset_ids.*').isUUID().withMessage('Each asset_id must be a valid UUID'),
    body('tags_to_add').optional().custom((value) => {
      if (!value) return true;
      if (Array.isArray(value)) return value.every(tag => typeof tag === 'string');
      if (typeof value === 'string') return true;
      return false;
    }),
    body('tags_to_remove').optional().custom((value) => {
      if (!value) return true;
      if (Array.isArray(value)) return value.every(tag => typeof tag === 'string');
      if (typeof value === 'string') return true;
      return false;
    }),
    validate,
  ],
  AssetController.batchUpdateTags
);

module.exports = router;
