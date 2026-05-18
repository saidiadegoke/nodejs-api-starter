const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const FinanceController = require('../controllers/finance.controller');

const financeAdmin = [
  requireAuth,
  requireRole('financial_admin', 'registrar', 'admin', 'super_admin'),
];
const jupebStudent = jupebStudentMiddleware();

router.post('/me/checkout', jupebStudent, FinanceController.createCheckout);
router.get('/me/payments', jupebStudent, FinanceController.listMyPayments);

router.get('/payments', financeAdmin, FinanceController.listAdminPayments);
router.get('/registrations/:registrationId/payment-summary', financeAdmin, FinanceController.paymentSummary);
router.post('/registrations/:registrationId/reconcile', financeAdmin, FinanceController.reconcile);
router.get('/reports/session/:sessionId', financeAdmin, FinanceController.sessionReport);

// Analytics — exam fee per institution (chart), payment trends over time
// (line), and the per-institution fee records table (projected + collected).
router.get('/analytics/exam-fee-by-institution', financeAdmin, FinanceController.examFeeByInstitution);
router.get('/analytics/payment-trends', financeAdmin, FinanceController.paymentTrends);
router.get('/analytics/institution-fee-records', financeAdmin, FinanceController.institutionFeeRecords);

module.exports = router;
