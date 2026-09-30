const resultsReleaseService = require('../services/results-release.service');
const AdminAuditService = require('../../admin/services/adminAudit.service');
const { sendSuccess, sendError } = require('../../../utils/utils/response');
const { OK, INTERNAL_SERVER_ERROR } = require('../../../utils/constants/statusCodes');

function statusOf(err) {
  return err.status || err.statusCode || INTERNAL_SERVER_ERROR;
}

class ResultsReleaseController {
  static async releaseToInstitutions(req, res) {
    try {
      const payload = {
        ...req.body,
        session_id: req.params.sessionId || req.body.session_id,
      };
      const data = await resultsReleaseService.releaseToInstitutions(req.user.user_id, payload);
      AdminAuditService.log({
        actorUserId: req.user.user_id,
        action: 'results.release_to_institutions',
        resourceType: 'results_release',
        resourceId: payload.session_id,
        details: payload,
        req,
      });
      return sendSuccess(res, data, 'Results release status updated for institutions', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getInstitutionResults(req, res) {
    try {
      const query = {
        ...req.query,
        session_id: req.params.sessionId || req.query.session_id,
      };
      const data = await resultsReleaseService.getInstitutionResults(req.user.user_id, query);
      return sendSuccess(res, data, 'Institution student results', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async releaseToStudents(req, res) {
    try {
      const payload = {
        ...req.body,
        session_id: req.params.sessionId || req.body.session_id,
      };
      const data = await resultsReleaseService.releaseToStudents(req.user.user_id, payload);
      AdminAuditService.log({
        actorUserId: req.user.user_id,
        action: 'results.release_to_students',
        resourceType: 'results_release',
        resourceId: payload.session_id,
        details: payload,
        req,
      });
      return sendSuccess(res, data, 'Results released to students successfully', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }
}

module.exports = ResultsReleaseController;
