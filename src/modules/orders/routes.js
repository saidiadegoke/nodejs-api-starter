const router = require('express').Router();
const OrderController = require('./controllers/order.controller');
const LocationController = require('./controllers/location.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth, requireRole } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Customer only
 */
router.post(
  '/',
  requireAuth,
  requireRole('customer'),
  [
    body('title').isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
    body('description').isLength({ min: 10, max: 1000 }).withMessage('Description must be 10-1000 characters'),
    body('category').isIn(['groceries', 'electronics', 'documents', 'medicine', 'clothing', 'other']).withMessage('Invalid category'),
    body('store_name').notEmpty().withMessage('Store name is required'),
    body('store_location.address').notEmpty().withMessage('Store address is required'),
    body('store_location.latitude').isFloat().withMessage('Valid store latitude is required'),
    body('store_location.longitude').isFloat().withMessage('Valid store longitude is required'),
    body('delivery_location.address').notEmpty().withMessage('Delivery address is required'),
    body('delivery_location.latitude').isFloat().withMessage('Valid delivery latitude is required'),
    body('delivery_location.longitude').isFloat().withMessage('Valid delivery longitude is required'),
    body('estimated_item_cost').isInt({ min: 100 }).withMessage('Estimated item cost must be at least 100'),
    validate
  ],
  OrderController.createOrder
);

/**
 * @route   GET /api/orders
 * @desc    List user's orders
 * @access  Private
 */
router.get('/', requireAuth, OrderController.listOrders);

/**
 * @route   GET /api/orders/:order_id
 * @desc    Get order details
 * @access  Private (customer, shopper, dispatcher of this order)
 */
router.get('/:order_id', requireAuth, OrderController.getOrder);

/**
 * @route   POST /api/orders/:order_id/accept
 * @desc    Accept order (shopper or dispatcher)
 * @access  Shopper or Dispatcher
 */
router.post(
  '/:order_id/accept',
  requireAuth,
  requireRole('shopper', 'dispatcher'),
  OrderController.acceptOrder
);

/**
 * @route   POST /api/orders/:order_id/start-shopping
 * @desc    Start shopping
 * @access  Shopper only
 */
router.post(
  '/:order_id/start-shopping',
  requireAuth,
  requireRole('shopper'),
  OrderController.startShopping
);

/**
 * @route   POST /api/orders/:order_id/photos
 * @desc    Upload progress photo
 * @access  Shopper or Dispatcher
 */
router.post(
  '/:order_id/photos',
  requireAuth,
  requireRole('shopper', 'dispatcher'),
  [
    body('file_id').notEmpty().withMessage('file_id is required'),
    body('stage').isIn(['item_found', 'receipt', 'handoff', 'delivery']).withMessage('Invalid stage'),
    validate
  ],
  OrderController.uploadProgressPhoto
);

/**
 * @route   POST /api/orders/:order_id/update-cost
 * @desc    Update actual item cost
 * @access  Shopper only
 */
router.post(
  '/:order_id/update-cost',
  requireAuth,
  requireRole('shopper'),
  [
    body('actual_cost').isInt({ min: 0 }).withMessage('Valid actual cost is required'),
    validate
  ],
  OrderController.updateCost
);

/**
 * @route   POST /api/orders/:order_id/ready-for-pickup
 * @desc    Mark order ready for pickup
 * @access  Shopper only
 */
router.post(
  '/:order_id/ready-for-pickup',
  requireAuth,
  requireRole('shopper'),
  OrderController.markReadyForPickup
);

/**
 * @route   POST /api/orders/:order_id/confirm-pickup
 * @desc    Confirm pickup
 * @access  Dispatcher only
 */
router.post(
  '/:order_id/confirm-pickup',
  requireAuth,
  requireRole('dispatcher'),
  OrderController.confirmPickup
);

/**
 * @route   POST /api/orders/:order_id/complete-delivery
 * @desc    Complete delivery
 * @access  Dispatcher only
 */
router.post(
  '/:order_id/complete-delivery',
  requireAuth,
  requireRole('dispatcher'),
  OrderController.completeDelivery
);

/**
 * @route   POST /api/orders/:order_id/confirm-delivery
 * @desc    Confirm delivery received
 * @access  Customer only
 */
router.post(
  '/:order_id/confirm-delivery',
  requireAuth,
  requireRole('customer'),
  OrderController.confirmDelivery
);

/**
 * @route   POST /api/orders/:order_id/cancel
 * @desc    Cancel order
 * @access  Customer only
 */
router.post(
  '/:order_id/cancel',
  requireAuth,
  requireRole('customer'),
  [
    body('cancellation_reason').isLength({ min: 10, max: 500 }).withMessage('Cancellation reason must be 10-500 characters'),
    validate
  ],
  OrderController.cancelOrder
);

/**
 * @route   POST /api/orders/:order_id/location
 * @desc    Update location for order
 * @access  Shopper or Dispatcher (assigned to order)
 */
router.post(
  '/:order_id/location',
  requireAuth,
  requireRole('shopper', 'dispatcher'),
  OrderController.updateLocation
);

/**
 * @route   GET /api/orders/:order_id/location
 * @desc    Get current location for order
 * @access  Private (customer, shopper, dispatcher of this order)
 */
router.get(
  '/:order_id/location',
  requireAuth,
  LocationController.getCurrentLocation
);

/**
 * @route   GET /api/orders/:order_id/location/history
 * @desc    Get location history for order
 * @access  Private (customer, shopper, dispatcher of this order)
 */
router.get(
  '/:order_id/location/history',
  requireAuth,
  LocationController.getLocationHistory
);

/**
 * @route   GET /api/orders/:order_id/location/trail
 * @desc    Get location trail (for map display)
 * @access  Private (customer, shopper, dispatcher of this order)
 */
router.get(
  '/:order_id/location/trail',
  requireAuth,
  LocationController.getLocationTrail
);

module.exports = router;

