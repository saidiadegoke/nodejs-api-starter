const express = require('express');
const router = express.Router();
const SubscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../../../shared/middleware/authenticate.middleware');

// ============================================================================
// Public Routes (No authentication required)
// ============================================================================

/**
 * @route   GET /api/payments/subscriptions/plans
 * @desc    Get available subscription plans (public)
 * @access  Public
 */
router.get('/plans', SubscriptionController.getAvailablePlans);

/**
 * @route   POST /api/payments/subscriptions/webhook
 * @desc    Handle payment provider webhooks (Stripe, PayPal, etc.)
 * @access  Public (verified by signature)
 */
router.post('/webhook', SubscriptionController.webhook);

// ============================================================================
// Protected Routes (Authentication required)
// ============================================================================

// All routes below require authentication
router.use(authenticate);

/**
 * @route   GET /api/payments/subscriptions/current
 * @desc    Get current subscription for user
 * @access  Private
 */
router.get('/current', SubscriptionController.getCurrentSubscription);

/**
 * @route   GET /api/payments/subscriptions/usage
 * @desc    Get current subscription usage (pages, domains, etc.)
 * @access  Private
 */
router.get('/usage', SubscriptionController.getUsage);

/**
 * @route   GET /api/payments/subscriptions/history
 * @desc    Get subscription history for user
 * @access  Private
 */
router.get('/history', SubscriptionController.getHistory);

/**
 * @route   GET /api/payments/subscriptions/invoices
 * @desc    Get subscription invoices/payments
 * @access  Private
 */
router.get('/invoices', SubscriptionController.getInvoices);

/**
 * @route   POST /api/payments/subscriptions/subscribe
 * @desc    Subscribe or upgrade subscription plan (handles both new subscriptions and upgrades)
 * @access  Private
 */
router.post('/subscribe', SubscriptionController.subscribe);

/**
 * @route   POST /api/payments/subscriptions/upgrade
 * @desc    Upgrade subscription plan (requires subscription_id)
 * @access  Private
 * @deprecated Use /subscribe instead
 */
router.post('/upgrade', SubscriptionController.upgrade);

/**
 * @route   POST /api/payments/subscriptions/downgrade
 * @desc    Downgrade subscription plan (scheduled at period end)
 * @access  Private
 */
router.post('/downgrade', SubscriptionController.downgrade);

/**
 * @route   POST /api/payments/subscriptions/cancel
 * @desc    Cancel subscription
 * @access  Private
 */
router.post('/cancel', SubscriptionController.cancel);

module.exports = router;

