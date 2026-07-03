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

  // Available payment methods for the checkout UI (configured + active).
  static async listPaymentMethods(req, res) {
    try {
      const data = await financeService.listPaymentMethods();
      return sendSuccess(res, data, 'Available payment methods');
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

  static async feePreview(req, res) {
    try {
      const data = await financeService.getFeePreview(req.user.user_id, req.query);
      return sendSuccess(res, data, 'Fee preview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async paymentReceipt(req, res) {
    try {
      const data = await financeService.getPaymentReceipt(
        req.params.paymentId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Transaction receipt');
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

  // Chart — projected exam fee per institution.
  static async examFeeByInstitution(req, res) {
    try {
      const data = await financeService.examFeeByInstitution(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Exam fee by institution');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Line chart — collected payment totals over time.
  static async paymentTrends(req, res) {
    try {
      const data = await financeService.paymentTrends(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Payment trends');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Table — per-institution fee records (projected + collected).
  static async institutionFeeRecords(req, res) {
    try {
      const { rows, page, limit, total } = await financeService.institutionFeeRecords(
        req.query,
        req.user.user_id
      );
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionOverview(req, res) {
    try {
      const data = await financeService.institutionOverview(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Institution payment overview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionFees(req, res) {
    try {
      const data = await financeService.institutionFees(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Institution fee summary');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionFeePreview(req, res) {
    try {
      const data = await financeService.institutionFeePreview(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Institution fee preview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionCheckout(req, res) {
    try {
      const row = await financeService.createInstitutionCheckout(req.user.user_id, req.body);
      return sendSuccess(res, row, 'Payment intent created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listInstitutionPayments(req, res) {
    try {
      const { rows, page, limit, total } = await financeService.listInstitutionPayments(
        req.query,
        req.user.user_id
      );
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionPaymentReceipt(req, res) {
    try {
      const data = await financeService.getInstitutionPaymentReceipt(
        req.params.paymentId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Transaction receipt');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async foundationOverview(req, res) {
    try {
      const data = await financeService.foundationOverview(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Foundation finance overview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async foundationInstitutionFees(req, res) {
    try {
      const data = await financeService.foundationInstitutionFees(req.query, req.user.user_id);
      return sendSuccess(res, data, 'Institution fee summary');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async foundationInstitutionFeesByUniversity(req, res) {
    try {
      const data = await financeService.foundationInstitutionFeesByUniversity(
        req.params.universityId,
        req.query,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Institution fee summary');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listFoundationInstitutionPayments(req, res) {
    try {
      const { rows, page, limit, total } = await financeService.listFoundationInstitutionPayments(
        req.params.universityId,
        req.query,
        req.user.user_id
      );
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = FinanceController;
