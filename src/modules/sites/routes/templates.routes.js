const router = require('express').Router();
const TemplateController = require('../controllers/template.controller');
const { requireAuth } = require('../../../shared/middleware/rbac.middleware');
const { body } = require('express-validator');
const { validate } = require('../../../shared/validations/validator');

/**
 * Template routes - all require auth; responses are limited to the current user (owner).
 * Users only see and manage their own templates.
 */
router.get('/', requireAuth, TemplateController.getAllTemplates);
/** GET /templates/default-page-structure?pageType=home|about|contact|services|store - must be before /:templateId */
router.get('/default-page-structure', requireAuth, TemplateController.getDefaultPageStructure);
/** GET /templates/:templateId/sites - sites using this template (owner-scoped) - must be before /:templateId */
router.get('/:templateId/sites', requireAuth, TemplateController.getSitesUsingTemplate);
router.get('/:templateId', requireAuth, TemplateController.getTemplateById);

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

router.delete('/:templateId', requireAuth, TemplateController.deleteTemplate);

router.post(
  '/:templateId/default-pages',
  requireAuth,
  TemplateController.addDefaultPages
);

module.exports = router;

