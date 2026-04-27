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

module.exports = router;
