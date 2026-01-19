const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaign.controller');
const validationMiddleware = require('../middleware/validation.middleware');
const { authenticate } = require('../../../shared/middleware/authenticate.middleware');
const { requireRole } = require('../../../shared/middleware/rbac.middleware');

// Public routes
router.get('/', (req, res) => campaignController.getActiveCampaigns(req, res));

router.get('/:slug', (req, res) => campaignController.getCampaign(req, res));

router.get('/:id/stats', (req, res) => campaignController.getCampaignStats(req, res));

// Admin routes
router.post('/',
  authenticate,
  requireRole("admin"),
  validationMiddleware.validateCampaignData,
  (req, res) => campaignController.createCampaign(req, res)
);

router.put('/:id',
  authenticate,
  requireRole("admin"),
  validationMiddleware.validateCampaignUpdate,
  (req, res) => campaignController.updateCampaign(req, res)
);

router.delete('/:id',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.deleteCampaign(req, res)
);

router.post('/:id/restore',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.restoreCampaign(req, res)
);

router.get('/admin/all',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.getAllCampaigns(req, res)
);

router.get('/admin/:id',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.getCampaignById(req, res)
);

router.get('/admin/:id/analytics',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.getCampaignAnalytics(req, res)
);

router.get('/admin/summary/stats',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.getCampaignSummaryStats(req, res)
);

router.put('/admin/:id/status',
  authenticate,
  requireRole("admin"),
  validationMiddleware.validateStatusUpdate,
  (req, res) => campaignController.toggleCampaignStatus(req, res)
);

router.get('/admin/:id/donors',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.getCampaignDonors(req, res)
);

// Campaign payment configuration routes
router.get('/:id/payment-config',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.getCampaignPaymentConfig(req, res)
);

router.put('/:id/payment-methods',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.updateCampaignPaymentMethods(req, res)
);

router.put('/:id/bank-accounts',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.updateCampaignBankAccounts(req, res)
);

// Expense breakdown document routes
router.post('/:id/expense-breakdown',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.uploadExpenseBreakdown(req, res)
);

router.delete('/:id/expense-breakdown',
  authenticate,
  requireRole("admin"),
  (req, res) => campaignController.removeExpenseBreakdown(req, res)
);

module.exports = router; 