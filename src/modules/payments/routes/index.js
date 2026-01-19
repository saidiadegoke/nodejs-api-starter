const express = require('express');
const router = express.Router();

// Import route modules
const paymentRoutes = require('./payment.routes');
const campaignRoutes = require('./campaign.routes');
const paymentMethodRoutes = require('./paymentMethod.routes');
const subscriptionRoutes = require('./subscription.routes');
const planConfigRoutes = require('./planConfig.routes');

// Mount routes
// Note: These are mounted at /payments in main routes, so we use '/' here
// Full paths: /payments/create, /payments/campaigns, /payments/subscriptions, etc.
router.use('/', paymentRoutes); // Mounts /create, /verify/:reference, etc. at /payments
router.use('/campaigns', campaignRoutes);
router.use('/payment-methods', paymentMethodRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/admin/plan-configs', planConfigRoutes);

module.exports = router; 