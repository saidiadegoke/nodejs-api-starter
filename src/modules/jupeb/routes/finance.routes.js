const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const FinanceController = require('../controllers/finance.controller');
const PaymentCatalogController = require('../controllers/payment-catalog.controller');

const financeAdmin = [
  requireAuth,
  requirePermission('jupeb.finance.manage'),
];
const jupebStudent = jupebStudentMiddleware();

// Available payment methods for the checkout UI — any authenticated
// user; the checkout offers exactly what an admin has configured.
router.get('/payment-methods', requireAuth, FinanceController.listPaymentMethods);

// Payment catalog — what to pay for (items) + how (structures). The
// active lists drive the "Make Payment" dropdowns.
router.get('/payment-items', requireAuth, PaymentCatalogController.listItems);
router.get('/payment-structures', requireAuth, PaymentCatalogController.listStructures);

router.get('/me/fee-preview', jupebStudent, FinanceController.feePreview);
router.post('/me/checkout', jupebStudent, FinanceController.createCheckout);
router.get('/me/payments', jupebStudent, FinanceController.listMyPayments);
router.get('/me/payments/:paymentId/receipt', jupebStudent, FinanceController.paymentReceipt);

router.get('/payments', financeAdmin, FinanceController.listAdminPayments);
router.get('/registrations/:registrationId/payment-summary', financeAdmin, FinanceController.paymentSummary);
router.post('/registrations/:registrationId/reconcile', financeAdmin, FinanceController.reconcile);
router.get('/reports/session/:sessionId', financeAdmin, FinanceController.sessionReport);

// Analytics — exam fee per institution (chart), payment trends over time
// (line), and the per-institution fee records table (projected + collected).
router.get('/analytics/exam-fee-by-institution', financeAdmin, FinanceController.examFeeByInstitution);
router.get('/analytics/payment-trends', financeAdmin, FinanceController.paymentTrends);
router.get('/analytics/institution-fee-records', financeAdmin, FinanceController.institutionFeeRecords);

// Payment catalog admin CRUD — manage the payment items + structures.
router.get('/admin/payment-items', financeAdmin, PaymentCatalogController.listAllItems);
router.post('/admin/payment-items', financeAdmin, PaymentCatalogController.createItem);
router.patch('/admin/payment-items/:id', financeAdmin, PaymentCatalogController.updateItem);
router.delete('/admin/payment-items/:id', financeAdmin, PaymentCatalogController.deleteItem);
router.get('/admin/payment-structures', financeAdmin, PaymentCatalogController.listAllStructures);
router.post('/admin/payment-structures', financeAdmin, PaymentCatalogController.createStructure);
router.patch('/admin/payment-structures/:id', financeAdmin, PaymentCatalogController.updateStructure);
router.delete('/admin/payment-structures/:id', financeAdmin, PaymentCatalogController.deleteStructure);

module.exports = router;
