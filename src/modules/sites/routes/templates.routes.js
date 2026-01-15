const router = require('express').Router();
const TemplateController = require('../controllers/template.controller');
const { requireAuth } = require('../../../shared/middleware/rbac.middleware');
const { optionalAuth } = require('../../../shared/middleware/optional-auth.middleware');
const { body } = require('express-validator');
const { validate } = require('../../../shared/validations/validator');

/**
 * Template routes with optional auth
 * If user is authenticated, only their templates are returned
 * If not authenticated, returns all active templates (for public browsing)
 */
router.get('/', optionalAuth, TemplateController.getAllTemplates);
router.get('/:templateId', optionalAuth, TemplateController.getTemplateById);

/**
 * Protected template routes (auth required for creating)
 */
router.post(
  '/',
  requireAuth,
  [
    body('name').notEmpty().withMessage('Template name is required'),
    body('config').notEmpty().withMessage('Template config is required'),
    body('category').optional().isString(),
    body('description').optional().isString(),
    body('previewImageUrl').optional().isURL().withMessage('Preview image URL must be valid'),
    body('thumbnailUrl').optional().isURL().withMessage('Thumbnail URL must be valid'),
    body('isPremium').optional().isBoolean(),
    validate,
  ],
  TemplateController.createTemplate
);

router.put(
  '/:templateId',
  requireAuth,
  [
    body('name').optional().notEmpty().withMessage('Template name cannot be empty'),
    body('config').optional(),
    body('category').optional().isString(),
    body('description').optional().isString(),
    body('previewImageUrl').optional().isURL().withMessage('Preview image URL must be valid'),
    body('thumbnailUrl').optional().isURL().withMessage('Thumbnail URL must be valid'),
    body('isPremium').optional().isBoolean(),
    validate,
  ],
  TemplateController.updateTemplate
);

router.post(
  '/:templateId/default-pages',
  requireAuth,
  TemplateController.addDefaultPages
);

module.exports = router;

