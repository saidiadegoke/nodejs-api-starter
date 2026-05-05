const financeService = require('../services/finance.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class FinanceController {
  static async createCheckout(req, res) {
    try {
      const row = await financeService.createCheckout(req.user.user_id, req.body);
      return sendSuccess(res, row, 'Payment intent created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listMyPayments(req, res) {
    try {
      const { rows, page, limit, total } = await financeService.listMyPayments(req.user.user_id, req.query);
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listAdminPayments(req, res) {
    try {
      const { rows, page, limit, total } = await financeService.listAdminPayments(req.query, req.user.user_id);
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async paymentSummary(req, res) {
    try {
      const data = await financeService.getPaymentSummary(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, data, 'Payment summary');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async reconcile(req, res) {
    try {
      const row = await financeService.reconcile(req.params.registrationId, req.body, req.user.user_id);
      return sendSuccess(res, row, 'Reconciliation recorded', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async sessionReport(req, res) {
    try {
      const data = await financeService.sessionReport(req.params.sessionId, req.user.user_id);
      return sendSuccess(res, data, 'Session finance report');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = FinanceController;
