const router = require('express').Router();
const OrderController = require('./controllers/order.controller');
const LocationController = require('./controllers/location.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth, requirePermission } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Requires orders.create
 */
router.post(
  '/',
  requireAuth,
  requirePermission('orders.create'),
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
 * @desc    List orders user is involved in (customer, shopper, or dispatcher)
 * @access  Requires orders.view
 */
router.get('/', requireAuth, requirePermission('orders.view'), OrderController.listOrders);

/**
 * @route   GET /api/orders/available
 * @desc    Get orders available to accept (pending_shopper, pending_dispatcher) within radius
 * @access  Requires orders.accept
 */
router.get('/available', requireAuth, requirePermission('orders.accept'), OrderController.getAvailableOrders);

/**
 * @route   GET /api/orders/:order_id
 * @desc    Get order details
 * @access  Requires orders.view (access limited to involved parties)
 */
router.get('/:order_id', requireAuth, requirePermission('orders.view'), OrderController.getOrder);

/**
 * @route   POST /api/orders/:order_id/accept
 * @desc    Accept order as shopper or dispatcher (based on order status)
 * @access  Requires orders.accept
 */
router.post(
  '/:order_id/accept',
  requireAuth,
  requirePermission('orders.accept'),
  OrderController.acceptOrder
);

/**
 * @route   POST /api/orders/:order_id/start-shopping
 * @desc    Start shopping (assigned shopper only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/start-shopping',
  requireAuth,
  requirePermission('orders.update'),
  OrderController.startShopping
);

/**
 * @route   POST /api/orders/:order_id/photos
 * @desc    Upload progress photo (assigned shopper or dispatcher; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/photos',
  requireAuth,
  requirePermission('orders.update'),
  [
    body('file_id').notEmpty().withMessage('file_id is required'),
    body('stage').isIn(['item_found', 'receipt', 'handoff', 'delivery']).withMessage('Invalid stage'),
    validate
  ],
  OrderController.uploadProgressPhoto
);

/**
 * @route   POST /api/orders/:order_id/update-cost
 * @desc    Update actual item cost (assigned shopper only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/update-cost',
  requireAuth,
  requirePermission('orders.update'),
  [
    body('actual_cost').isInt({ min: 0 }).withMessage('Valid actual cost is required'),
    validate
  ],
  OrderController.updateCost
);

/**
 * @route   POST /api/orders/:order_id/ready-for-pickup
 * @desc    Mark order ready for pickup (assigned shopper only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/ready-for-pickup',
  requireAuth,
  requirePermission('orders.update'),
  OrderController.markReadyForPickup
);

/**
 * @route   POST /api/orders/:order_id/confirm-pickup
 * @desc    Confirm pickup (assigned dispatcher only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/confirm-pickup',
  requireAuth,
  requirePermission('orders.update'),
  OrderController.confirmPickup
);

/**
 * @route   POST /api/orders/:order_id/complete-delivery
 * @desc    Complete delivery (assigned dispatcher only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/complete-delivery',
  requireAuth,
  requirePermission('orders.update'),
  OrderController.completeDelivery
);

/**
 * @route   POST /api/orders/:order_id/confirm-delivery
 * @desc    Confirm delivery received (customer only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/confirm-delivery',
  requireAuth,
  requirePermission('orders.update'),
  OrderController.confirmDelivery
);

/**
 * @route   POST /api/orders/:order_id/cancel
 * @desc    Cancel order (customer only; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/cancel',
  requireAuth,
  requirePermission('orders.update'),
  [
    body('cancellation_reason').isLength({ min: 10, max: 500 }).withMessage('Cancellation reason must be 10-500 characters'),
    validate
  ],
  OrderController.cancelOrder
);

/**
 * @route   POST /api/orders/:order_id/location
 * @desc    Update location for order (assigned shopper or dispatcher; service enforces)
 * @access  Requires orders.update
 */
router.post(
  '/:order_id/location',
  requireAuth,
  requirePermission('orders.update'),
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

