const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const validationMiddleware = require('../middleware/validation.middleware');
const { authenticate } = require('../../../shared/middleware/authenticate.middleware');
const { optionalAuth } = require('../../../shared/middleware/optional-auth.middleware');
const { requireRole } = require('../../../shared/middleware/rbac.middleware');
const { uploadSingle } = require('../../../shared/middleware/upload.middleware');

router.post(
  '/create',
  optionalAuth,
  validationMiddleware.validatePaymentData,
  (req, res) => paymentController.createPayment(req, res)
);
router.post('/process', (req, res) => paymentController.processPayment(req, res));
router.get('/verify/:reference', (req, res) => paymentController.verifyPayment(req, res));
router.get('/by-reference/:reference', (req, res) => paymentController.getPaymentByReference(req, res));
router.post('/webhook/:processor', (req, res) => paymentController.handleWebhook(req, res));
router.get('/direct-transfer/:paymentId/bank-account', (req, res) =>
  paymentController.getPaymentBankAccount(req, res)
);
router.post('/direct-transfer/:paymentId/upload-receipt', (req, res) =>
  paymentController.uploadProofOfPayment(req, res)
);
router.post(
  '/direct-transfer/:paymentId/submit-receipt',
  uploadSingle('file'),
  (req, res) => paymentController.submitReceiptWithFile(req, res)
);

router.get('/stats', (req, res) => paymentController.getPublicPaymentStats(req, res));

router.post('/callback', (req, res) => paymentController.verifyPayment(req, res));

router.get('/my-payments', authenticate, (req, res) => paymentController.getUserPayments(req, res));
router.get('/my-donations/summary', authenticate, (req, res) =>
  paymentController.getUserDonationSummary(req, res)
);
router.get('/:id', authenticate, (req, res) => paymentController.getPayment(req, res));
router.post('/:id/receipt', authenticate, (req, res) => paymentController.generateReceipt(req, res));

router.get(
  '/admin/all',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => paymentController.getAllPayments(req, res)
);
router.get(
  '/admin/stats',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => paymentController.getPaymentStats(req, res)
);
router.get(
  '/admin/summary',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => paymentController.adminSummary(req, res)
);
router.get(
  '/admin/payment/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => paymentController.getPaymentAdmin(req, res)
);
router.post(
  '/admin/:id/requery',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => paymentController.requeryPayment(req, res)
);
router.post(
  '/admin/:id/refund',
  authenticate,
  requireRole('admin', 'super_admin'),
  validationMiddleware.validateRefundData,
  (req, res) => paymentController.refundPayment(req, res)
);
router.put(
  '/admin/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => paymentController.updatePayment(req, res)
);

module.exports = router;
