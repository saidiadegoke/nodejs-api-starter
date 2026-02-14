const router = require('express').Router();
const ComponentController = require('../controllers/component.controller');
const { requireAuth } = require('../../../shared/middleware/rbac.middleware');
const { body } = require('express-validator');
const { validate } = require('../../../shared/validations/validator');

/**
 * Component Routes
 * 
 * Global component registry API endpoints.
 * Components are stored globally in component_registry table.
 * Component implementations (React code) live in smartstore-app.
 */

/**
 * @route   GET /api/components
 * @desc    Get all components (with optional filters)
 * @access  Public (or Private for authenticated users)
 */
router.get('/', ComponentController.getAllComponents);

/**
 * @route   GET /api/components/system
 * @desc    Get system components (official SmartStore components)
 * @access  Public
 */
router.get('/system', ComponentController.getSystemComponents);

/**
 * @route   GET /api/components/user
 * @desc    Get user-created components (custom + composite)
 * @access  Private (authenticated users)
 */
router.get('/user', requireAuth, ComponentController.getUserComponents);

/**
 * @route   GET /api/components/custom
 * @desc    Get custom components (user-created components based on system components)
 * @access  Private (authenticated users)
 */
router.get('/custom', requireAuth, ComponentController.getCustomComponents);

/**
 * @route   GET /api/components/composite
 * @desc    Get composite components (user-created components that group multiple components)
 * @access  Private (authenticated users)
 */
router.get('/composite', requireAuth, ComponentController.getCompositeComponents);

/**
 * @route   GET /api/components/by-type/:componentType
 * @desc    Get component by component type (e.g., 'hero', 'text')
 * @access  Public (or Private for authenticated users)
 */
router.get('/by-type/:componentType', ComponentController.getComponentByType);

/**
 * @route   GET /api/components/:id
 * @desc    Get component by ID
 * @access  Public (or Private for authenticated users)
 */
router.get('/:id', ComponentController.getComponentById);

/**
 * @route   POST /api/components
 * @desc    Create new component
 * @access  Private (authenticated users)
 */
router.post(
  '/',
  requireAuth,
  [
    body('name').notEmpty().withMessage('Component name is required'),
    body('type').isIn(['system', 'custom', 'composite']).withMessage('Type must be "system", "custom", or "composite"'),
    body('componentType').notEmpty().withMessage('Component type is required (maps to React component in smartstore-app)'),
    body('category').optional().isIn(['layout', 'content', 'marketing', 'ecommerce']).withMessage('Invalid category'),
    body('description').optional().isString(),
    body('config').optional().isObject().withMessage('Config must be an object'),
    validate,
  ],
  ComponentController.createComponent
);

/**
 * @route   PUT /api/components/:id
 * @desc    Update component
 * @access  Private (authenticated users, only their own components)
 */
router.put(
  '/:id',
  requireAuth,
  [
    body('name').optional().notEmpty().withMessage('Component name cannot be empty'),
    body('type').optional().isIn(['system', 'custom', 'composite']).withMessage('Type must be "system", "custom", or "composite"'),
    body('componentType').optional().notEmpty().withMessage('Component type cannot be empty'),
    body('category').optional().isIn(['layout', 'content', 'marketing', 'ecommerce']).withMessage('Invalid category'),
    body('description').optional().isString(),
    body('config').optional().isObject().withMessage('Config must be an object'),
    validate,
  ],
  ComponentController.updateComponent
);

/**
 * @route   DELETE /api/components/:id
 * @desc    Delete component (only user-created, not system components)
 * @access  Private (authenticated users, only their own components)
 */
router.delete('/:id', requireAuth, ComponentController.deleteComponent);

module.exports = router;

