const registrationService = require('../services/registration.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class RegistrationController {
  static async institutionCreate(req, res) {
    try {
      const row = await registrationService.institutionCreate(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Registration created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionPatch(req, res) {
    try {
      const row = await registrationService.institutionPatch(
        req.params.registrationId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, row, 'Registration updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionList(req, res) {
    try {
      const { rows, page, limit, total } = await registrationService.institutionList(req.query, req.user.user_id);
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionApprove(req, res) {
    try {
      const row = await registrationService.institutionApprove(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, row, 'Registration approved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionReject(req, res) {
    try {
      const row = await registrationService.institutionReject(req.params.registrationId, req.body, req.user.user_id);
      return sendSuccess(res, row, 'Registration rejected');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async claimCode(req, res) {
    try {
      const row = await registrationService.claimCode(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Code claimed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getMeCurrent(req, res) {
    try {
      const data = await registrationService.getMeCurrent(req.user.user_id);
      return sendSuccess(res, data, 'Current registration');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async confirmSubjects(req, res) {
    try {
      const row = await registrationService.confirmSubjects(req.user.user_id, req.body);
      return sendSuccess(res, row, 'Subjects confirmed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async submit(req, res) {
    try {
      const row = await registrationService.submitForReview(req.user.user_id);
      return sendSuccess(res, row, 'Submitted for review');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async dashboardAccess(req, res) {
    try {
      const data = await registrationService.getDashboardAccess(req.user.user_id);
      return sendSuccess(res, data, 'Dashboard access');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async numberingPreview(req, res) {
    try {
      const data = await registrationService.numberingPreview(req.params.sessionId, req.user.user_id);
      return sendSuccess(res, data, 'Numbering preview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = RegistrationController;
